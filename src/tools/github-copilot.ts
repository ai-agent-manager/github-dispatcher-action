import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

const DEFAULT_MAX_ITERATIONS = 10;
// Detects when Copilot stopped because it hit the max iteration limit.
// TODO: Verify exact CLI output — the Copilot CLI source is closed and the
//       exact message text has not been confirmed. If this pattern doesn't
//       match, cap-hits will silently look like successful runs.
const ITERATION_LIMIT_PATTERN = /reached maximum number of continuations/i;

export class GitHubCopilotAdapter implements ToolAdapter {
  readonly name = "github-copilot";

  applyEnv(inputs: ToolEnvInputs): void {
    // Prefer explicit Copilot override (mixed gateway + Copilot repos); otherwise
    // reuse the shared gateway-api-key auth hook (PAT for Copilot-only setups).
    const token = inputs.copilotTokenOverride.trim() || inputs.gatewayApiKey.trim();

    if (!token) {
      throw new Error(
        "gateway-api-key (or copilot-token override) is required when using github-copilot tools. " +
          "For Copilot-only repos set secrets.AI_GATEWAY_API_KEY to a fine-grained user PAT with " +
          "Copilot Requests. When mixing a gateway harness with Copilot, keep the gateway key in " +
          "AI_GATEWAY_API_KEY and set secrets.COPILOT_GITHUB_TOKEN as the copilot-token override.",
      );
    }

    // Last-mile vendor mapping — Copilot CLI checks COPILOT_GITHUB_TOKEN first.
    process.env.COPILOT_GITHUB_TOKEN = token;
  }

  buildCommand(options: ToolRunOptions): string[] {
    const maxIterations = options.skill.max_iterations ?? DEFAULT_MAX_ITERATIONS;
    return [
      "copilot",
      "-p",
      options.prompt,
      "--autopilot",
      "--yolo",
      "--max-autopilot-continues",
      String(maxIterations),
    ];
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
