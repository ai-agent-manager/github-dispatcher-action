import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

const DEFAULT_MAX_ITERATIONS = 10;
// Copilot signals iteration limit via this pattern on stdout/stderr
// (needs verification against actual CLI output — this is the expected format)
const ITERATION_LIMIT_PATTERN = /reached maximum number of continuations/i;

export class GitHubCopilotAdapter implements ToolAdapter {
  readonly name = "github-copilot";

  applyEnv(inputs: ToolEnvInputs): void {
    // Copilot checks: COPILOT_GITHUB_TOKEN > GH_TOKEN > GITHUB_TOKEN
    // GH_TOKEN is already set by the dispatcher for gh CLI usage.
    // Set COPILOT_GITHUB_TOKEN explicitly so Copilot picks it up first.
    process.env.COPILOT_GITHUB_TOKEN = inputs.githubToken;
  }

  buildCommand(options: ToolRunOptions): string {
    const maxIterations = options.skill.max_iterations ?? DEFAULT_MAX_ITERATIONS;
    // Note: Flags confirmed against actual Copilot CLI output
    // Remove --yes (not supported), --allow-all and --no-ask-user may need adjustment
    return [
      "copilot",
      "-p",
      `"$(cat ${options.promptPath})"`,
      "--autopilot",
      "--max-autopilot-continues",
      String(maxIterations),
    ].join(" ");
  }

  detectBudgetHit(stdout: string, stderr: string): BudgetHitResult {
    return {
      hit: ITERATION_LIMIT_PATTERN.test(stdout) || ITERATION_LIMIT_PATTERN.test(stderr),
    };
  }

  formatBudgetWarning(skill: MatchedSkill): string {
    const maxIterations = skill.max_iterations ?? DEFAULT_MAX_ITERATIONS;
    return (
      `⚠️ **Review truncated** — the \`${maxIterations}\` iteration limit was reached before ` +
      `\`${skill.name}\` finished. Raise \`max_iterations\` for this skill in ` +
      `\`.github/ai-skills.yml\` if you need a more complete review.`
    );
  }
}
