// spawn — the marquee composite function. Collapses Brioche's 6-skill-call
// orchestration dance into a single call.
//
// Sequence:
//   1. Resolve placement to a concrete pane spec
//   2. Run pre_spawn hooks for each required capability (from the runtime registry)
//      - merges hook env contributions into the spawn env
//   3. Generate Wire identity for the new ephemeral (sponsor flow)
//   4. Assemble the final env map: fleet defaults → per-spawn env overrides → hook contributions
//   5. crew agent_launch with the assembled env
//   6. pane_create at the resolved position (skip if detached)
//   7. agent_attach (skip if detached)
//   8. wire-ipc kickoff with the task brief
//
// Notes on what spawn does NOT do:
//   - Does NOT interpret `roles` — they're opaque identifier tags passed
//     through to the worker for its own use (wire identity, audit logs).
//     Role definitions / merging / prompt assembly are the orchestrator's job
//     UPSTREAM of spawn. By the time spawn is called, `task` is the finished
//     brief the worker receives.
//   - Does NOT mint tokens, fetch tickets, or do anything domain-specific.
//     Those happen via pre_spawn BridgeHooks contributed by integration plugins
//     (bridge-github, bridge-linear, etc.).
//
// Partial-failure recovery: each step records its progress; if a later step
// fails, earlier side-effects are unwound in reverse order (agent_close,
// pane_close, wire identity revocation).
//
// v0.1.0 — skeleton. Implementation lands incrementally; first end-to-end target
// is "spawn ephemeral Codex agent to the right of babka" working.

import type { SpawnOptions, SpawnResult, BridgeHook } from "./types.js";

/**
 * Spawn a new agent with the given roles, task, and placement.
 *
 * @param opts spawn arguments — roles (opaque tags), task (finished brief),
 *             optional placement/sponsor/env
 * @param registry pre_spawn BridgeHooks indexed by capability (provided by the MCP adapter)
 * @returns the new agent's id, pane handle, wire identity, and applied capabilities
 *
 * @throws if any spawn step fails after exhausting retries (with unwind of prior steps)
 */
export async function spawn(
  opts: SpawnOptions,
  registry: ReadonlyMap<string, BridgeHook>,
): Promise<SpawnResult> {
  // STUB — implementation in progress.
  void opts;
  void registry;
  throw new Error("spawn: not yet implemented (v0.1.0 skeleton)");
}
