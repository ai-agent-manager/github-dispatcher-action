/**
 * First non-empty trimmed string wins.
 */
function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) return trimmed;
  }
  return "";
}

export interface RawGatewayInputs {
  gatewayBaseUrl?: string;
  gatewayApiKey?: string;
  defaultModel?: string;
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

/**
 * Trim gateway action inputs into one credential set. Adapters map these to
 * vendor env vars at applyEnv time.
 */
function resolveGatewayInputs(raw: RawGatewayInputs): ResolvedGatewayInputs {
  return {
    gatewayBaseUrl: firstNonEmpty(raw.gatewayBaseUrl),
    gatewayApiKey: firstNonEmpty(raw.gatewayApiKey),
    defaultModel: firstNonEmpty(raw.defaultModel),
    copilotTokenOverride: firstNonEmpty(raw.copilotToken),
  };
}

export { firstNonEmpty, resolveGatewayInputs };
