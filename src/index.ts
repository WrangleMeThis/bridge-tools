// Public API surface for @agiterra/bridge-tools.
// MCP adapters (bridge-claude-code, bridge-codex) import from here and wrap
// these functions as MCP tools.

export type {
  Placement,
  RelativePlacement,
  ExplicitPlacement,
  NewTabPlacement,
  NewWorkspacePlacement,
  SponsorSpec,
  SpawnOptions,
  SpawnResult,
  BridgeHook,
  BridgeHookStage,
  BridgeHookContext,
  BridgeHookContribution,
  Role,
  FleetDefaults,
} from "./types.js";

export { spawn } from "./spawn.js";
