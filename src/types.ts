export type Agent = "claude" | "opencode" | "codex";
export type Outcome = "success" | "failure" | "interrupted";

export interface Policy {
  enabled: boolean;
  staging: "all" | "staged";
  skipHooks: boolean;
  autoInit: boolean;
  rootOnly: boolean;
  events: Record<Outcome, boolean>;
  lockTimeoutMs: number;
  gitTimeoutMs: number;
}

export type PolicyInput = Partial<Omit<Policy, "events">> & {
  events?: Partial<Policy["events"]>;
};

export type Configuration = PolicyInput & {
  $schema?: string;
  agents?: Partial<Record<Agent, PolicyInput>>;
};

export interface CommitRequest {
  cwd: string;
  agent: Agent;
  outcome: Outcome;
  sessionId?: string;
  turnId?: string;
  isSubagent?: boolean;
  defaults?: PolicyInput;
  overrides?: PolicyInput;
  configHome?: string;
}

export interface CommitResult {
  status: "committed" | "skipped" | "error";
  reason: string;
  root?: string;
  commit?: string;
  message?: string;
}
