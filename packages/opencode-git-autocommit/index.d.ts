import { createOpenCodeSetup } from "coding-git-autocommit/opencode";
declare const GitAutocommitPlugin: {
  id: string;
  setup: ReturnType<typeof createOpenCodeSetup>;
};
export { GitAutocommitPlugin };
export default GitAutocommitPlugin;
