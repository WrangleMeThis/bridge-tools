// Role definitions are NOT bridge's responsibility.
//
// Brioche (and any other orchestrator) owns:
//   - what roles look like
//   - where role files live (typically the orchestrator's vault)
//   - how roles compose (orchestrator assembles the final brief before calling spawn)
//
// bridge-tools provides only:
//   - The optional `Role` TypeScript type so orchestrator role files can be type-safe
//     (re-exported from "@agiterra/bridge-tools" main entry, not from a registry)
//
// bridge.spawn takes a finished `task` brief and a list of `roles` as opaque
// identifier tags (used for wire identity, audit logs, and forwarding to the
// spawned worker). bridge does not interpret role names, look them up, or merge
// fragments — that's the orchestrator's job upstream of spawn.

export {};
