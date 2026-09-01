import assert from "node:assert";
import test from "node:test";

import { executeCommand, runSkill } from "../src/dispatcher.js";

const skill = {
  name: "review",
  autonomy: "observe" as const,
  trigger: "pull_request.opened" as const,
  tool: "github-copilot" as const,
};

test("runSkill does not include the untrusted diff in failure annotations", async () => {
  const untrustedDiff = "SECRET_FROM_UNTRUSTED_PR_DIFF";
  const annotations: string[] = [];

  const result = await runSkill(
    skill,
    untrustedDiff,
    "",
    async () => {
      throw new Error(`Command failed: copilot -p ${untrustedDiff}`);
    },
    (message) => annotations.push(message),
  );

  assert.strictEqual(result, null);
  assert.strictEqual(annotations.length, 1);
  assert.ok(!annotations[0]?.includes(untrustedDiff));
  assert.match(annotations[0] ?? "", /review failed/);
});

test("runSkill retains normal output", async () => {
  const result = await runSkill(skill, "diff", "", async () => ({
    stdout: "review output",
    stderr: "",
    stdoutForDetection: "review output",
    stderrForDetection: "",
    outputTruncated: false,
    exitCode: 0,
  }));

  assert.deepStrictEqual(result, { output: "review output", budgetHit: false });
});

test("runSkill retains output larger than Node's default 1 MiB buffer", async () => {
  const largeOutput = "a".repeat(1024 * 1024 + 1);
  const result = await runSkill(skill, "diff", "", async () => ({
    stdout: largeOutput,
    stderr: "",
    stdoutForDetection: largeOutput,
    stderrForDetection: "",
    outputTruncated: false,
    exitCode: 0,
  }));

  assert.strictEqual(result?.output.length, largeOutput.length);
  assert.strictEqual(result?.budgetHit, false);
});

test("executeCommand retains output above 1 MiB", async () => {
  const result = await executeCommand(process.execPath, ["-e", "process.stdout.write('a'.repeat(1024 * 1024 + 1))"]);

  assert.strictEqual(result.stdout.length, 1024 * 1024 + 1);
  assert.strictEqual(result.outputTruncated, false);
});

test("executeCommand truncates output at the configured upper bound", async () => {
  const result = await executeCommand(process.execPath, ["-e", "process.stdout.write('a'.repeat(5 * 1024 * 1024))"]);

  assert.strictEqual(result.stdout.length, 4 * 1024 * 1024);
  assert.strictEqual(result.outputTruncated, true);
});

test("runSkill detects an iteration marker at the end of captured output", async () => {
  const result = await runSkill(skill, "diff", "", async () => ({
    stdout: "a".repeat(4 * 1024 * 1024),
    stderr: "",
    stdoutForDetection: `${"a".repeat(4 * 1024 * 1024)} reached maximum number of continuations`,
    stderrForDetection: "",
    outputTruncated: true,
    exitCode: 0,
  }));

  assert.strictEqual(result?.budgetHit, true);
  assert.match(result?.output ?? "", /iteration limit/);
});
