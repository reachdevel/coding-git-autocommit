import { autoCommit } from "../engine.js";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { reportResult } from "./hooks.js";
const OUTCOMES = {
    "session.execution.succeeded": "success",
    "session.execution.failed": "failure",
    "session.execution.interrupted": "interrupted",
};
export function createOpenCodeSetup(options = {}) {
    return (ctx) => {
        const controller = new AbortController();
        const report = options.report ?? ((result) => reportResult("opencode", result));
        const run = options.commit ?? autoCommit;
        const task = (async () => {
            for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
                if (controller.signal.aborted)
                    break;
                const outcome = OUTCOMES[event.type];
                if (!outcome || typeof event.data !== "object" || event.data === null)
                    continue;
                if (event.location?.directory) {
                    const canonical = async (directory) => realpath(directory).catch(() => resolve(directory));
                    if (await canonical(event.location.directory) !== await canonical(ctx.location.directory))
                        continue;
                }
                const data = event.data;
                if (typeof data.sessionID !== "string")
                    continue;
                let isSubagent = false;
                try {
                    const session = await ctx.session.get({ sessionID: data.sessionID });
                    isSubagent = Boolean(session?.parentID);
                }
                catch {
                    // Retain the legacy adapter's behavior if OpenCode cannot resolve parentage.
                    report({ status: "skipped", reason: "Session parentage unavailable; applying legacy root-session fallback" });
                }
                if (controller.signal.aborted)
                    break;
                report(await run({
                    cwd: ctx.location.directory, agent: "opencode", outcome, isSubagent,
                    sessionId: data.sessionID,
                    // Never use sessionID alone to deduplicate separate runs of one session.
                    turnId: event.id,
                    defaults: { autoInit: true }, configHome: options.configHome,
                }));
            }
        })().catch(error => {
            if (!controller.signal.aborted)
                report({ status: "error", reason: error instanceof Error ? error.message : String(error) });
        });
        return async () => { controller.abort(); await task; };
    };
}
