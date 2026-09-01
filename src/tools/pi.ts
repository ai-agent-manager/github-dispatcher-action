import type { ToolAdapter, ToolRunOptions, ToolEnvInputs, ToolEnvironment, BudgetHitResult } from "./types.js";
import type { MatchedSkill } from "../types.js";

/**
 * Pinned pi gateway provider (`pi -e`). Keep in sync with
 * `@earendil-works/pi-coding-agent` in the Dockerfile — 2.3.0 needs pi >= 0.81.0.
 */
const PI_GATEWAY_EXTENSION = "/usr/local/lib/node_modules/pi-provider-litellm/dist/index.js";

export class PiAdapter implements ToolAdapter {
  readonly name = "pi";

  buildEnv(inputs: ToolEnvInputs, baseEnv: ToolEnvironment): ToolEnvironment {
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
    return {
      ...baseEnv,
      LITELLM_BASE_URL: baseUrl.replace(/\/+$/, ""),
      LITELLM_API_KEY: apiKey,
      PI_TELEMETRY: "0",
    };
  }

  buildCommand(options: ToolRunOptions): string[] {
    const model = options.skill.model?.trim() || options.defaultModel.trim();
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
