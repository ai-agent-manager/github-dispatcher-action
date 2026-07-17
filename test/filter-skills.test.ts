import assert from "node:assert";
import test from "node:test";

import { filterSkills } from "../src/filter-skills.js";

const baseConfig = {
  skills: [
    {
      name: "code-review",
      on: ["pull_request.opened", "pull_request.synchronize"],
      autonomy: "observe",
      max_budget_usd: 7,
    },
    {
      name: "pr-description",
      on: ["pull_request.opened"],
      autonomy: "suggest",
    },
    "install-only-skill",
    {
      name: "no-triggers",
      autonomy: "observe",
    },
  ],
} as const;

test("matches multiple skills on pull_request.opened", () => {
  const matched = filterSkills(baseConfig, "pull_request", "opened");
  assert.strictEqual(matched.length, 2);
  assert.deepStrictEqual(matched.map((skill) => skill.name).sort(), ["code-review", "pr-description"]);
});

test("matches only code-review on pull_request.synchronize", () => {
  const matched = filterSkills(baseConfig, "pull_request", "synchronize");
  assert.strictEqual(matched.length, 1);
  assert.strictEqual(matched[0]?.name, "code-review");
});

test("forwards max_budget_usd when set, undefined when not", () => {
  const matched = filterSkills(baseConfig, "pull_request", "opened");
  const codeReview = matched.find((skill) => skill.name === "code-review");
  const prDesc = matched.find((skill) => skill.name === "pr-description");
  assert.strictEqual(codeReview?.max_budget_usd, 7);
  assert.strictEqual(prDesc?.max_budget_usd, undefined);
});

test("defaults autonomy to observe when omitted", () => {
  const config = {
    skills: [{ name: "no-autonomy", on: ["pull_request.opened"] }],
  };
  const matched = filterSkills(config, "pull_request", "opened");
  assert.strictEqual(matched[0]?.autonomy, "observe");
});

test("returns empty for unsupported event", () => {
  const matched = filterSkills(baseConfig, "push", "");
  assert.strictEqual(matched.length, 0);
});

test("returns empty when no triggers match", () => {
  const matched = filterSkills(baseConfig, "pull_request", "closed");
  assert.strictEqual(matched.length, 0);
});

test("skips install-only string entries and trigger-less object entries", () => {
  // Confirmed by the fact that neither "install-only-skill" nor
  // "no-triggers" appear in any of the above match results.
  const matched = filterSkills(baseConfig, "pull_request", "opened");
  const names = matched.map((skill) => skill.name);
  assert.ok(!names.includes("install-only-skill"));
  assert.ok(!names.includes("no-triggers"));
});

test("throws when skills field is missing or wrong type", () => {
  assert.throws(() => filterSkills({}, "pull_request", "opened"));
  assert.throws(() => filterSkills({ skills: "not-a-list" as never }, "pull_request", "opened"));
});

test("resolves tool from config.tools[0] when skill has no tool field", () => {
  const config = {
    tools: ["github-copilot"],
    skills: [{ name: "s1", on: ["pull_request.opened"] }],
  };
  const matched = filterSkills(config, "pull_request", "opened");
  assert.strictEqual(matched[0]?.tool, "github-copilot");
});

test("defaults to claude-code when neither skill.tool nor config.tools is set", () => {
  const config = {
    skills: [{ name: "s1", on: ["pull_request.opened"] }],
  };
  const matched = filterSkills(config, "pull_request", "opened");
  assert.strictEqual(matched[0]?.tool, "claude-code");
});

test("resolves tool from skill.tool field (per-skill override)", () => {
  const config = {
    tools: ["claude-code"],
    skills: [{ name: "s1", on: ["pull_request.opened"], tool: "github-copilot" }],
  };
  const matched = filterSkills(config, "pull_request", "opened");
  assert.strictEqual(matched[0]?.tool, "github-copilot");
});

test("forwards max_iterations when set", () => {
  const config = {
    skills: [{ name: "s1", on: ["pull_request.opened"], max_iterations: 20 }],
  };
  const matched = filterSkills(config, "pull_request", "opened");
  assert.strictEqual(matched[0]?.max_iterations, 20);
});

test("throws on invalid tool in skill.tool field", () => {
  const config = {
    skills: [{ name: "s1", on: ["pull_request.opened"], tool: "invalid-tool" }],
  };
  assert.throws(
    () => filterSkills(config, "pull_request", "opened"),
    /Unknown tool "invalid-tool" in skill "s1"/
  );
});

test("throws on invalid tool in config.tools[0]", () => {
  const config = {
    tools: ["typo-tool"],
    skills: [{ name: "s1", on: ["pull_request.opened"] }],
  };
  assert.throws(
    () => filterSkills(config, "pull_request", "opened"),
    /Unknown tool "typo-tool" in config\.tools\[0\]/
  );
});
