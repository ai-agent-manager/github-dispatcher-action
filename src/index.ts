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
import type { EventPayload } from "./types.js";

interface ActionInputs {
  configPath: string;
  bundleBaseUrl: string;
  anthropicAuthToken: string;
  anthropicBaseUrl: string;
  anthropicModel: string;
  githubToken: string;
}

/**
 * Set environment variables that Claude Code reads, based on action inputs.
 *
 * Anything left blank by the consumer is simply not set, so Claude Code
 * falls back to its own defaults.
 */
function applyClaudeCodeEnv(inputs: ActionInputs): void {
  process.env.ANTHROPIC_AUTH_TOKEN = inputs.anthropicAuthToken;
  if (inputs.anthropicBaseUrl) {
    process.env.ANTHROPIC_BASE_URL = inputs.anthropicBaseUrl;
  }
  if (inputs.anthropicModel) {
    process.env.ANTHROPIC_MODEL = inputs.anthropicModel;
  }

  // Lock down telemetry and experimental features for predictable runs.
  process.env.DISABLE_NON_ESSENTIAL_MODEL_CALLS = "1";
  process.env.DISABLE_TELEMETRY = "1";
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = "1";

  // gh CLI needs GH_TOKEN set in the environment.
  process.env.GH_TOKEN = inputs.githubToken;
}

async function run(): Promise<void> {
  try {
    // Configure git for Docker container environment:
    // 1. Safe directory: /github/workspace has different ownership than node user (UID 1001)
    // 2. Config location: node user can't write to /github/home/.gitconfig
    process.env.GIT_CONFIG_GLOBAL = '/tmp/.gitconfig';
    execSync('git config --global --add safe.directory /github/workspace');

    const inputs: ActionInputs = {
      configPath: core.getInput("config-path") || ".github/ai-skills.yml",
      bundleBaseUrl: core.getInput("bundle-base-url", { required: true }),
      anthropicAuthToken: core.getInput("anthropic-auth-token", { required: true }),
      anthropicBaseUrl: core.getInput("anthropic-base-url"),
      anthropicModel: core.getInput("anthropic-model"),
      githubToken: core.getInput("github-token", { required: true }),
    };

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
    await installSkills(inputs.configPath, inputs.bundleBaseUrl);

    // 2. Decide which skills should run for this event.
    const matched = filterSkillsFromFile(inputs.configPath, eventName, eventAction, requestedSkill);

    if (matched.length === 0) {
      core.info("No skills matched the current event — exiting.");
      return;
    }

    // 3. Apply Claude Code env now (after install, before running skills).
    applyClaudeCodeEnv(inputs);

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
