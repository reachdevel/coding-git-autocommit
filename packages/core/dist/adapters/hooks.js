import { autoCommit } from "../engine.js";
export function parseHookInput(input) {
    if (Buffer.byteLength(input) > 1024 * 1024)
        throw new Error("Hook input exceeds 1 MiB");
    const value = JSON.parse(input);
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Hook input must be a JSON object");
    return value;
}
export async function runHook(agent, input, configHome) {
    try {
        const payload = parseHookInput(input);
        const event = payload.hook_event_name;
        let outcome;
        if (event === "Stop")
            outcome = "success";
        else if (event === "StopFailure" && agent === "claude")
            outcome = "failure";
        else
            return { status: "skipped", reason: `Unsupported ${agent} event: ${String(event)}` };
        if (payload.stop_hook_active === true)
            return { status: "skipped", reason: "Stop-hook continuation" };
        if (payload.permission_mode === "plan")
            return { status: "skipped", reason: "Planning mode" };
        const cwd = typeof payload.cwd === "string" ? payload.cwd
            : agent === "claude" ? process.env.CLAUDE_PROJECT_DIR : undefined;
        if (!cwd)
            return { status: "skipped", reason: "Hook input has no working directory" };
        return await autoCommit({
            cwd, agent, outcome, configHome,
            sessionId: typeof payload.session_id === "string" ? payload.session_id : undefined,
            turnId: typeof payload.turn_id === "string" ? payload.turn_id : undefined,
            isSubagent: Boolean(payload.agent_id || payload.parent_session_id || payload.parentID),
        });
    }
    catch (error) {
        return { status: "error", reason: error instanceof Error ? error.message : String(error) };
    }
}
export function reportResult(agent, result) {
    // Never send Git's human-readable output to a host's JSON stdout channel.
    console.error(`[coding-git-autocommit:${agent}] ${JSON.stringify(result)}`);
}
