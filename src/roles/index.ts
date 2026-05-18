// Canonical role definitions. Each role contributes:
//   - prompt fragment (system message addition)
//   - default plugins to apply on the ephemeral
//   - capability declarations (e.g., "github") that trigger pre_spawn hooks
//   - vault scope hint
//   - env defaults
//
// Roles compose. An agent invoked with roles: ["backend-engineer", "solidity-engineer"]
// gets the union of both, with conflict detection on prompt-fragments / plugins /
// vault scopes / env defaults.
//
// Add new roles as new .ts files in this directory and re-export from here.
// External adopters can extend by writing their own bridge-X integration plugin
// that contributes additional roles via the BridgeHook contract.

// (No roles defined yet — v0.1.0 ships with the role-merging machinery but
// no pre-baked role catalog. Adopters define their own; we'll add canonical
// Agiterra roles incrementally as the composite tools light up.)

export const ROLES = {} as const;
