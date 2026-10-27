import { createOpenCodeSetup } from "./opencode.js";
/** Native OpenCode v2 entry point, bundled in the standalone package. */
export const GitAutocommitPlugin = {
    id: "git-autocommit",
    setup: createOpenCodeSetup(),
};
export { createOpenCodeSetup };
export default GitAutocommitPlugin;
