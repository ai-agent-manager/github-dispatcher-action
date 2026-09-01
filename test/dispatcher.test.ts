import assert from "node:assert";
import fs from "node:fs";
import test from "node:test";

import { runSkill } from "../src/dispatcher.js";

test("runSkill does not include the untrusted diff in failure annotations", () => {
  const untrustedDiff = "SECRET_FROM_UNTRUSTED_PR_DIFF";
  const annotations: string[] = [];

  const result = runSkill(
    {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
    untrustedDiff,
    "",
    (() => {
      throw new Error(`Command failed: copilot -p ${untrustedDiff}`);
    }) as typeof import("node:child_process").execFileSync,
    (message) => annotations.push(message),
  );

  assert.strictEqual(result, null);
  assert.strictEqual(annotations.length, 1);
  assert.ok(!annotations[0]?.includes(untrustedDiff));
  assert.match(annotations[0] ?? "", /review failed/);
});

for (const tool of ["claude-code", "github-copilot"] as const) {
  test(`runSkill keeps prompts larger than 128 KiB out of ${tool} argv`, () => {
    const diff = "x".repeat(129 * 1024);
    const prompt = `Use the review skill. Here is the diff: ${diff}`;
    let capturedArgs: readonly string[] = [];
    let capturedInput = "";
    let capturedAttachment = "";

    const result = runSkill(
      {
        name: "review",
        autonomy: "observe",
        trigger: "pull_request.opened",
        tool,
      },
      diff,
      "",
      ((bin: string, args: readonly string[], options?: { input?: string | Uint8Array }) => {
        assert.ok(bin === "claude" || bin === "copilot");
        capturedArgs = args;
        capturedInput = options?.input?.toString() ?? "";
        if (tool === "github-copilot") {
          const attachment = args[args.indexOf("--attachment") + 1];
          if (attachment) capturedAttachment = fs.readFileSync(attachment, "utf-8");
        }
        return "complete";
      }) as typeof import("node:child_process").execFileSync,
    );

    assert.deepStrictEqual(result, { output: "complete", budgetHit: false });
    if (tool === "claude-code") {
      assert.ok(capturedInput.length > 128 * 1024);
      assert.strictEqual(capturedInput, prompt);
    } else {
      const attachment = capturedArgs[capturedArgs.indexOf("--attachment") + 1];
      assert.ok(attachment);
      assert.strictEqual(capturedAttachment, prompt);
    }
    assert.ok(!capturedArgs.includes(prompt));
  });
}

test("runSkill removes Pi's temporary prompt file after execution", () => {
  let promptPath = "";

  const result = runSkill(
    {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
    },
    "diff",
    "",
    ((_: string, args: readonly string[]) => {
      promptPath = args.find((arg) => arg.startsWith("@"))?.slice(1) ?? "";
      assert.ok(fs.existsSync(promptPath));
      return "complete";
    }) as typeof import("node:child_process").execFileSync,
  );

  assert.deepStrictEqual(result, { output: "complete", budgetHit: false });
  assert.ok(promptPath);
  assert.ok(!fs.existsSync(promptPath));
});
