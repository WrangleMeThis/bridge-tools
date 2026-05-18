// handoff — coordinated graceful exit of a worker agent.
//
// Sequence:
//   1. Send a wire ack for any in-flight IPC addressed to the closing agent
//      (so messages don't get stuck "delivered to gone agent" forever).
//   2. crew.closeAgent — runs /exit so SessionEnd hooks fire (vault save,
//      heartbeat cleanup) before the process dies.
//   3. Optionally pane_close the worker's pane.
//
// Notes:
//   - Bridge does NOT run /knowledge:save on behalf of the closing agent.
//     That's the agent's responsibility — it should run save before
//     signaling ready-to-close. By the time handoff is called, the agent
//     has already persisted its own state.
//   - If the agent's runtime is unresponsive, crew.closeAgent eventually
//     falls through to stopAgent (hard kill) after its timeout.

import type { Orchestrator } from "@agiterra/crew-tools";
import { sendSignedMessage } from "@agiterra/wire-tools";

export interface HandoffOptions {
  /** Agent to close. */
  agent_id: string;
  /** Also close this pane after the agent exits. */
  close_pane?: string;
  /** Timeout for the agent's graceful /exit, ms. Defaults to crew's 10s. */
  timeout_ms?: number;
}

export interface HandoffResult {
  agent_closed: boolean;
  pane_closed: boolean;
  ack_sent: boolean;
}

export interface HandoffDeps {
  orchestrator: Orchestrator;
  wire_url: string;
  parent_agent_id: string;
  parent_signing_key: CryptoKey;
}

export async function handoff(
  opts: HandoffOptions,
  deps: HandoffDeps,
): Promise<HandoffResult> {
  // 1. Wire ack: publish a final bridge.handoff message so any monitors
  //    know the closing agent is going down gracefully (vs being reaped).
  let ack_sent = false;
  try {
    await sendSignedMessage(
      deps.wire_url,
      deps.parent_agent_id,
      deps.parent_signing_key,
      "bridge.handoff",
      { agent_id: opts.agent_id, reason: "graceful_exit" },
      opts.agent_id,
    );
    ack_sent = true;
  } catch {
    ack_sent = false;
  }

  // 2. Close the agent (sends /exit, waits for SessionEnd hooks, then dies).
  let agent_closed = false;
  try {
    await deps.orchestrator.closeAgent(opts.agent_id, undefined, opts.timeout_ms ?? 10_000);
    agent_closed = true;
  } catch {
    agent_closed = false;
  }

  // 3. Optionally close the pane.
  let pane_closed = false;
  if (opts.close_pane) {
    try {
      await deps.orchestrator.closePane(opts.close_pane);
      pane_closed = true;
    } catch {
      pane_closed = false;
    }
  }

  return { agent_closed, pane_closed, ack_sent };
}
