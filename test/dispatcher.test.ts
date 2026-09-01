import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";

import { executeCommand, runSkill } from "../src/dispatcher.js";

const skill = {
  name: "review",
  autonomy: "observe" as const,
  trigger: "pull_request.opened" as const,
  tool: "github-copilot" as const,
};

function resultWith(overrides: Partial<{
  stdout: string;
  stderr: string;
  stdoutForDetection: string;
  stderrForDetection: string;
  outputTruncated: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}> = {}) {
  return {
    stdout: "",
    stderr: "",
    stdoutForDetection: "",
    stderrForDetection: "",
    outputTruncated: false,
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

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
  const result = await runSkill(skill, "diff", "", async () => resultWith({ stdout: "review output", stdoutForDetection: "review output" }));

  assert.deepStrictEqual(result, { output: "review output", budgetHit: false });
});

test("runSkill retains output larger than Node's default 1 MiB buffer", async () => {
  const largeOutput = "a".repeat(1024 * 1024 + 1);
  const result = await runSkill(
    skill,
    "diff",
    "",
    async () => resultWith({ stdout: largeOutput, stdoutForDetection: largeOutput }),
  );

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

test("executeCommand pipes input to the child's stdin", async () => {
  const result = await executeCommand(
    process.execPath,
    ["-e", "process.stdin.pipe(process.stdout)"],
    "stdin prompt payload",
  );

  assert.strictEqual(result.stdout, "stdin prompt payload");
  assert.strictEqual(result.exitCode, 0);
  assert.strictEqual(result.signal, null);
});

test("executeCommand reports the signal when the child is killed", async () => {
  const result = await executeCommand(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"]);

  assert.strictEqual(result.exitCode, null);
  assert.strictEqual(result.signal, "SIGTERM");
});

test("runSkill detects an iteration marker at the end of captured output", async () => {
  const result = await runSkill(skill, "diff", "", async () =>
    resultWith({
      stdout: "a".repeat(4 * 1024 * 1024),
      stdoutForDetection: `${"a".repeat(4 * 1024 * 1024)} reached maximum number of continuations`,
      outputTruncated: true,
    }),
  );

  assert.strictEqual(result?.budgetHit, true);
  assert.match(result?.output ?? "", /iteration limit/);
});

test("runSkill includes sanitised stderr and the exit status in failure annotations", async () => {
  const annotations: string[] = [];

  const result = await runSkill(
    skill,
    "diff",
    "",
    async () =>
      resultWith({
        stderr: "authentication service unavailable",
        stderrForDetection: "authentication service unavailable",
        exitCode: 23,
      }),
    (message) => annotations.push(message),
  );

  assert.strictEqual(result, null);
  assert.match(annotations[0] ?? "", /exit status 23/);
  assert.match(annotations[0] ?? "", /authentication service unavailable/);
});

test("runSkill truncates diagnostic stderr", async () => {
  const annotations: string[] = [];
  const diagnostic = "x".repeat(5_000);

  await runSkill(
    skill,
    "diff",
    "",
    async () => resultWith({ stderr: diagnostic, stderrForDetection: diagnostic, exitCode: 1 }),
    (message) => annotations.push(message),
  );

  assert.ok((annotations[0]?.length ?? 0) < diagnostic.length);
  assert.match(annotations[0] ?? "", /\[truncated\]/);
});

test("runSkill redacts prompt and diff from diagnostic stderr", async () => {
  const annotations: string[] = [];
  const diff = "SECRET_FROM_UNTRUSTED_PR_DIFF";

  await runSkill(
    skill,
    diff,
    "",
    async () =>
      resultWith({
        stderr: `tool echoed: Use the review skill. Here is the diff: ${diff}`,
        exitCode: 1,
      }),
    (message) => annotations.push(message),
  );

  assert.ok(!annotations[0]?.includes(diff));
  assert.match(annotations[0] ?? "", /\[redacted prompt\]/);
});

test("runSkill omits an empty stderr diagnostic", async () => {
  const annotations: string[] = [];

  await runSkill(
    skill,
    "diff",
    "",
    async () => resultWith({ stderr: "   ", exitCode: null, signal: "SIGTERM" }),
    (message) => annotations.push(message),
  );

  assert.match(annotations[0] ?? "", /signal SIGTERM/);
  assert.ok(!annotations[0]?.includes(":"));
});

test("runSkill still treats budget detection in stderr as a successful truncated run", async () => {
  const result = await runSkill({ ...skill, max_iterations: 4 }, "diff", "", async () =>
    resultWith({
      stderr: "reached maximum number of continuations",
      stderrForDetection: "reached maximum number of continuations",
      exitCode: 1,
    }),
  );

  assert.deepStrictEqual(result, {
    output:
      "⚠️ **Review truncated** — the `4` iteration limit was reached before `review` finished. Raise `max_iterations` for this skill in `.github/ai-skills.yml` if you need a more complete review.",
    budgetHit: true,
  });
});

for (const tool of ["claude-code", "github-copilot"] as const) {
  test(`runSkill keeps prompts larger than 128 KiB out of ${tool} argv`, async () => {
    const diff = "x".repeat(129 * 1024);
    const prompt = `Use the review skill. Here is the diff: ${diff}`;
    let capturedArgs: readonly string[] = [];
    let capturedInput = "";
    let capturedAttachment = "";

    const result = await runSkill(
      {
        name: "review",
        autonomy: "observe",
        trigger: "pull_request.opened",
        tool,
      },
      diff,
      "",
      async (bin: string, args: string[], input?: string) => {
        assert.ok(bin === "claude" || bin === "copilot");
        capturedArgs = args;
        capturedInput = input ?? "";
        if (tool === "github-copilot") {
          const attachment = args[args.indexOf("--attachment") + 1];
          if (attachment) capturedAttachment = fs.readFileSync(attachment, "utf-8");
        }
        return resultWith({ stdout: "complete", stdoutForDetection: "complete" });
      },
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

test("runSkill removes Pi's temporary prompt file after execution", async () => {
  let promptPath = "";

  const result = await runSkill(
    {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "pi",
      model: "gpt-4o",
    },
    "diff",
    "",
    async (_bin: string, args: string[]) => {
      promptPath = args.find((arg) => arg.startsWith("@"))?.slice(1) ?? "";
      assert.ok(fs.existsSync(promptPath));
      return resultWith({ stdout: "complete", stdoutForDetection: "complete" });
    },
  );

  assert.deepStrictEqual(result, { output: "complete", budgetHit: false });
  assert.ok(promptPath);
  assert.ok(!fs.existsSync(promptPath));
});

test("runSkill removes the temporary prompt directory when buildCommand throws", async () => {
  const tmpRoot = fs.realpathSync(os.tmpdir());
  const before = fs.readdirSync(tmpRoot).filter((name) => name.startsWith("ai-skill-"));

  // Pi requires an explicit model; buildCommand throws before the tool launches.
  await assert.rejects(
    () =>
      runSkill(
        { name: "review", autonomy: "observe", trigger: "pull_request.opened", tool: "pi" },
        "diff",
        "",
        async () => {
          throw new Error("should not reach the tool");
        },
      ),
    /model is required/,
  );

  const after = fs.readdirSync(tmpRoot).filter((name) => name.startsWith("ai-skill-"));
  assert.deepStrictEqual(after, before);
});
