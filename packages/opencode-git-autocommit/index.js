import { createOpenCodeSetup } from "coding-git-autocommit/opencode";

const GitAutocommitPlugin = {
  id: "git-autocommit",
  setup: createOpenCodeSetup(),
};

export { GitAutocommitPlugin };
export default GitAutocommitPlugin;
