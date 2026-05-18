// close — collapsed wrap-up dance: snapshot the agent's screen, close the
// agent, optionally close its pane.
//
// Per the orchestrator-is-responsible doctrine: bridge does NOT enforce any
// preconditions (no "did you complete the audit checklist" gate). It just
// collapses the mechanical N-step dance into one call. The orchestrator
// decides when to call close based on whatever discipline checks they
// maintain upstream.
//
// Sequence:
//   1. crew.readAgent — capture the worker's terminal state (for the
//      orchestrator's audit / Linear update / journal entry, BEFORE the
//      session is gone).
//   2. crew.closeAgent — graceful /exit.
//   3. crew.closePane (if pane name supplied).

import type { Orchestrator } from "@agiterra/crew-tools";

export interface CloseOptions {
  agent_id: string;
  close_pane?: string;
  /** Skip the readAgent snapshot. Default false. */
  skip_snapshot?: boolean;
  timeout_ms?: number;
}

export interface CloseResult {
  /** Terminal snapshot taken before close. Empty string if skip_snapshot or readAgent failed. */
  snapshot: string;
  agent_closed: boolean;
  pane_closed: boolean;
}

export interface CloseDeps {
  orchestrator: Orchestrator;
}

export async function close(
  opts: CloseOptions,
  deps: CloseDeps,
): Promise<CloseResult> {
  let snapshot = "";
  if (!opts.skip_snapshot) {
    try {
      snapshot = await deps.orchestrator.readAgent(opts.agent_id);
    } catch {
      snapshot = "";
    }
  }

  let agent_closed = false;
  try {
    await deps.orchestrator.closeAgent(opts.agent_id, undefined, opts.timeout_ms ?? 10_000);
    agent_closed = true;
  } catch {
    agent_closed = false;
  }

  let pane_closed = false;
  if (opts.close_pane) {
    try {
      await deps.orchestrator.closePane(opts.close_pane);
      pane_closed = true;
    } catch {
      pane_closed = false;
    }
  }

  return { snapshot, agent_closed, pane_closed };
}
