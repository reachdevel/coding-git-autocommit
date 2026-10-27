import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
export async function acquireLock(gitDirectory, timeoutMs) {
    const path = join(gitDirectory, "coding-git-autocommit.lock");
    const deadline = Date.now() + timeoutMs;
    while (true) {
        try {
            await mkdir(path);
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            if (Date.now() >= deadline)
                return undefined;
            await delay(Math.min(50, Math.max(1, deadline - Date.now())));
            continue;
        }
        try {
            await writeFile(join(path, "owner.json"), JSON.stringify({ pid: process.pid, token: randomUUID(), createdAt: new Date().toISOString() }) + "\n");
        }
        catch (error) {
            await rm(path, { recursive: true, force: true });
            throw error;
        }
        // Never steal a lock based on elapsed time: a slow Git hook may still own it.
        return () => rm(path, { recursive: true, force: true });
    }
}
