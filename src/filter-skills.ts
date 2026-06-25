import fs from "node:fs";

import yaml from "js-yaml";
import * as core from "@actions/core";

import type { MatchedSkill, SkillAutonomy, SkillDefinition, SkillsConfig } from "./types.js";
import { resolveToolName, validateToolName } from "./tools/index.js";

/**
 * Build the normalised event string(s) the consumer might match against.
 *
 * Extending to other events (push, etc.) means adding cases here.
 */
function getCurrentEvents(eventName: string, eventAction: string): string[] {
  if (eventName === "pull_request") {
    return [`pull_request.${eventAction}`];
  }
  if (eventName === "issue_comment") {
    return [`issue_comment.${eventAction}`];
  }
  return [];
}

function isSkillDefinition(skill: string | SkillDefinition): skill is SkillDefinition {
  return typeof skill === "object" && skill !== null && typeof skill.name === "string";
}

/**
 * Filter the consumer's skill list down to the ones whose `on:` triggers
 * match the current GitHub event.
 *
 * When `requestedSkill` is set (comment-triggered run), only that named
 * skill is considered — every other skill is skipped even if its triggers
 * would otherwise match. This is what stops a single `/ai run` comment
 * from firing every comment-triggered skill at once.
 *
 * Returns an array of objects with everything the dispatcher needs to run
 * each skill: name, autonomy, trigger, and the optional max_budget_usd.
 *
 * Pure function — takes config + event, returns matched. No side effects
 * other than logging. Makes it trivial to unit-test.
 */
function filterSkills(
  config: SkillsConfig,
  eventName: string,
  eventAction: string,
  requestedSkill: string | null = null,
): MatchedSkill[] {
  if (!config.skills || !Array.isArray(config.skills)) {
    throw new Error('"skills" must be a list');
  }

  const currentEvents = getCurrentEvents(eventName, eventAction);
  core.info(`[filter] Event: ${currentEvents.join(", ") || "(none)"}`);
  if (requestedSkill) {
    core.info(`[filter] Requested skill (from comment): ${requestedSkill}`);
  }

  const matched: MatchedSkill[] = [];

  for (const skill of config.skills) {
    // Bare string entries are install-only — no triggers, never run.
    if (typeof skill === "string") {
      core.info(`[filter] Skipping "${skill}" — install-only (no triggers)`);
      continue;
    }

    if (!isSkillDefinition(skill)) continue;

    // Comment-triggered runs target one specific skill — skip the rest.
    if (requestedSkill && skill.name !== requestedSkill) {
      core.info(`[filter] Skipping "${skill.name}" — not the requested skill`);
      continue;
    }

    const triggers = Array.isArray(skill.on) ? skill.on : [];

    if (triggers.length === 0) {
      core.info(`[filter] Skipping "${skill.name}" — no triggers defined`);
      continue;
    }

    const matchedTrigger = triggers.find((trigger) => currentEvents.includes(trigger));

    if (!matchedTrigger) {
      core.info(`[filter] Skipping "${skill.name}" — no trigger match for current event`);
      continue;
    }

    const autonomy: SkillAutonomy = skill.autonomy ?? "observe";
    const tool = resolveToolName(skill.tool, config.tools);

    // Fail fast if tool typo — before install/checkout happens
    const source = skill.tool ? `skill "${skill.name}"` : "config.tools[0]";
    validateToolName(tool, source);

    core.info(`[filter] Matched "${skill.name}" (tool: ${tool}, autonomy: ${autonomy}, trigger: ${matchedTrigger})`);

    matched.push({
      name: skill.name,
      autonomy,
      trigger: matchedTrigger,
      max_budget_usd: skill.max_budget_usd,
      max_iterations: skill.max_iterations,
      model: skill.model,
      tool,
    });
  }

  core.info(`[filter] ${matched.length} skill(s) matched`);
  return matched;
}

/**
 * Convenience wrapper that loads the YAML and calls filterSkills.
 */
function filterSkillsFromFile(
  configPath: string,
  eventName: string,
  eventAction: string,
  requestedSkill: string | null = null,
): MatchedSkill[] {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config = yaml.load(fs.readFileSync(configPath, "utf-8")) as SkillsConfig;
  return filterSkills(config, eventName, eventAction, requestedSkill);
}

export { filterSkills, filterSkillsFromFile };
