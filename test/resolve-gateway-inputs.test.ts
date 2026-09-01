import assert from "node:assert";
import test from "node:test";

import { resolveGatewayInputs } from "../src/resolve-gateway-inputs.js";

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
