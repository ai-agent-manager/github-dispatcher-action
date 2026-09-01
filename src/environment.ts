import type { ToolEnvironment } from "./tools/types.js";

const HARNESS_CREDENTIALS = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "COPILOT_GITHUB_TOKEN",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "INPUT_BUNDLE_ACCESS_TOKEN",
  "INPUT_GATEWAY_API_KEY",
  "INPUT_GITHUB_TOKEN",
  "INPUT_COPILOT_TOKEN",
] as const;

function getBaseEnvironment(source: ToolEnvironment = process.env): ToolEnvironment {
  const environment = { ...source };
  for (const name of HARNESS_CREDENTIALS) delete environment[name];
  return environment;
}

export { getBaseEnvironment };