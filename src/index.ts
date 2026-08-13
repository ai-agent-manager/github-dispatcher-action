import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import * as core from "@actions/core";
import * as github from "@actions/github";

import { runAll } from "./dispatcher.js";
import { shouldProcessEvent } from "./event-filter.js";
import { filterSkillsFromFile } from "./filter-skills.js";
import { installSkills } from "./install.js";
import { parseCommand } from "./parse-command.js";
import { resolveGatewayInputs } from "./resolve-gateway-inputs.js";
import type { EventPayload } from "./types.js";
import { getAdapter } from "./tools/index.js";

interface ActionInputs {
  configPath: string;
  bundleBaseUrl: string;
  bundleAccessToken: string;
  agentManagerRef: string;
  gatewayBaseUrl: string;
  gatewayApiKey: string;
  defaultModel: string;
  githubToken: string;
  copilotToken: string;
}

async function run(): Promise<void> {
  try {
    // Configure git for Docker container environment:
    // 1. Safe directory: /github/workspace has different ownership than node user (UID 1001)
    // 2. Config location: node user can't write to /github/home/.gitconfig
    process.env.GIT_CONFIG_GLOBAL = "/tmp/.gitconfig";
    execSync("git config --global --add safe.directory /github/workspace");

    const inputs: ActionInputs = {
      configPath: core.getInput("config-path") || ".github/ai-skills.yml",
      bundleBaseUrl: core.getInput("bundle-base-url", { required: true }),
      bundleAccessToken: core.getInput("bundle-access-token"),
      agentManagerRef: core.getInput("agent-manager-ref") || "latest",
      gatewayBaseUrl: core.getInput("gateway-base-url"),
      gatewayApiKey: core.getInput("gateway-api-key"),
      defaultModel: core.getInput("default-model"),
      githubToken: core.getInput("github-token", { required: true }),
      copilotToken: core.getInput("copilot-token"),
    };

    const gateway = resolveGatewayInputs(inputs);

    const { eventName, payload } = github.context;
    const typedPayload = payload as EventPayload;
    const eventAction = typedPayload.action ?? "";

    // Gate the event before doing any work — wrong event type, bot-authored
    // comment, or comment on a plain issue all exit cleanly here.
    const { proceed, reason } = shouldProcessEvent(eventName, typedPayload);
    if (!proceed) {
      core.info(`Skipping dispatcher: ${reason}. Exiting cleanly.`);
      return;
    }

    // pull_request events carry the PR on payload.pull_request; issue_comment
    // events on a PR carry it on payload.issue (same number).
    const prNumber = typedPayload.pull_request?.number ?? typedPayload.issue?.number;
    if (!prNumber) {
      throw new Error("Could not determine PR number from event payload.");
    }

    // For comment events, parse `/ai run <skill>` from the body. If the
    // comment isn't a command, exit cleanly — every other comment on a PR
    // would otherwise still spin up the runtime for nothing.
    let requestedSkill: string | null = null;
    if (eventName === "issue_comment") {
      const command = parseCommand(typedPayload.comment?.body);
      if (!command) {
        core.info("Comment is not an /ai run command — exiting cleanly.");
        return;
      }
      requestedSkill = command.skillName;
      core.info(`[command] Requested skill: ${requestedSkill}`);
    }

    // 1. Install skills declared in config.
    // Claude Code CLI is pre-installed in Dockerfile (node user can't npm install -g)
    await installSkills(inputs.configPath, inputs.bundleBaseUrl, inputs.bundleAccessToken, inputs.agentManagerRef);

    // 2. Decide which skills should run for this event.
    const matched = filterSkillsFromFile(inputs.configPath, eventName, eventAction, requestedSkill);

    if (matched.length === 0) {
      core.info("No skills matched the current event — exiting.");
      return;
    }

    // 3. Apply tool-specific env vars.
    // GH_TOKEN is needed by all tools (for gh CLI) — set it once.
    process.env.GH_TOKEN = inputs.githubToken;

    // Determine unique tools from matched skills and apply their env.
    // Adapters receive gateway-shaped inputs and map to vendor env vars.
    const toolNames = [...new Set(matched.map((s) => s.tool))];
    for (const toolName of toolNames) {
      const adapter = getAdapter(toolName);
      adapter.applyEnv({
        gatewayBaseUrl: gateway.gatewayBaseUrl,
        gatewayApiKey: gateway.gatewayApiKey,
        defaultModel: gateway.defaultModel,
        githubToken: inputs.githubToken,
        copilotTokenOverride: gateway.copilotTokenOverride,
      });
    }

    // 4. Fetch the PR diff once and share across all skill runs.
    const diffPath = path.join(os.tmpdir(), "pr.diff");
    execSync(`gh pr diff ${prNumber} > ${diffPath}`, {
      stdio: "inherit",
      env: process.env,
    });
    const diff = fs.readFileSync(diffPath, "utf-8");

    // 5. Run every matched skill and post its result.
    runAll(matched, diff, prNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();
