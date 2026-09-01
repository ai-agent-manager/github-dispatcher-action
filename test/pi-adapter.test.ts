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
  githubToken: "",
  copilotTokenOverride: "",
};

test("applyEnv maps gateway credentials for the pinned pi provider extension", () => {
  const prevBase = process.env.LITELLM_BASE_URL;
  const prevKey = process.env.LITELLM_API_KEY;
  const prevTelemetry = process.env.PI_TELEMETRY;

  adapter.applyEnv({
    ...emptyEnv,
    gatewayBaseUrl: "https://gateway.example.com/",
    gatewayApiKey: "sk-example-gateway-key",
    defaultModel: "claude-sonnet-4-6",
  });

  assert.strictEqual(process.env.LITELLM_BASE_URL, "https://gateway.example.com");
  assert.strictEqual(process.env.LITELLM_API_KEY, "sk-example-gateway-key");
  assert.strictEqual(process.env.PI_TELEMETRY, "0");

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

  if (prevBase === undefined) delete process.env.LITELLM_BASE_URL;
  else process.env.LITELLM_BASE_URL = prevBase;
  if (prevKey === undefined) delete process.env.LITELLM_API_KEY;
  else process.env.LITELLM_API_KEY = prevKey;
  if (prevTelemetry === undefined) delete process.env.PI_TELEMETRY;
  else process.env.PI_TELEMETRY = prevTelemetry;
});

test("applyEnv throws when gateway-base-url is missing", () => {
  assert.throws(
    () =>
      adapter.applyEnv({
        ...emptyEnv,
        gatewayApiKey: "key",
      }),
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
