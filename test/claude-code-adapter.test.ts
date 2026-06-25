import assert from "node:assert";
import test from "node:test";

import { ClaudeCodeAdapter } from "../src/tools/claude-code.js";

const adapter = new ClaudeCodeAdapter();

test("buildCommand uses max_budget_usd from skill", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "claude-code",
      max_budget_usd: 10,
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("--max-budget-usd 10"));
  assert.ok(cmd.includes("claude -p"));
  assert.ok(cmd.includes("--dangerously-skip-permissions"));
});

test("buildCommand defaults budget to 5", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "claude-code",
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("--max-budget-usd 5"));
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
