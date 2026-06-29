import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

// Claude Code signals budget exhaustion by exiting 0 with this string
// written to stdout. The probe in `probe-budget.js` (local test) confirmed
// the exact format: "Error: Exceeded USD budget (X.XX)".
const BUDGET_HIT_PATTERN = /Exceeded USD budget/i;
const DEFAULT_BUDGET_USD = 5;

export class ClaudeCodeAdapter implements ToolAdapter {
  readonly name = "claude-code";

  applyEnv(inputs: ToolEnvInputs): void {
    if (!inputs.anthropicAuthToken) {
      throw new Error(
        "anthropic-auth-token is required when using claude-code tools. " +
          "Set it in your workflow's with: block.",
      );
    }

    process.env.ANTHROPIC_AUTH_TOKEN = inputs.anthropicAuthToken;
    if (inputs.anthropicBaseUrl) {
      process.env.ANTHROPIC_BASE_URL = inputs.anthropicBaseUrl;
    }
    if (inputs.anthropicModel) {
      process.env.ANTHROPIC_MODEL = inputs.anthropicModel;
    }

    // Lock down telemetry and experimental features for predictable runs.
    process.env.DISABLE_NON_ESSENTIAL_MODEL_CALLS = "1";
    process.env.DISABLE_TELEMETRY = "1";
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = "1";
  }

  buildCommand(options: ToolRunOptions): string {
    const budget = options.skill.max_budget_usd ?? DEFAULT_BUDGET_USD;
    return `claude-code -p --dangerously-skip-permissions --max-budget-usd ${budget} "$(cat ${options.promptPath})"`;
  }

  detectBudgetHit(stdout: string, stderr: string): BudgetHitResult {
    return {
      hit: BUDGET_HIT_PATTERN.test(stdout) || BUDGET_HIT_PATTERN.test(stderr),
    };
  }

  formatBudgetWarning(skill: MatchedSkill): string {
    const budget = skill.max_budget_usd ?? DEFAULT_BUDGET_USD;
    return (
      `⚠️ **Review truncated** — the \`$${budget}\` budget cap was reached before ` +
      `\`${skill.name}\` finished. Raise \`max_budget_usd\` for this skill in ` +
      `\`.github/ai-skills.yml\` if you need a more complete review.`
    );
  }
}
