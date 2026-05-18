// paneNear — resolve "near X, direction Y" intent into a concrete pane spec.
//
// Brioche says "spawn an engineer to the right of babka"; paneNear walks the
// crew tree to find babka's pane, computes the placement spec, and returns it.
// Used internally by spawn when a RelativePlacement is supplied, exposed as
// its own helper for cases where the orchestrator wants to plan ahead.

import type { Orchestrator, Pane, Agent } from "@agiterra/crew-tools";

export interface PaneNearOptions {
  /** Anchor — either an agent name or a pane name. Resolved by name lookup. */
  near: string;
  /** Side of the anchor to place at. */
  direction: "right" | "below" | "left" | "above";
}

export interface PaneNearResult {
  /** Resolved tab the new pane should be in. */
  tab: string;
  /** The anchor pane within that tab. */
  anchor_pane: string;
  /** Direction (passed through for downstream pane_create). */
  direction: "right" | "below" | "left" | "above";
  /** crew's splitInCallerWorkspace direction equivalent. */
  split_direction: "right" | "down";
  /** Whether the anchor was resolved via agent name → its pane. */
  via_agent: boolean;
}

export interface PaneNearDeps {
  orchestrator: Orchestrator;
}

export function paneNear(
  opts: PaneNearOptions,
  deps: PaneNearDeps,
): PaneNearResult {
  const store = deps.orchestrator.store;

  // Try pane name first; fall back to agent name → pane lookup.
  let pane: Pane | null = store.getPane(opts.near);
  let via_agent = false;
  if (!pane) {
    const agents: Agent[] = store.listAgents();
    const agent = agents.find((a) => a.id === opts.near);
    if (!agent) {
      throw new Error(
        `paneNear: '${opts.near}' is neither a pane nor an agent name. Known panes: ${store.listPanes().map((p) => p.name).join(", ") || "(none)"}; known agents: ${agents.map((a) => a.id).join(", ") || "(none)"}.`,
      );
    }
    // Agent.pane holds the attached pane name, if any.
    if (!agent.pane) {
      throw new Error(
        `paneNear: agent '${opts.near}' has no attached pane. Specify a pane name directly or attach the agent first.`,
      );
    }
    pane = store.getPane(agent.pane);
    if (!pane) {
      throw new Error(
        `paneNear: agent '${opts.near}' references pane '${agent.pane}' but that pane is not in the crew store (orphan).`,
      );
    }
    via_agent = true;
  }

  const split_direction: "right" | "down" =
    opts.direction === "right" || opts.direction === "left" ? "right" : "down";

  return {
    tab: pane.tab,
    anchor_pane: pane.name,
    direction: opts.direction,
    split_direction,
    via_agent,
  };
}
