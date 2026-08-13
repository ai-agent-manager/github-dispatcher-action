export type SkillAutonomy = "observe" | "suggest" | "act";

export interface SkillDefinition {
  name: string;
  on?: ReadonlyArray<string>;
  autonomy?: SkillAutonomy;
  max_budget_usd?: number;
  max_iterations?: number;
  tool?: string;
  /** Model ID for pi (e.g. claude-sonnet-4-6 or litellm/claude-sonnet-4-6). */
  model?: string;
}

export interface SkillsConfig {
  tools?: unknown;
  scope?: unknown;
  skills?: ReadonlyArray<string | SkillDefinition>;
}

export interface MatchedSkill {
  name: string;
  autonomy: SkillAutonomy;
  trigger: string;
  max_budget_usd?: number;
  max_iterations?: number;
  tool: string;
  model?: string;
}

export interface PullRequestRef {
  number?: number;
}

export interface IssueRef {
  number?: number;
  pull_request?: unknown;
}

export interface EventComment {
  body?: string;
  user?: {
    type?: string;
  };
}

export interface EventPayload {
  action?: string;
  pull_request?: PullRequestRef;
  issue?: IssueRef;
  comment?: EventComment;
}
