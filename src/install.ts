import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dump, load } from "js-yaml";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

import type { SkillsConfig } from "./types.js";

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
 * Default: force `claude-code` so skills land in the shared `.claude/skills/`
 * location (Claude Code and Copilot both read that path).
 *
 * When the consumer declares `pi` (or legacy `agents`), pass agent-manager's
 * `agents` provisioner so skills install to `.agents/skills/` for the pi harness.
 */
function resolveInstallTools(configTools: unknown): string[] {
  const tools = Array.isArray(configTools)
    ? configTools.filter((t): t is string => typeof t === "string")
    : typeof configTools === "string"
      ? [configTools]
      : [];
  if (tools.includes("pi") || tools.includes("agents")) {
    return ["agents"];
  }
  return ["claude-code"];
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

  const installTools = resolveInstallTools(config.tools);
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
