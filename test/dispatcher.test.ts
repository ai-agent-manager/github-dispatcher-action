import assert from "node:assert";
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
