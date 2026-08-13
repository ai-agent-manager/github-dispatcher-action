import type { ToolAdapter } from "./types.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { GitHubCopilotAdapter } from "./github-copilot.js";
import { PiAdapter } from "./pi.js";

const adapters: ReadonlyMap<string, ToolAdapter> = new Map<string, ToolAdapter>([
  ["claude-code", new ClaudeCodeAdapter()],
  ["github-copilot", new GitHubCopilotAdapter()],
  ["pi", new PiAdapter()],
]);

/**
 * Look up a tool adapter by name. Throws if the tool is unknown —
 * callers should validate tool names at config-parse time.
 */
function getAdapter(toolName: string): ToolAdapter {
  const adapter = adapters.get(toolName);
  if (!adapter) {
    const known = [...adapters.keys()].join(", ");
    throw new Error(`Unknown tool "${toolName}". Supported tools: ${known}`);
  }
  return adapter;
}

/**
 * Check if tool name valid. Throws clear error with supported list if not.
 */
function validateToolName(toolName: string, source: string): void {
  if (!adapters.has(toolName)) {
    const known = [...adapters.keys()].join(", ");
    throw new Error(
      `Unknown tool "${toolName}" in ${source}. ` +
        `Supported: ${known}. ` +
        `Check for typos in your .github/ai-skills.yml`,
    );
  }
}

/**
 * Resolve the effective tool for a skill.
 *
 * Priority:
 *   1. skill.tool      (per-skill override in ai-skills.yml)
 *   2. config.tools[0] (first item in the global tools list)
 *   3. "claude-code"   (backward-compatible default)
 */
function resolveToolName(skillTool: string | undefined, configTools: unknown): string {
  if (skillTool) return skillTool;
  if (Array.isArray(configTools) && typeof configTools[0] === "string") {
    return configTools[0];
  }
  return "claude-code";
}

export { getAdapter, resolveToolName, validateToolName };
export type { ToolAdapter } from "./types.js";
