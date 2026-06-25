import assert from "node:assert";
import test from "node:test";

import { GitHubCopilotAdapter } from "../src/tools/github-copilot.js";

const adapter = new GitHubCopilotAdapter();

test("buildCommand uses max_iterations from skill", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
      max_iterations: 25,
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("--max-autopilot-continues 25"));
  assert.ok(cmd.includes("copilot"));
  assert.ok(cmd.includes("--autopilot"));
});

test("buildCommand defaults max_iterations to 10", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("--max-autopilot-continues 10"));
});

test("buildCommand includes all required flags", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("--yes"));
  assert.ok(cmd.includes("--allow-all"));
  assert.ok(cmd.includes("--no-ask-user"));
  assert.ok(cmd.includes("--prompt"));
});

test("formatBudgetWarning includes skill name and iteration count", () => {
  const warning = adapter.formatBudgetWarning({
    name: "code-review",
    autonomy: "observe",
    trigger: "pull_request.opened",
    tool: "github-copilot",
    max_iterations: 20,
  });
  assert.ok(warning.includes("20"));
  assert.ok(warning.includes("code-review"));
  assert.ok(warning.includes("max_iterations"));
});

test("formatBudgetWarning uses default iteration count when not set", () => {
  const warning = adapter.formatBudgetWarning({
    name: "test-skill",
    autonomy: "observe",
    trigger: "pull_request.opened",
    tool: "github-copilot",
  });
  assert.ok(warning.includes("10"));
});
