import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

/** Default model routed via LiteLLM. Override per skill or via action input. */
const DEFAULT_MODEL = "litellm/claude-sonnet-4-6";

/**
 * Pinned LiteLLM extension loaded via `pi -e`.
 * Keep in sync with `@earendil-works/pi-coding-agent` in the Dockerfile —
 * 2.0.5 requires pi >= 0.81.0.
 */
const LITELLM_EXTENSION = "npm:pi-provider-litellm@2.0.5";

export class PiLiteLLMAdapter implements ToolAdapter {
  readonly name = "pi";

  applyEnv(inputs: ToolEnvInputs): void {
    const baseUrl = inputs.gatewayBaseUrl.trim();
    const apiKey = inputs.gatewayApiKey.trim();

    if (!baseUrl) {
      throw new Error(
        "gateway-base-url is required when using pi tools. " +
          "Set vars.AI_GATEWAY_URL (e.g. https://gateway.example.com).",
      );
    }
    if (!apiKey) {
      throw new Error(
        "gateway-api-key is required when using pi tools. " + "Set secrets.AI_GATEWAY_API_KEY (gateway API key).",
      );
    }

    // Last-mile vendor mapping — pi-provider-litellm reads LITELLM_* env vars.
    process.env.LITELLM_BASE_URL = baseUrl.replace(/\/+$/, "");
    process.env.LITELLM_API_KEY = apiKey;

    // Disable pi install telemetry in CI.
    process.env.PI_TELEMETRY = "0";

    if (inputs.defaultModel) {
      process.env.PI_LITELLM_DEFAULT_MODEL = inputs.defaultModel;
    }
  }

  private resolveModel(skill: MatchedSkill): string {
    if (skill.model) {
      return skill.model.includes("/") ? skill.model : `litellm/${skill.model}`;
    }
    const fromEnv = process.env.PI_LITELLM_DEFAULT_MODEL?.trim();
    if (fromEnv) {
      return fromEnv.includes("/") ? fromEnv : `litellm/${fromEnv}`;
    }
    return DEFAULT_MODEL;
  }

  buildCommand(options: ToolRunOptions): string[] {
    const modelFlag = this.resolveModel(options.skill);

    return [
      "pi",
      "-e",
      LITELLM_EXTENSION,
      "-p",
      // --approve: required in headless CI so pi does not prompt to trust
      // project-local files. See README caution (fork PRs / .pi/ settings).
      "-a",
      "--no-session",
      "--model",
      modelFlag,
      "--skill",
      options.skill.name,
      `@${options.promptPath}`,
    ];
  }

  detectBudgetHit(): BudgetHitResult {
    // Pi print mode has no stable budget-exhaustion signal yet — treat as uncapped.
    return { hit: false };
  }

  formatBudgetWarning(skill: MatchedSkill): string {
    return (
      `⚠️ **Review may be incomplete** — \`${skill.name}\` finished without a clear ` +
      `completion signal from the pi harness. Check workflow logs if output looks truncated.`
    );
  }
}
