import { autoCommit } from "../engine.js";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { reportResult } from "./hooks.js";
import type { CommitRequest, CommitResult, Outcome } from "../types.js";

export interface OpenCodeEvent {
  id?: string;
  type: string;
  data?: unknown;
  location?: { directory: string };
}

export interface OpenCodeContext {
  location: { directory: string };
  event: { subscribe(options: { signal: AbortSignal }): AsyncIterable<OpenCodeEvent> };
  session: { get(options: { sessionID: string }): Promise<{ parentID?: string } | null | undefined> };
}

const OUTCOMES: Record<string, Outcome> = {
  "session.execution.succeeded": "success",
  "session.execution.failed": "failure",
  "session.execution.interrupted": "interrupted",
};

export interface OpenCodeSetupOptions {
  /** Injection points keep the host lifecycle testable without starting OpenCode. */
  commit?: (request: CommitRequest) => Promise<CommitResult>;
  report?: (result: CommitResult) => void;
  configHome?: string;
}

export function createOpenCodeSetup(options: OpenCodeSetupOptions = {}): (ctx: OpenCodeContext) => () => Promise<void> {
  return (ctx) => {
    const controller = new AbortController();
    const report = options.report ?? ((result: CommitResult) => reportResult("opencode", result));
    const run = options.commit ?? autoCommit;
    const task = (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (controller.signal.aborted) break;
        const outcome = OUTCOMES[event.type];
        if (!outcome || typeof event.data !== "object" || event.data === null) continue;
        if (event.location?.directory) {
          const canonical = async (directory: string) => realpath(directory).catch(() => resolve(directory));
          if (await canonical(event.location.directory) !== await canonical(ctx.location.directory)) continue;
        }
        const data = event.data as Record<string, unknown>;
        if (typeof data.sessionID !== "string") continue;
        let isSubagent = false;
        try {
          const session = await ctx.session.get({ sessionID: data.sessionID });
          isSubagent = Boolean(session?.parentID);
        } catch {
          // Retain the legacy adapter's behavior if OpenCode cannot resolve parentage.
          report({ status: "skipped", reason: "Session parentage unavailable; applying legacy root-session fallback" });
        }
        if (controller.signal.aborted) break;
        report(await run({
          cwd: ctx.location.directory, agent: "opencode", outcome, isSubagent,
          sessionId: data.sessionID,
          // Never use sessionID alone to deduplicate separate runs of one session.
          turnId: event.id,
          defaults: { autoInit: true }, configHome: options.configHome,
        }));
      }
    })().catch(error => {
      if (!controller.signal.aborted) report({ status: "error", reason: error instanceof Error ? error.message : String(error) });
    });
    return async () => { controller.abort(); await task; };
  };
}
