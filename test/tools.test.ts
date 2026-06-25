import assert from "node:assert";
import test from "node:test";

import { getAdapter, resolveToolName } from "../src/tools/index.js";

// Registry tests
test("getAdapter returns ClaudeCodeAdapter for 'claude-code'", () => {
  const adapter = getAdapter("claude-code");
  assert.strictEqual(adapter.name, "claude-code");
});

test("getAdapter returns GitHubCopilotAdapter for 'github-copilot'", () => {
  const adapter = getAdapter("github-copilot");
  assert.strictEqual(adapter.name, "github-copilot");
});

test("getAdapter throws for unknown tool", () => {
  assert.throws(() => getAdapter("unknown-tool"), /Unknown tool/);
  assert.throws(() => getAdapter("unknown-tool"), /Supported tools:/);
});

// resolveToolName tests
test("resolveToolName prefers skill.tool over config.tools[0]", () => {
  assert.strictEqual(resolveToolName("github-copilot", ["claude-code"]), "github-copilot");
});

test("resolveToolName falls back to config.tools[0]", () => {
  assert.strictEqual(resolveToolName(undefined, ["github-copilot"]), "github-copilot");
});

test("resolveToolName defaults to claude-code when neither is set", () => {
  assert.strictEqual(resolveToolName(undefined, undefined), "claude-code");
  assert.strictEqual(resolveToolName(undefined, null), "claude-code");
});

test("resolveToolName handles empty tools array", () => {
  assert.strictEqual(resolveToolName(undefined, []), "claude-code");
});

test("resolveToolName handles non-string tools[0]", () => {
  assert.strictEqual(resolveToolName(undefined, [42]), "claude-code");
  assert.strictEqual(resolveToolName(undefined, [null]), "claude-code");
});
