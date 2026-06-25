import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import * as core from "@actions/core";

import type { MatchedSkill } from "./types.js";
import { getAdapter } from "./tools/index.js";

interface RunSkillResult {
  output: string;
  budgetHit: boolean;
}

interface ExecSyncError extends Error {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
}

/**
 * Run an AI tool in headless mode against a single skill, returning the
 * skill's output plus a flag indicating whether the budget/iteration cap was hit.
 *
 * If the skill genuinely fails (network, etc.) we return null so the caller
 * can skip it without poisoning the rest of the run.
 */
function runSkill(skill: MatchedSkill, diff: string): RunSkillResult | null {
  const adapter = getAdapter(skill.tool);
  const prompt = `Use the ${skill.name} skill. Here is the diff: ${diff}`;

  const promptPath = path.join(os.tmpdir(), "prompt.txt");
  fs.writeFileSync(promptPath, prompt);

  const command = adapter.buildCommand({ skill, promptPath });

  let output: string;
  let budgetHit = false;

  try {
    output = execSync(command, {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "pipe"],
    });

    // Check if budget/iteration limit was hit (tool-specific detection)
    const result = adapter.detectBudgetHit(output, "");
    if (result.hit) {
      budgetHit = true;
      output = "";
    }
  } catch (error) {
    const execError = error as ExecSyncError;
    // Defensive — handle a future CLI version that signals budget hit via
    // non-zero exit + stderr instead of the current "exit 0 + stdout" format.
    const stdout = execError.stdout?.toString() ?? "";
    const stderr = execError.stderr?.toString() ?? "";

    const result = adapter.detectBudgetHit(stdout, stderr);
    if (result.hit) {
      output = "";
      budgetHit = true;
    } else {
      core.error(`[run] ${skill.name} failed: ${execError.message}`);
      return null;
    }
  }

  if (budgetHit) {
    output += adapter.formatBudgetWarning(skill);
    core.warning(`[run] ${skill.name} — budget/iteration limit reached`);
  }

  return { output, budgetHit };
}

/**
 * Post the skill output to the PR according to its autonomy level.
 *   observe → new PR comment
 *   suggest → overwrite the PR description
 *   act     → commit file changes to the PR's source branch
 */
function postResult(skill: MatchedSkill, output: string, prNumber: number): void {
  const outputPath = path.join(os.tmpdir(), "skill-output.txt");
  fs.writeFileSync(outputPath, output);

  if (skill.autonomy === "observe") {
    execSync(`gh pr comment ${prNumber} --body-file ${outputPath}`, {
      stdio: "inherit",
    });
    core.info(`[run] ✓ ${skill.name} — posted as PR comment`);
  } else if (skill.autonomy === "suggest") {
    execSync(`gh pr edit ${prNumber} --body-file ${outputPath}`, {
      stdio: "inherit",
    });
    core.info(`[run] ✓ ${skill.name} — PR description updated`);
  } else if (skill.autonomy === "act") {
    commitAndPush(skill, prNumber);
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
function commitAndPush(skill: MatchedSkill, prNumber: number): void {
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
  const branch = execSync(`gh pr view ${prNumber} --json headRefName -q .headRefName`, { encoding: "utf-8" }).trim();

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
function runAll(matched: MatchedSkill[], diff: string, prNumber: number): void {
  for (const skill of matched) {
    core.startGroup(`Running: ${skill.name} (autonomy: ${skill.autonomy})`);
    const result = runSkill(skill, diff);
    if (result !== null) {
      postResult(skill, result.output, prNumber);
    }
    core.endGroup();
  }
}

export { runSkill, postResult, runAll };
