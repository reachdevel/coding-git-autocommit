import { createOpenCodeSetup } from "./opencode.js";
/** Native OpenCode v2 entry point, bundled in the standalone package. */
export declare const GitAutocommitPlugin: {
    id: string;
    setup: (ctx: import("./opencode.js").OpenCodeContext) => () => Promise<void>;
};
export { createOpenCodeSetup };
export default GitAutocommitPlugin;
