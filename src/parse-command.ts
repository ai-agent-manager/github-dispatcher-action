/**
 * Parse a PR comment body for the `/ai run <skill-name>` command.
 *
 * Returns { skillName } if the comment is a valid command, null otherwise.
 *
 * Rules:
 *   - Command must be on the first non-empty line (prevents accidental
 *     triggers from quoted text or signatures).
 *   - `/ai run` is matched case-insensitively; the skill name is taken
 *     verbatim so it must match the entry in ai-skills.yml exactly.
 *   - Anything after the skill name is ignored for now — leaves room for
 *     future args (e.g. `/ai run docs-v1 --dry-run`) without breaking
 *     existing callers.
 */
function parseCommand(body: string | undefined | null): { skillName: string } | null {
  if (typeof body !== "string") return null;

  const firstLine = body.trim().split("\n")[0]?.trim();
  if (!firstLine) return null;

  const match = firstLine.match(/^\/ai\s+run\s+(\S+)/i);
  if (!match) return null;

  return { skillName: match[1] };
}

export { parseCommand };