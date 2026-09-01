import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, ToolEnvironment, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

// Claude Code signals budget exhaustion by exiting 0 with this string
// written to stdout. The probe in `probe-budget.js` (local test) confirmed
// the exact format: "Error: Exceeded USD budget (X.XX)".
const BUDGET_HIT_PATTERN = /Exceeded USD budget/i;
const DEFAULT_BUDGET_USD = 5;

export class ClaudeCodeAdapter implements ToolAdapter {
  readonly name = "claude-code";

  buildEnv(inputs: ToolEnvInputs, baseEnv: ToolEnvironment): ToolEnvironment {
    if (!inputs.gatewayApiKey) {
      throw new Error(
        "gateway-api-key is required when using claude-code tools. " +
          "Set secrets.AI_GATEWAY_API_KEY (gateway API key).",
      );
    }

    // Last-mile vendor mapping — Claude Code reads ANTHROPIC_* env vars.
    const environment: ToolEnvironment = {
      ...baseEnv,
      ANTHROPIC_AUTH_TOKEN: inputs.gatewayApiKey,
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
      DISABLE_TELEMETRY: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
    };
    if (inputs.gatewayBaseUrl) {
      environment.ANTHROPIC_BASE_URL = inputs.gatewayBaseUrl;
    }
    if (inputs.defaultModel) {
      environment.ANTHROPIC_MODEL = inputs.defaultModel;
    }
    return environment;
  }

  buildCommand(options: ToolRunOptions): string[] {
    const budget = options.skill.max_budget_usd ?? DEFAULT_BUDGET_USD;
    const argv = ["claude", "-p", "--dangerously-skip-permissions", "--max-budget-usd", String(budget)];
    if (options.skill.model?.trim()) {
      argv.push("--model", options.skill.model.trim());
    }
    argv.push(options.prompt);
    return argv;
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
