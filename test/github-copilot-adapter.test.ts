import assert from "node:assert";
import test from "node:test";

import { GitHubCopilotAdapter } from "../src/tools/github-copilot.js";

const adapter = new GitHubCopilotAdapter();

const runOpts = {
  defaultModel: "",
  promptPath: "/tmp/prompt.txt",
  prompt: "Use the review skill.",
};

const emptyEnv = {
  gatewayBaseUrl: "",
  gatewayApiKey: "",
  defaultModel: "",
  copilotTokenOverride: "",
};

test("buildCommand uses max_iterations from skill", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
      max_iterations: 25,
    },
  });
  assert.strictEqual(cmd[0], "copilot");
  assert.ok(cmd.includes("--autopilot"));
  assert.strictEqual(cmd[cmd.indexOf("--max-autopilot-continues") + 1], "25");
  assert.strictEqual(cmd[cmd.indexOf("-p") + 1], runOpts.prompt);
});

test("buildCommand defaults max_iterations to 10", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
  });
  assert.strictEqual(cmd[cmd.indexOf("--max-autopilot-continues") + 1], "10");
});

test("buildCommand includes required flags", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
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

// --- buildEnv failure modes ---

test("buildEnv throws when gateway-api-key and copilot override are missing", () => {
  assert.throws(() => adapter.buildEnv(emptyEnv, {}), /gateway-api-key \(or copilot-token override\) is required/);
});

test("buildEnv uses gateway-api-key as COPILOT_GITHUB_TOKEN when no override", () => {
  const environment = adapter.buildEnv({ ...emptyEnv, gatewayApiKey: "github_pat_shared" }, {});
  assert.strictEqual(environment.COPILOT_GITHUB_TOKEN, "github_pat_shared");
});

test("buildEnv prefers copilot-token override over gateway-api-key", () => {
  const environment = adapter.buildEnv({
    ...emptyEnv,
    gatewayApiKey: "gateway-key",
    copilotTokenOverride: "github_pat_override",
  }, {});
  assert.strictEqual(environment.COPILOT_GITHUB_TOKEN, "github_pat_override");
});

// --- detectBudgetHit ---

test("detectBudgetHit returns true when iteration limit hit in stdout", () => {
  assert.strictEqual(adapter.detectBudgetHit("reached maximum number of continuations", "").hit, true);
});

test("detectBudgetHit returns true when iteration limit hit in stderr", () => {
  assert.strictEqual(adapter.detectBudgetHit("", "Reached Maximum Number Of Continuations").hit, true);
});

test("detectBudgetHit returns false for normal output", () => {
  assert.strictEqual(adapter.detectBudgetHit("Task completed successfully", "").hit, false);
});

test("buildCommand includes --yolo flag for headless execution", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
  });
  assert.ok(cmd.includes("--yolo"), "expected --yolo flag for headless CI");
});
