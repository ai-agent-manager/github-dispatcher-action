import assert from "node:assert";
import test from "node:test";

import { ClaudeCodeAdapter } from "../src/tools/claude-code.js";

const adapter = new ClaudeCodeAdapter();

const runOpts = {
  promptPath: "/tmp/prompt.txt",
  prompt: "Use the review skill.",
};

const emptyEnv = {
  gatewayBaseUrl: "",
  gatewayApiKey: "",
  defaultModel: "",
  githubToken: "ghs_xxx",
  copilotTokenOverride: "",
};

test("buildCommand uses max_budget_usd from skill", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "claude-code",
      max_budget_usd: 10,
    },
  });
  assert.strictEqual(cmd[0], "claude");
  assert.ok(cmd.includes("-p"));
  assert.ok(cmd.includes("--dangerously-skip-permissions"));
  assert.strictEqual(cmd[cmd.indexOf("--max-budget-usd") + 1], "10");
  assert.strictEqual(cmd.at(-1), runOpts.prompt);
});

test("buildCommand defaults budget to 5", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "claude-code",
    },
  });
  assert.strictEqual(cmd[cmd.indexOf("--max-budget-usd") + 1], "5");
});

test("detectBudgetHit returns true for budget pattern in stdout", () => {
  assert.strictEqual(adapter.detectBudgetHit("Error: Exceeded USD budget (5.00)", "").hit, true);
});

test("detectBudgetHit returns true for budget pattern in stderr", () => {
  assert.strictEqual(adapter.detectBudgetHit("", "Exceeded USD budget").hit, true);
});

test("detectBudgetHit returns false for normal output", () => {
  assert.strictEqual(adapter.detectBudgetHit("All good", "").hit, false);
});

test("formatBudgetWarning includes skill name and budget", () => {
  const warning = adapter.formatBudgetWarning({
    name: "code-review",
    autonomy: "observe",
    trigger: "pull_request.opened",
    tool: "claude-code",
    max_budget_usd: 7,
  });
  assert.ok(warning.includes("$7"));
  assert.ok(warning.includes("code-review"));
  assert.ok(warning.includes("max_budget_usd"));
});

test("formatBudgetWarning uses default budget when not set", () => {
  const warning = adapter.formatBudgetWarning({
    name: "test-skill",
    autonomy: "observe",
    trigger: "pull_request.opened",
    tool: "claude-code",
  });
  assert.ok(warning.includes("$5"));
});

// --- applyEnv failure modes ---

test("applyEnv throws when gateway-api-key is missing", () => {
  assert.throws(() => adapter.applyEnv(emptyEnv), /gateway-api-key is required/);
});

test("applyEnv maps gateway inputs to ANTHROPIC_* env vars", () => {
  const origToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const origBase = process.env.ANTHROPIC_BASE_URL;
  const origModel = process.env.ANTHROPIC_MODEL;
  try {
    adapter.applyEnv({
      ...emptyEnv,
      gatewayApiKey: "sk-ant-test123",
      gatewayBaseUrl: "https://gateway.example.com",
      defaultModel: "opusplan",
    });
    assert.strictEqual(process.env.ANTHROPIC_AUTH_TOKEN, "sk-ant-test123");
    assert.strictEqual(process.env.ANTHROPIC_BASE_URL, "https://gateway.example.com");
    assert.strictEqual(process.env.ANTHROPIC_MODEL, "opusplan");
  } finally {
    if (origToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = origToken;
    if (origBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = origBase;
    if (origModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = origModel;
  }
});
