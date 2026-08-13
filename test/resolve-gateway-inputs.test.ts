import assert from "node:assert";
import test from "node:test";

import { firstNonEmpty, resolveGatewayInputs } from "../src/resolve-gateway-inputs.js";
import { resolveInstallTools } from "../src/install.js";

test("firstNonEmpty returns the first trimmed non-empty value", () => {
  assert.strictEqual(firstNonEmpty("", "  ", " alpha ", "beta"), "alpha");
  assert.strictEqual(firstNonEmpty(undefined, "", "x"), "x");
  assert.strictEqual(firstNonEmpty("", " "), "");
});

test("resolveGatewayInputs prefers gateway-* over litellm-* over anthropic-*", () => {
  const resolved = resolveGatewayInputs({
    gatewayBaseUrl: "https://gateway.example",
    gatewayApiKey: "gateway-key",
    defaultModel: "gateway-model",
    litellmBaseUrl: "https://litellm.example",
    litellmApiKey: "litellm-key",
    piModel: "pi-model",
    anthropicBaseUrl: "https://anthropic.example",
    anthropicAuthToken: "anthropic-key",
    anthropicModel: "anthropic-model",
    copilotToken: "copilot-pat",
  });

  assert.strictEqual(resolved.gatewayBaseUrl, "https://gateway.example");
  assert.strictEqual(resolved.gatewayApiKey, "gateway-key");
  assert.strictEqual(resolved.defaultModel, "gateway-model");
  assert.strictEqual(resolved.copilotTokenOverride, "copilot-pat");
});

test("resolveGatewayInputs falls back through deprecated aliases", () => {
  const fromLitellm = resolveGatewayInputs({
    litellmBaseUrl: "https://litellm.example",
    litellmApiKey: "litellm-key",
    piModel: "pi-model",
    anthropicBaseUrl: "https://anthropic.example",
    anthropicAuthToken: "anthropic-key",
    anthropicModel: "anthropic-model",
  });
  assert.strictEqual(fromLitellm.gatewayBaseUrl, "https://litellm.example");
  assert.strictEqual(fromLitellm.gatewayApiKey, "litellm-key");
  assert.strictEqual(fromLitellm.defaultModel, "pi-model");

  const fromAnthropic = resolveGatewayInputs({
    anthropicBaseUrl: "https://anthropic.example",
    anthropicAuthToken: "anthropic-key",
    anthropicModel: "anthropic-model",
  });
  assert.strictEqual(fromAnthropic.gatewayBaseUrl, "https://anthropic.example");
  assert.strictEqual(fromAnthropic.gatewayApiKey, "anthropic-key");
  assert.strictEqual(fromAnthropic.defaultModel, "anthropic-model");
  assert.strictEqual(fromAnthropic.copilotTokenOverride, "");
});

test("resolveInstallTools uses agents for pi (and legacy agents), otherwise claude-code", () => {
  assert.deepStrictEqual(resolveInstallTools(["pi"]), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(["agents"]), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(["claude-code", "github-copilot"]), ["claude-code"]);
  assert.deepStrictEqual(resolveInstallTools("pi"), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools("agents"), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(undefined), ["claude-code"]);
});

test("resolveInstallTools installs to both trees for mixed Claude/pi harnesses", () => {
  assert.deepStrictEqual(resolveInstallTools(["claude-code", "pi"]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(["pi", "github-copilot"]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(["claude-code"], [{ name: "s", tool: "pi" }]), ["claude-code", "agents"]);
});
