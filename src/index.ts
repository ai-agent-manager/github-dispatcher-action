import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import * as core from "@actions/core";
import * as github from "@actions/github";

import { runAll } from "./dispatcher.js";
import { getBaseEnvironment } from "./environment.js";
import { shouldProcessEvent } from "./event-filter.js";
import { filterSkillsFromFile } from "./filter-skills.js";
import { installSkills } from "./install.js";
import { readActionInputs } from "./inputs.js";
import { parseCommand } from "./parse-command.js";
import { resolveGatewayInputs } from "./resolve-gateway-inputs.js";
import type { EventPayload } from "./types.js";
import { getAdapter } from "./tools/index.js";
import type { ToolEnvironment } from "./tools/types.js";

async function run(): Promise<void> {
  try {
    // Configure git for Docker container environment:
    // 1. Safe directory: /github/workspace has different ownership than node user (UID 1001)
    // 2. Config location: node user can't write to /github/home/.gitconfig
    process.env.GIT_CONFIG_GLOBAL = "/tmp/.gitconfig";
    execSync("git config --global --add safe.directory /github/workspace");

    const inputs = readActionInputs(core.getInput, core.setSecret);

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

    // 3. Build one credential-isolated environment per AI tool.
    const toolNames = [...new Set(matched.map((s) => s.tool))];
    const toolEnvironments = new Map<string, ToolEnvironment>();
    for (const toolName of toolNames) {
      const adapter = getAdapter(toolName);
      toolEnvironments.set(toolName, adapter.buildEnv({
        gatewayBaseUrl: gateway.gatewayBaseUrl,
        gatewayApiKey: gateway.gatewayApiKey,
        defaultModel: gateway.defaultModel,
        copilotTokenOverride: gateway.copilotTokenOverride,
      }, getBaseEnvironment()));
    }

    // 4. Fetch the PR diff once and share across all skill runs.
    const diffPath = path.join(os.tmpdir(), "pr.diff");
    execSync(`gh pr diff ${prNumber} > ${diffPath}`, {
      stdio: "inherit",
      env: { ...process.env, GH_TOKEN: inputs.githubToken },
    });
    const diff = fs.readFileSync(diffPath, "utf-8");

    // 5. Run every matched skill and post its result.
    runAll(matched, diff, prNumber, gateway.defaultModel, toolEnvironments, inputs.githubToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();
