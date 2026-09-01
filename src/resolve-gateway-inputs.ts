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

function trimInput(value?: string): string {
  return value?.trim() ?? "";
}

/**
 * Trim the shared v2 action inputs into one harness-neutral configuration.
 */
function resolveGatewayInputs(raw: RawGatewayInputs): ResolvedGatewayInputs {
  return {
    gatewayBaseUrl: trimInput(raw.gatewayBaseUrl),
    gatewayApiKey: trimInput(raw.gatewayApiKey),
    defaultModel: trimInput(raw.defaultModel),
    copilotTokenOverride: trimInput(raw.copilotToken),
  };
}

export { resolveGatewayInputs };
