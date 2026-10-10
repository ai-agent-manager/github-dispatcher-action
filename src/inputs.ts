export interface ActionInputs {
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

type GetInput = (_name: string, _options?: { required?: boolean }) => string;
type SetSecret = (_secret: string) => void;

function readSecret(getInput: GetInput, setSecret: SetSecret, name: string, required = false): string {
  const value = getInput(name, { required });
  if (value) setSecret(value);
  return value;
}

function readActionInputs(getInput: GetInput, setSecret: SetSecret): ActionInputs {
  return {
    configPath: getInput("config-path") || ".github/ai-skills.yml",
    bundleBaseUrl: getInput("bundle-base-url", { required: true }),
    bundleAccessToken: readSecret(getInput, setSecret, "bundle-access-token"),
    agentManagerRef: getInput("agent-manager-ref") || "latest",
    gatewayBaseUrl: getInput("gateway-base-url"),
    gatewayApiKey: readSecret(getInput, setSecret, "gateway-api-key"),
    defaultModel: getInput("default-model"),
    githubToken: readSecret(getInput, setSecret, "github-token", true),
    copilotToken: readSecret(getInput, setSecret, "copilot-token"),
  };
}

export { readActionInputs };
