import assert from "node:assert";
import test from "node:test";

import { PiLiteLLMAdapter } from "../src/tools/pi-litellm.js";

const adapter = new PiLiteLLMAdapter();

const emptyEnv = {
  gatewayBaseUrl: "",
  gatewayApiKey: "",
  defaultModel: "",
  githubToken: "",
  copilotTokenOverride: "",
};

test("applyEnv maps gateway credentials to LITELLM_* env vars", () => {
  const prevBase = process.env.LITELLM_BASE_URL;
  const prevKey = process.env.LITELLM_API_KEY;
  const prevTelemetry = process.env.PI_TELEMETRY;

  adapter.applyEnv({
    ...emptyEnv,
    gatewayBaseUrl: "https://litellm.example.com/",
    gatewayApiKey: "sk-example-gateway-key",
    defaultModel: "claude-sonnet-4-6",
  });

  assert.strictEqual(process.env.LITELLM_BASE_URL, "https://litellm.example.com");
  assert.strictEqual(process.env.LITELLM_API_KEY, "sk-example-gateway-key");
  assert.strictEqual(process.env.PI_TELEMETRY, "0");
  assert.strictEqual(process.env.PI_LITELLM_DEFAULT_MODEL, "claude-sonnet-4-6");

  if (prevBase === undefined) delete process.env.LITELLM_BASE_URL;
  else process.env.LITELLM_BASE_URL = prevBase;
  if (prevKey === undefined) delete process.env.LITELLM_API_KEY;
  else process.env.LITELLM_API_KEY = prevKey;
  if (prevTelemetry === undefined) delete process.env.PI_TELEMETRY;
  else process.env.PI_TELEMETRY = prevTelemetry;
  delete process.env.PI_LITELLM_DEFAULT_MODEL;
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

test("buildCommand loads litellm extension and skill by name", () => {
  const cmd = adapter.buildCommand({
    skill: {
      name: "code-review-backend",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
      model: "gpt-4o",
    },
    promptPath: "/tmp/prompt.txt",
  });

  assert.ok(cmd.startsWith("pi "));
  assert.ok(cmd.includes("-e npm:pi-provider-litellm"));
  assert.ok(cmd.includes("--model litellm/gpt-4o"));
  assert.ok(cmd.includes("--skill code-review-backend"));
  assert.ok(cmd.includes("-p"));
  assert.ok(cmd.includes("--no-session"));
});

test("buildCommand defaults model to litellm/claude-sonnet-4-6", () => {
  delete process.env.PI_LITELLM_DEFAULT_MODEL;

  const cmd = adapter.buildCommand({
    skill: {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
    },
    promptPath: "/tmp/prompt.txt",
  });

  assert.ok(cmd.includes("--model litellm/claude-sonnet-4-6"));
});
