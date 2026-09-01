export interface RawGatewayInputs {
  gatewayBaseUrl?: string;
  gatewayApiKey?: string;
  defaultModel?: string;
  /** Deprecated Claude aliases */
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  anthropicModel?: string;
  /** Deprecated pi / LiteLLM aliases */
  litellmBaseUrl?: string;
  litellmApiKey?: string;
  piModel?: string;
  /** Optional Copilot PAT override for mixed-harness repos */
  copilotToken?: string;
}

export interface ResolvedGatewayInputs {
  /** Shared gateway URL for Claude Code + pi. */
  gatewayBaseUrl: string;
  /**
   * Shared auth hook: gateway API key for Claude/pi, or Copilot user PAT when
   * running github-copilot without a copilot-token override.
   */
  gatewayApiKey: string;
  /** Shared default model for Claude Code + pi. */
  defaultModel: string;
  /**
   * Optional Copilot-only override. When set, github-copilot uses this instead
   * of gatewayApiKey (needed when a repo mixes a gateway harness with Copilot).
   */
  copilotTokenOverride: string;
}

function trimInput(value?: string): string {
  return value?.trim() ?? "";
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = trimInput(value);
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Collapse canonical and deprecated action inputs into one credential set.
 * Precedence is gateway-*, then LiteLLM/pi aliases, then Anthropic aliases.
 */
function resolveGatewayInputs(raw: RawGatewayInputs): ResolvedGatewayInputs {
  return {
    gatewayBaseUrl: firstNonEmpty(raw.gatewayBaseUrl, raw.litellmBaseUrl, raw.anthropicBaseUrl),
    gatewayApiKey: firstNonEmpty(raw.gatewayApiKey, raw.litellmApiKey, raw.anthropicAuthToken),
    defaultModel: firstNonEmpty(raw.defaultModel, raw.piModel, raw.anthropicModel),
    copilotTokenOverride: trimInput(raw.copilotToken),
  };
}

export { resolveGatewayInputs };
