import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawn } from "node:child_process";

import * as core from "@actions/core";

import type { MatchedSkill } from "./types.js";
import type { ToolEnvironment, ToolRunResult } from "./tools/types.js";
import { getAdapter } from "./tools/index.js";

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DETECTION_TAIL_BYTES = 64 * 1024;
const MAX_DIAGNOSTIC_STDERR_LENGTH = 1_000;

interface CommandResult {
  stdout: string;
  stderr: string;
  stdoutForDetection: string;
  stderrForDetection: string;
  outputTruncated: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

type ExecuteCommand = (
  _bin: string,
  _args: string[],
  _input?: string,
  _environment?: ToolEnvironment,
) => Promise<CommandResult>;
type ReportError = (_message: string) => void;

function retainOutput(current: Buffer, chunk: Buffer, limit: number): Buffer {
  if (current.length >= limit) {
    return current;
  }

  return Buffer.concat([current, chunk.subarray(0, limit - current.length)]);
}

function retainTail(current: Buffer, chunk: Buffer): Buffer {
  const combined = Buffer.concat([current, chunk]);
  return combined.subarray(Math.max(0, combined.length - DETECTION_TAIL_BYTES));
}

function formatExecutionFailure(result: CommandResult, prompt: string, diff: string): string {
  const exitDetail = result.signal ? `signal ${result.signal}` : `exit status ${result.exitCode ?? "unknown"}`;
  const stderr = result.stderr.trim();

  if (!stderr) {
    return exitDetail;
  }

  const promptRedactedStderr = stderr.replaceAll(prompt, "[redacted prompt]");
  const sanitisedStderr = diff ? promptRedactedStderr.replaceAll(diff, "[redacted diff]") : promptRedactedStderr;
  if (sanitisedStderr.length <= MAX_DIAGNOSTIC_STDERR_LENGTH) {
    return `${exitDetail}: ${sanitisedStderr}`;
  }

  return `${exitDetail}: ${sanitisedStderr.slice(0, MAX_DIAGNOSTIC_STDERR_LENGTH)} [truncated]`;
}

function executeCommand(bin: string, args: string[], input?: string, environment?: ToolEnvironment): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // stdin stays a pipe for every tool: claude-code receives the prompt on it
    // and the other tools get an immediate EOF. Never "inherit" — claude-code
    // would block reading the runner's stdin.
    // environment is the tool's credential-isolated env; undefined inherits process.env.
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env: environment });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stdoutTail: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderrTail: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let outputTruncated = false;

    child.stdout.on("data", (chunk: Buffer) => {
      outputTruncated ||= stdout.length + chunk.length > MAX_OUTPUT_BYTES;
      stdout = retainOutput(stdout, chunk, MAX_OUTPUT_BYTES);
      stdoutTail = retainTail(stdoutTail, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = retainOutput(stderr, chunk, MAX_OUTPUT_BYTES);
      stderrTail = retainTail(stderrTail, chunk);
    });
    // A tool that exits before draining stdin would otherwise surface EPIPE.
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({
        stdout: stdout.toString("utf-8"),
        stderr: stderr.toString("utf-8"),
        stdoutForDetection: Buffer.concat([stdout, stdoutTail]).toString("utf-8"),
        stderrForDetection: Buffer.concat([stderr, stderrTail]).toString("utf-8"),
        outputTruncated,
        exitCode,
        signal,
      });
    });

    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

/**
 * Run an AI tool in headless mode against a single skill, returning the
 * skill's output plus a flag indicating whether the budget/iteration cap was hit.
 *
 * If the skill genuinely fails (network, etc.) we return null so the caller
 * can skip it without poisoning the rest of the run.
 */
async function runSkill(
  skill: MatchedSkill,
  diff: string,
  defaultModel = "",
  runCommand: ExecuteCommand = executeCommand,
  reportError: ReportError = core.error,
  environment: ToolEnvironment = process.env,
): Promise<ToolRunResult | null> {
  const adapter = getAdapter(skill.tool);
  const prompt = `Use the ${skill.name} skill. Here is the diff: ${diff}`;
  const promptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-skill-"));
  const promptPath = path.join(promptDirectory, "prompt.txt");
  fs.writeFileSync(promptPath, prompt);

  let output: string;
  let budgetHit: boolean;
  let outputTruncated: boolean;

  try {
    const argv = adapter.buildCommand({ skill, defaultModel, promptPath });
    const [bin, ...args] = argv;
    if (!bin) {
      throw new Error(`Adapter "${adapter.name}" returned an empty command`);
    }

    let commandResult: CommandResult;
    try {
      commandResult = await runCommand(bin, args, skill.tool === "claude-code" ? prompt : undefined, environment);
    } catch {
      reportError(`[run] ${skill.name} failed because the tool could not start.`);
      return null;
    }

    // Check if budget/iteration limit was hit (tool-specific detection). The
    // detection strings include a rolling tail, so markers printed at the end
    // of an over-long stream are still seen; markers in the discarded middle
    // of a stream larger than MAX_OUTPUT_BYTES + DETECTION_TAIL_BYTES are not.
    budgetHit = adapter.detectBudgetHit(commandResult.stdoutForDetection, commandResult.stderrForDetection).hit;
    if (commandResult.exitCode !== 0 && !budgetHit) {
      const detail = formatExecutionFailure(commandResult, prompt, diff);
      reportError(`[run] ${skill.name} failed because the tool exited unsuccessfully (${detail}).`);
      return null;
    }

    output = commandResult.stdout;
    outputTruncated = commandResult.outputTruncated;
    if (outputTruncated) {
      output += `\n\n[Output truncated after ${MAX_OUTPUT_BYTES / (1024 * 1024)} MiB; remaining tool output was discarded.]`;
    }
  } finally {
    fs.rmSync(promptDirectory, { recursive: true, force: true });
  }

  if (budgetHit) {
    output = outputTruncated ? `${output}\n\n` : "";
    output += adapter.formatBudgetWarning(skill);
    const budgetDetail =
      skill.tool === "github-copilot"
        ? `iteration limit (${skill.max_iterations ?? 10})`
        : `budget cap ($${skill.max_budget_usd ?? 5})`;
    core.warning(`[run] ${skill.name} — ${budgetDetail} reached`);
  }

  return { output, budgetHit };
}

/**
 * Post the skill output to the PR according to its autonomy level.
 *   observe → new PR comment
 *   suggest → overwrite the PR description
 *   act     → commit file changes to the PR's source branch
 */
function postResult(skill: MatchedSkill, output: string, prNumber: number, githubToken: string): void {
  const outputPath = path.join(os.tmpdir(), "skill-output.txt");
  fs.writeFileSync(outputPath, output);

  if (skill.autonomy === "observe") {
    execSync(`gh pr comment ${prNumber} --body-file ${outputPath}`, {
      stdio: "inherit", env: { ...process.env, GH_TOKEN: githubToken },
    });
    core.info(`[run] ✓ ${skill.name} — posted as PR comment`);
  } else if (skill.autonomy === "suggest") {
    execSync(`gh pr edit ${prNumber} --body-file ${outputPath}`, {
      stdio: "inherit", env: { ...process.env, GH_TOKEN: githubToken },
    });
    core.info(`[run] ✓ ${skill.name} — PR description updated`);
  } else if (skill.autonomy === "act") {
    commitAndPush(skill, prNumber, githubToken);
  } else {
    core.warning(`[run] ${skill.name} has unknown autonomy "${skill.autonomy}" — skipping post`);
  }
}

/**
 * Commit the skill's file changes back to the PR's source branch.
 *
 * Preconditions (workflow's responsibility — see README):
 *   - `contents: write` permission on the job
 *   - Runner checked out on the PR's head branch (not the merge ref)
 *
 * The commit message includes `[skip ci]` so the resulting push does not
 * re-trigger the dispatcher via `pull_request.synchronize`.
 */
function commitAndPush(skill: MatchedSkill, prNumber: number, githubToken: string): void {
  // No file changes is a valid no-op — many skills run and conclude there
  // is nothing to update. Avoid an empty commit in that case.
  const status = execSync("git status --porcelain", {
    encoding: "utf-8",
  }).trim();
  if (!status) {
    core.info(`[run] ${skill.name} produced no file changes — nothing to commit`);
    return;
  }

  // Resolve the PR's source branch — distinct from the base. This is where
  // we push back. `gh` reads GH_TOKEN from the environment.
  const branch = execSync(`gh pr view ${prNumber} --json headRefName -q .headRefName`, {
    encoding: "utf-8", env: { ...process.env, GH_TOKEN: githubToken },
  }).trim();

  // github-actions[bot] is GitHub's recommended identity for workflow
  // commits. The numeric prefix in the email is the bot account's user ID;
  // GitHub uses it to attribute the commit to the bot in the UI.
  execSync('git config user.name "github-actions[bot]"');
  execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');

  // `[skip ci]` is the loop-prevention belt-and-braces — even though the
  // dispatcher already filters bot-authored comments, this push fires
  // `pull_request.synchronize`, which the dispatcher would otherwise
  // re-run for nothing.
  execSync("git add -A");
  execSync(`git commit -m "chore(${skill.name}): apply skill output [skip ci]"`);
  execSync(`git push origin HEAD:${branch}`);

  core.info(`[run] ✓ ${skill.name} — committed and pushed to ${branch}`);
}

/**
 * Run every matched skill in sequence. Failures of one skill do not stop
 * the others — each skill's success/failure is independent.
 */
async function runAll(
  matched: MatchedSkill[],
  diff: string,
  prNumber: number,
  defaultModel = "",
  toolEnvironments: ReadonlyMap<string, ToolEnvironment> = new Map(),
  githubToken = "",
): Promise<void> {
  for (const skill of matched) {
    core.startGroup(`Running: ${skill.name} (autonomy: ${skill.autonomy})`);
    const environment = toolEnvironments.get(skill.tool);
    if (!environment) throw new Error(`No isolated environment configured for ${skill.tool}`);
    const result = await runSkill(skill, diff, defaultModel, executeCommand, core.error, environment);
    if (result !== null) {
      postResult(skill, result.output, prNumber, githubToken);
    }
    core.endGroup();
  }
}

export { executeCommand, runSkill, postResult, runAll };
