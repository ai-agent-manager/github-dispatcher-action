import assert from "node:assert";
import test from "node:test";

import { runSkill } from "../src/dispatcher.js";

interface ExecutionError extends Error {
  status?: number;
  signal?: NodeJS.Signals;
  stderr?: string;
}

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

test("runSkill includes sanitised stderr and the exit status in failure annotations", () => {
  const annotations: string[] = [];

  const result = runSkill(
    {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
    },
    "diff",
    "",
    (() => {
      const error: ExecutionError = new Error("copilot command and argv should not appear");
      error.status = 23;
      error.stderr = "authentication service unavailable";
      throw error;
    }) as typeof import("node:child_process").execFileSync,
    (message) => annotations.push(message),
  );

  assert.strictEqual(result, null);
  assert.match(annotations[0] ?? "", /exit status 23/);
  assert.match(annotations[0] ?? "", /authentication service unavailable/);
  assert.ok(!annotations[0]?.includes("copilot command and argv should not appear"));
});

test("runSkill truncates diagnostic stderr", () => {
  const annotations: string[] = [];
  const diagnostic = "x".repeat(5_000);

  runSkill(
    { name: "review", autonomy: "observe", trigger: "pull_request.opened", tool: "github-copilot" },
    "diff",
    "",
    (() => {
      const error: ExecutionError = new Error("failed");
      error.stderr = diagnostic;
      throw error;
    }) as typeof import("node:child_process").execFileSync,
    (message) => annotations.push(message),
  );

  assert.ok((annotations[0]?.length ?? 0) < diagnostic.length);
  assert.match(annotations[0] ?? "", /\[truncated\]/);
});

test("runSkill redacts prompt and diff from diagnostic stderr", () => {
  const annotations: string[] = [];
  const diff = "SECRET_FROM_UNTRUSTED_PR_DIFF";

  runSkill(
    { name: "review", autonomy: "observe", trigger: "pull_request.opened", tool: "github-copilot" },
    diff,
    "",
    (() => {
      const error: ExecutionError = new Error("failed");
      error.stderr = `tool echoed: Use the review skill. Here is the diff: ${diff}`;
      throw error;
    }) as typeof import("node:child_process").execFileSync,
    (message) => annotations.push(message),
  );

  assert.ok(!annotations[0]?.includes(diff));
  assert.match(annotations[0] ?? "", /\[redacted prompt\]/);
});

test("runSkill omits an empty stderr diagnostic", () => {
  const annotations: string[] = [];

  runSkill(
    { name: "review", autonomy: "observe", trigger: "pull_request.opened", tool: "github-copilot" },
    "diff",
    "",
    (() => {
      const error: ExecutionError = new Error("failed");
      error.signal = "SIGTERM";
      error.stderr = "   ";
      throw error;
    }) as typeof import("node:child_process").execFileSync,
    (message) => annotations.push(message),
  );

  assert.match(annotations[0] ?? "", /signal SIGTERM/);
  assert.ok(!annotations[0]?.includes(":"));
});

test("runSkill still treats budget detection in stderr as a successful truncated run", () => {
  const result = runSkill(
    {
      name: "review",
      autonomy: "observe",
      trigger: "pull_request.opened",
      tool: "github-copilot",
      max_iterations: 4,
    },
    "diff",
    "",
    (() => {
      const error: ExecutionError = new Error("failed");
      error.stderr = "reached maximum number of continuations";
      throw error;
    }) as typeof import("node:child_process").execFileSync,
  );

  assert.deepStrictEqual(result, {
    output:
      "⚠️ **Review truncated** — the `4` iteration limit was reached before `review` finished. Raise `max_iterations` for this skill in `.github/ai-skills.yml` if you need a more complete review.",
    budgetHit: true,
  });
});
