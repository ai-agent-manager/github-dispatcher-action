import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

/**
 * Pinned pi gateway provider (`pi -e`). Keep in sync with
 * `@earendil-works/pi-coding-agent` in the Dockerfile — 2.0.5 needs pi >= 0.81.0.
 */
const PI_GATEWAY_EXTENSION = "npm:pi-provider-litellm@2.0.5";

export class PiAdapter implements ToolAdapter {
  readonly name = "pi";
  private defaultModel = "";

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
    process.env.PI_TELEMETRY = "0";
    this.defaultModel = inputs.defaultModel.trim();
  }

  buildCommand(options: ToolRunOptions): string[] {
    const model = options.skill.model?.trim() || this.defaultModel;
    const argv = [
      "pi",
      "-e",
      PI_GATEWAY_EXTENSION,
      "-p",
      // --approve: required in headless CI so pi does not prompt to trust
      // project-local files. See README caution (fork PRs / .pi/ settings).
      "-a",
      "--no-session",
      "--skill",
      `.agents/skills/${options.skill.name}`,
      `@${options.promptPath}`,
    ];
    if (model) {
      argv.splice(argv.indexOf("--skill"), 0, "--model", model);
    }
    return argv;
  }

  detectBudgetHit(): BudgetHitResult {
    // Pi print mode has no budget or iteration cap.
    return { hit: false };
  }

  formatBudgetWarning(skill: MatchedSkill): string {
    return (
      `⚠️ **Review may be incomplete** — \`${skill.name}\` finished without a clear ` +
      `completion signal from the pi harness. Check workflow logs if output looks truncated.`
    );
  }
}
