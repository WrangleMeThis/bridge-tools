// composeBrief — dry-run inspection of what spawn WOULD do without spawning.
//
// Returns the assembled env, resolved placement, and hook-dispatch plan that
// spawn would produce given the same SpawnOptions. Lets the orchestrator
// verify before committing — useful when integrating a new role set or
// when adding a new capability to the hook registry.
//
// Note: composeBrief does NOT call hooks. It only reports which hooks WOULD
// run for the declared capabilities. Hooks may have side effects (e.g.,
// minting a GitHub token); we don't want a dry-run to mint a token. The hook
// run-plan is informational only.

import type { SpawnOptions, BridgeHook } from "./types.js";
import type { PaneNearResult } from "./pane-near.js";
import { validatePlacement } from "./placement.js";
import type { Orchestrator } from "@agiterra/crew-tools";

export interface ComposeBriefResult {
  agent_id: string;
  display_name: string;
  roles: string[];
  task: string;
  capabilities: string[];
  /** Capabilities with a registered pre_spawn hook. The hooks themselves are NOT invoked. */
  hooks_that_would_run: string[];
  /** Capabilities declared but with no registered hook. Silently skipped at spawn time. */
  capabilities_without_hooks: string[];
  /** Env map preview — excludes hook contributions (since hooks are not called). */
  env_preview: Record<string, string>;
  /** Resolved placement spec, if relative placement was supplied. */
  placement: PaneNearResult | undefined;
  /** Notes / warnings the orchestrator should review. */
  notes: string[];
}

export interface ComposeBriefDeps {
  orchestrator: Orchestrator;
  wire_url: string;
  parent_agent_id: string;
}

export function composeBrief(
  opts: SpawnOptions,
  deps: ComposeBriefDeps,
  registry: ReadonlyMap<string, BridgeHook>,
): ComposeBriefResult {
  const notes: string[] = [];
  const display_name = opts.display_name ?? opts.agent_id;

  const hooks_that_would_run: string[] = [];
  const capabilities_without_hooks: string[] = [];
  for (const cap of opts.capabilities ?? []) {
    if (registry.has(cap)) hooks_that_would_run.push(cap);
    else capabilities_without_hooks.push(cap);
  }
  if (capabilities_without_hooks.length > 0) {
    notes.push(
      `Capabilities declared but with no registered hook (silently skipped at spawn): ${capabilities_without_hooks.join(", ")}. Install the corresponding bridge-X integration plugin to enable.`,
    );
  }

  const env_preview: Record<string, string> = {
    AGENT_ID: opts.agent_id,
    AGENT_NAME: display_name,
    // AGENT_PRIVATE_KEY would be minted at spawn time — placeholder here.
    AGENT_PRIVATE_KEY: "<minted at spawn>",
    AGENT_PARENT: opts.sponsor?.parent_identity ?? deps.parent_agent_id,
    AGENT_ROLES: opts.roles.join(","),
    WIRE_URL: deps.wire_url,
    ...(opts.env ?? {}),
  };

  // Validate via the same code path spawn uses, so dry-run matches real-run.
  // A failing validation surfaces as a note rather than throwing — composeBrief
  // is inspect-only.
  let placement: PaneNearResult | undefined;
  try {
    // Pass deps.parent_agent_id so dry-run mirrors real-run's default-to-visible
    // synthesis (omitted placement → land near caller). Historical bug:
    // composeBrief used to diverge from spawn on omitted placement.
    const validated = validatePlacement(opts.placement, deps.orchestrator, deps.parent_agent_id);
    switch (validated.kind) {
      case "none":
        break;
      case "detached":
        notes.push("Placement is detached — no pane will be created.");
        break;
      case "relative":
        placement = validated.resolved;
        break;
      case "explicit":
        notes.push(
          `Explicit placement: pane will be created in tab '${validated.spec.tab}' ${validated.spec.direction} of '${validated.spec.relative_to}'.`,
        );
        break;
      case "new_tab":
        notes.push(
          `New tab placement: tab '${validated.spec.new_tab}' will be created with a default pane.`,
        );
        break;
      case "new_workspace":
        notes.push(
          `New workspace placement: workspace/tab '${validated.spec.new_workspace}' will be created with a default pane.`,
        );
        break;
    }
  } catch (e) {
    notes.push(`Placement validation failed: ${(e as Error).message}`);
  }

  return {
    agent_id: opts.agent_id,
    display_name,
    roles: opts.roles,
    task: opts.task,
    capabilities: opts.capabilities ?? [],
    hooks_that_would_run,
    capabilities_without_hooks,
    env_preview,
    placement,
    notes,
  };
}
