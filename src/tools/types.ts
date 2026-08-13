import type { MatchedSkill } from "../types.js";

/**
 * Tool-agnostic budget/limit configuration passed to adapters.
 *
 * Claude Code uses dollar-based budgets; Copilot uses iteration counts.
 * The adapter decides which field to consume. If neither is set on the
 * skill, the adapter falls back to its own default.
 */
export interface ToolRunOptions {
  /** The matched skill being run — adapters can read any field. */
  skill: MatchedSkill;
  /** Absolute path to a file containing the full prompt text. */
  promptPath: string;
  /** Prompt text passed as a CLI argument (Claude Code / Copilot). */
  prompt: string;
}

/**
 * Result from running a tool against a skill.
 */
export interface ToolRunResult {
  output: string;
  budgetHit: boolean;
}

/**
 * Budget/limit detection result.
 */
export interface BudgetHitResult {
  hit: boolean;
}

/**
 * Gateway-shaped credentials passed to adapters.
 *
 * Consumer workflows should set gateway-* inputs (or repo vars/secrets
 * AI_GATEWAY_URL / AI_GATEWAY_API_KEY / AI_MODEL). Deprecated anthropic-* /
 * litellm-* / pi-model aliases are resolved before adapters run.
 *
 * Adapters map these to vendor-specific env vars at applyEnv time only.
 */
export interface ToolEnvInputs {
  /** Shared gateway base URL (Claude Code + pi). */
  gatewayBaseUrl: string;
  /**
   * Shared auth hook — gateway API key for Claude/pi, or Copilot user PAT when
   * github-copilot has no override.
   */
  gatewayApiKey: string;
  /** Shared default model (Claude Code + pi). Overridable per skill. */
  defaultModel: string;
  /** Token used for gh CLI / PR comments. */
  githubToken: string;
  /**
   * Optional Copilot PAT override for mixed gateway + Copilot repos.
   * When empty, github-copilot falls back to gatewayApiKey.
   */
  copilotTokenOverride: string;
}

/**
 * Each supported AI tool implements this interface.
 *
 * Adapters are stateless — all configuration comes from env vars
 * and the ToolRunOptions passed to buildCommand.
 */
export interface ToolAdapter {
  /** Identifier matching the value in ai-skills.yml tools/skill.tool field. */
  readonly name: string;

  /**
   * Set tool-specific environment variables.
   * Called once before any skills run. Receives gateway-shaped inputs and
   * maps them to the vendor env vars each CLI expects.
   */
  applyEnv(_inputs: ToolEnvInputs): void;

  /**
   * Build the CLI argv to execute (`[bin, ...args]`).
   * Separated from execution so it can be unit-tested without execFileSync.
   * The dispatcher runs this with execFileSync — no shell interpolation.
   */
  buildCommand(_options: ToolRunOptions): string[];

  /**
   * Detect whether the tool's output indicates a budget/limit was hit.
   * Returns { hit: true } if budget was exhausted.
   */
  detectBudgetHit(_stdout: string, _stderr: string): BudgetHitResult;

  /**
   * Human-readable budget warning message for PR comments.
   * Called only when detectBudgetHit returns hit: true.
   */
  formatBudgetWarning(_skill: MatchedSkill): string;
}
