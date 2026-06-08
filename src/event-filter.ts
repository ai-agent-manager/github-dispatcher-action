import type { EventPayload } from "./types.js";

import * as core from "@actions/core";

/**
 * Decide whether this GitHub event is in scope for the dispatcher.
 *
 * Returns { proceed, reason } so the caller can log a clear exit message.
 * Kept separate from filterSkills so that file stays a pure config→skills
 * function — this one is about the event itself, not the skill list.
 */
function shouldProcessEvent(
  eventName: string,
  payload: EventPayload,
): { proceed: true; reason?: never } | { proceed: false; reason: string } {
  if (eventName === "pull_request") {
    return { proceed: true };
  }

  if (eventName === "issue_comment") {
    // issue_comment fires on both issues and PRs — we only care about PRs.
    if (!payload.issue?.pull_request) {
      return { proceed: false, reason: "comment is on an issue, not a PR" };
    }
    // Bot comments would re-trigger the dispatcher on every skill output.
    if (payload.comment?.user?.type === "Bot") {
      return { proceed: false, reason: "comment author is a bot" };
    }
    return { proceed: true };
  }

  core.debug(`Unsupported event received: ${eventName}`);
  return { proceed: false, reason: `event "${eventName}" is not supported` };
}

export { shouldProcessEvent };