import { CONFIG_FILE } from "./config.js";
import type { CommitRequest, CommitResult } from "./types.js";
/** Errors become results so a failed auto-commit never blocks the host agent. */
export declare function autoCommit(request: CommitRequest): Promise<CommitResult>;
export { CONFIG_FILE };
