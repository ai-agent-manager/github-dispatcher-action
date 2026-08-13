import assert from "node:assert";
import test from "node:test";

import { firstNonEmpty, resolveGatewayInputs } from "../src/resolve-gateway-inputs.js";
import { resolveInstallTools } from "../src/install.js";

test("firstNonEmpty returns the first trimmed non-empty value", () => {
  assert.strictEqual(firstNonEmpty("", "  ", " alpha ", "beta"), "alpha");
  assert.strictEqual(firstNonEmpty(undefined, "", "x"), "x");
  assert.strictEqual(firstNonEmpty("", " "), "");
});

test("resolveGatewayInputs trims canonical gateway inputs", () => {
  const resolved = resolveGatewayInputs({
    gatewayBaseUrl: "  https://gateway.example  ",
    gatewayApiKey: " gateway-key ",
    defaultModel: "gateway-model",
    copilotToken: "copilot-pat",
  });

  assert.strictEqual(resolved.gatewayBaseUrl, "https://gateway.example");
  assert.strictEqual(resolved.gatewayApiKey, "gateway-key");
  assert.strictEqual(resolved.defaultModel, "gateway-model");
  assert.strictEqual(resolved.copilotTokenOverride, "copilot-pat");
});

test("resolveGatewayInputs treats whitespace-only values as empty", () => {
  const resolved = resolveGatewayInputs({
    gatewayBaseUrl: "   ",
    gatewayApiKey: "",
    defaultModel: undefined,
    copilotToken: "  ",
  });
  assert.strictEqual(resolved.gatewayBaseUrl, "");
  assert.strictEqual(resolved.gatewayApiKey, "");
  assert.strictEqual(resolved.defaultModel, "");
  assert.strictEqual(resolved.copilotTokenOverride, "");
});

test("resolveInstallTools maps consumer pi to the agents provisioner", () => {
  assert.deepStrictEqual(resolveInstallTools(["pi"]), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(["claude-code", "github-copilot"]), ["claude-code"]);
  assert.deepStrictEqual(resolveInstallTools("pi"), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(undefined), ["claude-code"]);
});

test("resolveInstallTools does not treat agents as a consumer tool id", () => {
  assert.deepStrictEqual(resolveInstallTools(["agents"]), ["claude-code"]);
});

test("resolveInstallTools installs to both trees for mixed Claude/pi harnesses", () => {
  assert.deepStrictEqual(resolveInstallTools(["claude-code", "pi"]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(["pi", "github-copilot"]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(["claude-code"], [{ name: "s", tool: "pi" }]), ["claude-code", "agents"]);
});
