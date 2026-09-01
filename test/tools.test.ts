import assert from "node:assert";
import test from "node:test";

import { getAdapter, resolveConfiguredToolNames, resolveToolName, validateToolName } from "../src/tools/index.js";

// Registry tests
test("getAdapter returns ClaudeCodeAdapter for 'claude-code'", () => {
  const adapter = getAdapter("claude-code");
  assert.strictEqual(adapter.name, "claude-code");
});

test("getAdapter returns GitHubCopilotAdapter for 'github-copilot'", () => {
  const adapter = getAdapter("github-copilot");
  assert.strictEqual(adapter.name, "github-copilot");
});

test("getAdapter returns PiAdapter for 'pi'", () => {
  const adapter = getAdapter("pi");
  assert.strictEqual(adapter.name, "pi");
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

test("resolveToolName supports a scalar tools value", () => {
  assert.strictEqual(resolveToolName(undefined, "pi"), "pi");
});

test("resolveToolName does not treat agents as a runtime harness", () => {
  assert.strictEqual(resolveToolName("agents", ["claude-code"]), "agents");
  assert.throws(() => validateToolName("agents", "config.tools[0]"), /Unknown tool "agents"/);
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

test("resolveConfiguredToolNames includes implicit defaults and per-skill overrides", () => {
  assert.deepStrictEqual(
    resolveConfiguredToolNames(undefined, [{ name: "pi-skill", tool: "pi" }, { name: "default-skill" }]),
    ["pi", "claude-code"],
  );
});

// validateToolName tests
test("validateToolName accepts known tools", () => {
  assert.doesNotThrow(() => validateToolName("claude-code", "test"));
  assert.doesNotThrow(() => validateToolName("github-copilot", "test"));
  assert.doesNotThrow(() => validateToolName("pi", "test"));
});

test("validateToolName throws on unknown tool with clear message", () => {
  assert.throws(() => validateToolName("bad-tool", "config.tools[0]"), /Unknown tool "bad-tool" in config\.tools\[0\]/);
  assert.throws(() => validateToolName("typo", 'skill "review"'), /Supported: claude-code, github-copilot, pi/);
  assert.throws(() => validateToolName("typo", 'skill "review"'), /Check for typos in your \.github\/ai-skills\.yml/);
});
