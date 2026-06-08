declare module "js-yaml" {
  export function load(_input: string): unknown;
  export function dump(_input: unknown): string;

  const yaml: {
    load: typeof load;
    dump: typeof dump;
  };

  export default yaml;
}

declare module "@actions/github" {
  export const context: {
    eventName: string;
    payload: unknown;
  };
}
