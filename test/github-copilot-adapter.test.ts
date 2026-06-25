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

test("buildCommand includes required flags", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("-p") || cmd.includes("--prompt"));
  assert.ok(cmd.includes("--autopilot"));
  assert.ok(cmd.includes("--max-autopilot-continues"));
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

// --- applyEnv failure modes ---

test("applyEnv throws when copilot-token is missing", () => {
  assert.throws(
    () =>
      adapter.applyEnv({
        anthropicAuthToken: "",
        anthropicBaseUrl: "",
        anthropicModel: "",
        githubToken: "ghs_xxx",
        copilotToken: "",
        litellmBaseUrl: "",
        litellmApiKey: "",
        piModel: "",
      }),
    /copilot-token is required/,
  );
});

test("applyEnv sets COPILOT_GITHUB_TOKEN when token is provided", () => {
  const orig = process.env.COPILOT_GITHUB_TOKEN;
  try {
    adapter.applyEnv({
      anthropicAuthToken: "",
      anthropicBaseUrl: "",
      anthropicModel: "",
      githubToken: "ghs_xxx",
      copilotToken: "ghp_test123",
      litellmBaseUrl: "",
      litellmApiKey: "",
      piModel: "",
    });
    assert.strictEqual(process.env.COPILOT_GITHUB_TOKEN, "ghp_test123");
  } finally {
    if (orig === undefined) delete process.env.COPILOT_GITHUB_TOKEN;
    else process.env.COPILOT_GITHUB_TOKEN = orig;
  }
});

// --- detectBudgetHit ---

test("detectBudgetHit returns true when iteration limit hit in stdout", () => {
  assert.strictEqual(
    adapter.detectBudgetHit("reached maximum number of continuations", "").hit,
    true,
  );
});

test("detectBudgetHit returns true when iteration limit hit in stderr", () => {
  assert.strictEqual(
    adapter.detectBudgetHit("", "Reached Maximum Number Of Continuations").hit,
    true,
  );
});

test("detectBudgetHit returns false for normal output", () => {
  assert.strictEqual(
    adapter.detectBudgetHit("Task completed successfully", "").hit,
    false,
  );
});

test("buildCommand includes --yolo flag for headless execution", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
    promptPath: "/tmp/prompt.txt",
  });
  assert.ok(cmd.includes("--yolo"), "expected --yolo flag for headless CI");
});
