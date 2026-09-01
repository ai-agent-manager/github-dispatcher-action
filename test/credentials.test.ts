import assert from "node:assert";
import test from "node:test";

import { getBaseEnvironment } from "../src/environment.js";
import { readActionInputs } from "../src/inputs.js";
import { ClaudeCodeAdapter } from "../src/tools/claude-code.js";
import { GitHubCopilotAdapter } from "../src/tools/github-copilot.js";
import { PiAdapter } from "../src/tools/pi.js";
import { runSkill } from "../src/dispatcher.js";

const secrets = {
  "bundle-access-token": "bundle-secret",
  "gateway-api-key": "gateway-secret",
  "github-token": "github-secret",
  "copilot-token": "copilot-secret",
};

test("masks every non-empty credential immediately after reading it", () => {
  const masked: string[] = [];
  readActionInputs((name) => secrets[name as keyof typeof secrets] ?? "", (secret) => masked.push(secret));
  assert.deepStrictEqual(masked, Object.values(secrets));
});

test("tool environments retain base settings but isolate vendor credentials", () => {
  const base = { PATH: "/usr/bin", LANG: "C", GH_TOKEN: undefined };
  const inputs = {
    gatewayBaseUrl: "https://gateway.example.com",
    gatewayApiKey: "gateway-secret",
    defaultModel: "gateway-model",
    copilotTokenOverride: "copilot-secret",
  };

  const claude = new ClaudeCodeAdapter().buildEnv(inputs, base);
  const copilot = new GitHubCopilotAdapter().buildEnv(inputs, base);
  const pi = new PiAdapter().buildEnv(inputs, base);

  for (const environment of [claude, copilot, pi]) {
    assert.strictEqual(environment.PATH, "/usr/bin");
    assert.strictEqual(environment.GH_TOKEN, undefined);
  }
  assert.strictEqual(claude.ANTHROPIC_AUTH_TOKEN, "gateway-secret");
  assert.strictEqual(claude.COPILOT_GITHUB_TOKEN, undefined);
  assert.strictEqual(claude.LITELLM_API_KEY, undefined);
  assert.strictEqual(copilot.COPILOT_GITHUB_TOKEN, "copilot-secret");
  assert.strictEqual(copilot.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.strictEqual(copilot.LITELLM_API_KEY, undefined);
  assert.strictEqual(pi.LITELLM_API_KEY, "gateway-secret");
  assert.strictEqual(pi.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.strictEqual(pi.COPILOT_GITHUB_TOKEN, undefined);
});

test("base environment removes inherited harness credentials", () => {
  const base = getBaseEnvironment({
    PATH: "/usr/bin",
    GH_TOKEN: "github-secret",
    COPILOT_GITHUB_TOKEN: "copilot-secret",
    ANTHROPIC_AUTH_TOKEN: "anthropic-secret",
    LITELLM_API_KEY: "litellm-secret",
    INPUT_BUNDLE_ACCESS_TOKEN: "bundle-secret",
  });
  assert.deepStrictEqual(base, { PATH: "/usr/bin" });
});

test("runSkill passes only its configured environment to the child process", () => {
  let childEnvironment: NodeJS.ProcessEnv | undefined;
  runSkill(
    { name: "review", autonomy: "observe", trigger: "pull_request.opened", tool: "github-copilot" },
    "diff",
    "",
    ((_bin, _args, options) => {
      childEnvironment = options?.env;
      return "done";
    }) as typeof import("node:child_process").execFileSync,
    () => undefined,
    { PATH: "/usr/bin", COPILOT_GITHUB_TOKEN: "copilot-secret" },
  );
  assert.deepStrictEqual(childEnvironment, { PATH: "/usr/bin", COPILOT_GITHUB_TOKEN: "copilot-secret" });
});