// spawn — the marquee composite function. Collapses Brioche's 6-skill-call
// orchestration dance into a single call.
//
// Sequence:
//   1. Resolve placement to a concrete pane spec (calls into paneNear logic)
//   2. Merge roles → MergedRoleManifest (capabilities, plugins, prompt, env defaults)
//      - surfaces conflicts; honors fleet conflict_policy
//   3. Run pre_spawn hooks for each required capability (from the runtime registry)
//      - merges hook env contributions into the spawn env
//   4. Generate Wire identity for the new ephemeral (sponsor flow)
//   5. Assemble the final env map: fleet defaults → role defaults → hook contributions → per-spawn env
//   6. crew agent_launch with the env + role plugins applied
//   7. pane_create at the resolved position (skip if detached)
//   8. agent_attach (skip if detached)
//   9. wire-ipc kickoff with the assembled brief
//
// Partial-failure recovery: each step records its progress; if a later step
// fails, earlier side-effects are unwound in reverse order (agent_close,
// pane_close, wire identity revocation).
//
// v0.1.0 — skeleton. Implementation lands incrementally; first end-to-end target
// is "spawn ephemeral Codex agent to the right of babka" working.

import type {
  SpawnOptions,
  SpawnResult,
  BridgeHook,
  MergedRoleManifest,
} from "./types.js";

/**
 * Spawn a new agent with the given roles, task, and placement.
 *
 * @param opts spawn arguments — roles, task, optional placement/sponsor/env
 * @param registry pre_spawn BridgeHooks indexed by capability (provided by the MCP adapter)
 * @returns the new agent's id, pane handle, wire identity, and applied capabilities
 *
 * @throws if role merging fails the configured conflict policy
 * @throws if any spawn step fails after exhausting retries (with unwind of prior steps)
 */
export async function spawn(
  opts: SpawnOptions,
  registry: ReadonlyMap<string, BridgeHook>,
): Promise<SpawnResult> {
  // STUB — see spawn.test.ts for the contract; implementation in progress.
  void opts;
  void registry;
  throw new Error("spawn: not yet implemented (v0.1.0 skeleton)");
}

/**
 * Merge a list of role names into a single manifest. Resolves precedence
 * (call args > last-listed-role > fleet defaults) and surfaces conflicts.
 *
 * Exported separately so compose-brief can dry-run the merge for inspection.
 */
export function mergeRoles(_roles: string[]): MergedRoleManifest {
  // STUB
  throw new Error("mergeRoles: not yet implemented (v0.1.0 skeleton)");
}
