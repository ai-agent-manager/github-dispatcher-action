import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import yaml from "js-yaml";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

import type { SkillsConfig } from "./types.js";

/**
 * Install the Claude Code CLI globally so the dispatcher can invoke it.
 *
 * This runs on every action invocation. It's the price of a self-contained
 * action — consumers don't need to add an install step to their workflow.
 */
async function installClaudeCode(): Promise<void> {
  core.startGroup("Install Claude Code");
  await exec.exec("npm", ["install", "-g", "@anthropic-ai/claude-code"]);
  core.endGroup();
}

/**
 * Read the consumer's ai-skills.yml and use agent-manager to install the
 * listed skills onto the runner.
 *
 * The consumer's config includes per-skill trigger and autonomy metadata
 * that agent-manager doesn't care about, so we strip those out before
 * handing it the install config.
 */
async function installSkills(configPath: string, bundleBaseUrl: string): Promise<void> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config = yaml.load(fs.readFileSync(configPath, "utf-8")) as SkillsConfig;

  if (!config.skills || !Array.isArray(config.skills)) {
    throw new Error(`"skills" must be a list in ${configPath}`);
  }

  // Agent-manager wants just the names — drop trigger/autonomy/budget fields.
  const names = config.skills.map((skill) => (typeof skill === "string" ? skill : skill.name));

  const installConfig = {
    tools: config.tools,
    scope: config.scope,
    skills: names,
  };

  const installConfigPath = path.join(os.tmpdir(), "install-skills.yml");
  fs.writeFileSync(installConfigPath, yaml.dump(installConfig));

  core.startGroup("Install AI skills via agent-manager");
  await exec.exec("npx", ["-y", "@ai-agent-manager/cli@latest", bundleBaseUrl, "--config", installConfigPath], {
    env: { ...process.env, DISABLE_TELEMETRY: "1" },
  });
  core.endGroup();
}

export { installClaudeCode, installSkills };
