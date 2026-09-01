import assert from "node:assert";
import test from "node:test";

import { PiAdapter } from "../src/tools/pi.js";

const adapter = new PiAdapter();

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

test("buildEnv maps gateway credentials for the pinned pi provider extension", () => {
  const environment = adapter.buildEnv({
    ...emptyEnv,
    gatewayBaseUrl: "https://gateway.example.com/",
    gatewayApiKey: "sk-example-gateway-key",
    defaultModel: "claude-sonnet-4-6",
  }, { PATH: "/usr/bin" });

  assert.strictEqual(environment.LITELLM_BASE_URL, "https://gateway.example.com");
  assert.strictEqual(environment.LITELLM_API_KEY, "sk-example-gateway-key");
  assert.strictEqual(environment.PI_TELEMETRY, "0");

  const cmd = adapter.buildCommand({
    ...runOpts,
    defaultModel: "claude-sonnet-4-6",
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
    },
  });
  assert.strictEqual(cmd[cmd.indexOf("--model") + 1], "claude-sonnet-4-6");

});

test("buildEnv throws when gateway-base-url is missing", () => {
  assert.throws(
    () =>
      adapter.buildEnv({
        ...emptyEnv,
        gatewayApiKey: "key",
      }, {}),
    /gateway-base-url is required/,
  );
});

test("buildCommand loads the gateway extension and installed skill path", () => {
  const cmd = adapter.buildCommand({
    ...runOpts,
    skill: {
      name: "code-review-backend",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
      model: "gpt-4o",
    },
  });

  assert.strictEqual(cmd[0], "pi");
  assert.strictEqual(cmd[cmd.indexOf("-e") + 1], "/usr/local/lib/node_modules/pi-provider-litellm/dist/index.js");
  assert.strictEqual(cmd[cmd.indexOf("--model") + 1], "gpt-4o");
  assert.strictEqual(cmd[cmd.indexOf("--skill") + 1], ".agents/skills/code-review-backend");
  assert.ok(cmd.includes("-p"));
  assert.ok(cmd.includes("-a"));
  assert.ok(cmd.includes("--no-session"));
  assert.strictEqual(cmd.at(-1), `@${runOpts.promptPath}`);
});

test("buildCommand omits --model when none is configured", () => {
  const fresh = new PiAdapter();
  const cmd = fresh.buildCommand({
    ...runOpts,
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
    },
  });

  assert.ok(!cmd.includes("--model"));
});
