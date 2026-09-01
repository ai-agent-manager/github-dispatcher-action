import assert from "node:assert";
import test from "node:test";

import { buildInstallEnv, resolveInstallTools } from "../src/install.js";

test("buildInstallEnv sets AGENTMAN_ACCESS_TOKEN when a token is provided", () => {
  const env = buildInstallEnv({ PATH: "/usr/bin" }, "tok-123");
  assert.strictEqual(env.AGENTMAN_ACCESS_TOKEN, "tok-123");
  assert.strictEqual(env.PATH, "/usr/bin");
});

test("buildInstallEnv omits AGENTMAN_ACCESS_TOKEN when the token is empty", () => {
  const env = buildInstallEnv({ PATH: "/usr/bin" }, "");
  assert.ok(!("AGENTMAN_ACCESS_TOKEN" in env));
});

test("buildInstallEnv omits AGENTMAN_ACCESS_TOKEN when no token is passed", () => {
  const env = buildInstallEnv({ PATH: "/usr/bin" });
  assert.ok(!("AGENTMAN_ACCESS_TOKEN" in env));
});

test("buildInstallEnv always disables telemetry", () => {
  assert.strictEqual(buildInstallEnv({}).DISABLE_TELEMETRY, "1");
  assert.strictEqual(buildInstallEnv({}, "tok").DISABLE_TELEMETRY, "1");
});

test("buildInstallEnv does not leak the token into the base env object", () => {
  const base: Record<string, string | undefined> = { PATH: "/usr/bin" };
  buildInstallEnv(base, "tok-123");
  assert.ok(!("AGENTMAN_ACCESS_TOKEN" in base));
});

test("resolveInstallTools maps consumer pi to the agents provisioner", () => {
  assert.deepStrictEqual(resolveInstallTools(["pi"]), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(["claude-code", "github-copilot"]), ["claude-code"]);
  assert.deepStrictEqual(resolveInstallTools("pi"), ["agents"]);
  assert.deepStrictEqual(resolveInstallTools(undefined), ["claude-code"]);
});

test("resolveInstallTools does not treat agents as a consumer tool id", () => {
  assert.throws(() => resolveInstallTools(["agents"]), /Unknown tool "agents"/);
});

test("resolveInstallTools installs to both trees for mixed Claude/pi harnesses", () => {
  assert.deepStrictEqual(resolveInstallTools(["claude-code", "pi"]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(["pi", "github-copilot"]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(["claude-code"], [{ name: "s", tool: "pi" }]), ["claude-code", "agents"]);
  assert.deepStrictEqual(resolveInstallTools(undefined, [{ name: "pi", tool: "pi" }, { name: "default" }]), [
    "claude-code",
    "agents",
  ]);
});
