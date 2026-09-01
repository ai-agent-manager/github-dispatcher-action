import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dump, load } from "js-yaml";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

import type { SkillsConfig } from "./types.js";
import { resolveConfiguredToolNames, validateToolName } from "./tools/index.js";

/**
 * Build the environment for the agent-manager CLI invocation.
 *
 * When the bundle server requires authentication, agent-manager's headless
 * mode reads the bearer token from AGENTMAN_ACCESS_TOKEN — an interactive
 * OAuth flow is impossible inside the action container. The variable is only
 * set when a token was provided, so unauthenticated servers see no change.
 */
function buildInstallEnv(
  baseEnv: Record<string, string | undefined>,
  bundleAccessToken?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    ...(baseEnv as Record<string, string>),
    DISABLE_TELEMETRY: "1",
  };
  if (bundleAccessToken) {
    env.AGENTMAN_ACCESS_TOKEN = bundleAccessToken;
  }
  return env;
}

/**
 * Choose which agent-manager install tool list to use.
 *
 * Consumer tool ids (`pi`, `claude-code`, `github-copilot`) are distinct from
 * agent-manager provisioner ids. Claude Code and Copilot share `.claude/skills/`
 * (provisioner `claude-code`). `pi` installs to `.agents/skills/` (provisioner
 * `agents`). Mixed harness configs — including per-skill `tool:` overrides —
 * get both.
 */
function resolveInstallTools(configTools: unknown, skills?: SkillsConfig["skills"]): string[] {
  const tools = resolveConfiguredToolNames(configTools, skills);
  tools.forEach((tool) => validateToolName(tool, "tools configuration"));
  const needsPiDir = tools.includes("pi");
  const needsClaudeDir = tools.some((tool) => tool === "claude-code" || tool === "github-copilot");

  const installTools: string[] = [];
  if (needsClaudeDir) installTools.push("claude-code");
  if (needsPiDir) installTools.push("agents");
  return [...new Set(installTools)];
}

/**
 * Read the consumer's ai-skills.yml and use agent-manager to install the
 * listed skills onto the runner.
 *
 * The consumer's config includes per-skill trigger and autonomy metadata
 * that agent-manager doesn't care about, so we strip those out before
 * handing it the install config.
 */
async function installSkills(
  configPath: string,
  bundleBaseUrl: string,
  bundleAccessToken?: string,
  agentManagerRef = "latest",
): Promise<void> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  if (bundleAccessToken) {
    core.setSecret(bundleAccessToken);
  }

  const config = load(fs.readFileSync(configPath, "utf-8")) as SkillsConfig;

  if (!config.skills || !Array.isArray(config.skills)) {
    throw new Error(`"skills" must be a list in ${configPath}`);
  }

  // Agent-manager wants just the names — drop trigger/autonomy/budget/tool fields.
  const names = config.skills.map((skill) => (typeof skill === "string" ? skill : skill.name));

  const installTools = resolveInstallTools(config.tools, config.skills);
  const installConfig = {
    tools: installTools,
    scope: config.scope,
    skills: names,
  };

  const installConfigPath = path.join(os.tmpdir(), "install-skills.yml");
  fs.writeFileSync(installConfigPath, dump(installConfig));

  const cliSpec = `@ai-agent-manager/cli@${agentManagerRef.trim() || "latest"}`;
  core.info(`Installing skills with ${cliSpec} (tools: ${installTools.join(", ")})`);

  core.startGroup("Install AI skills via agent-manager");
  await exec.exec("npx", ["-y", cliSpec, bundleBaseUrl, "--config", installConfigPath], {
    env: buildInstallEnv(process.env, bundleAccessToken),
  });
  core.endGroup();
}

export { buildInstallEnv, installSkills, resolveInstallTools };
