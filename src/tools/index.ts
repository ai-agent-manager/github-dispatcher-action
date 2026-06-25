import type { ToolAdapter } from "./types.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { GitHubCopilotAdapter } from "./github-copilot.js";

const adapters: ReadonlyMap<string, ToolAdapter> = new Map<string, ToolAdapter>([
  ["claude-code", new ClaudeCodeAdapter()],
  ["github-copilot", new GitHubCopilotAdapter()],
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

export { getAdapter, resolveToolName };
export type { ToolAdapter } from "./types.js";
