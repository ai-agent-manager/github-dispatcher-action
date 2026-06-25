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
 * Subset of ActionInputs that adapters need for env configuration.
 * Avoids coupling adapters to the full action input shape.
 */
export interface ToolEnvInputs {
  anthropicAuthToken: string;
  anthropicBaseUrl: string;
  anthropicModel: string;
  githubToken: string;
  copilotToken: string;
  /** LiteLLM gateway URL (e.g. https://litellm.example.com). */
  litellmBaseUrl: string;
  /** LiteLLM virtual key / gateway API key. */
  litellmApiKey: string;
  /** Default pi model when skill.model is unset (e.g. litellm/claude-sonnet-4-6). */
  piModel: string;
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
   * Called once before any skills run. Receives the full ActionInputs
   * so it can pick what it needs (e.g. anthropicAuthToken for Claude,
   * githubToken for Copilot).
   */
  applyEnv(_inputs: ToolEnvInputs): void;

  /**
   * Build the CLI command string to execute.
   * Separated from execution so it can be unit-tested without execSync.
   */
  buildCommand(_options: ToolRunOptions): string;

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
