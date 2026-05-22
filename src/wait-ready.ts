// waitForReady — poll a freshly-launched agent's screen until it's past the
// `--dangerously-load-development-channels` consent modal. Crew's
// autoConfirmDevChannel polls + sends CR; we wait until that's completed
// AND the screen has rendered something past the modal.
//
// Without this gate, spawn returns before consent clears. A close-immediately
// dance sends `/exit` keystrokes into the consent prompt (which ignores
// non-CR input), and the agent dies stuck on the modal — that's the failure
// mode alex hit during the bridge 0.2.2 sanity check.
//
// Heuristic: wait for the consent marker to be ABSENT for one observation,
// but require at least `min_wait_ms` to have elapsed before declaring ready.
// The minimum prevents a false-positive where the screen hasn't drawn the
// marker yet because Claude is still starting up. If we never see the
// marker at all (dev-channels disabled), we still return after `min_wait_ms`.

import type { Orchestrator } from "@agiterra/crew-tools";

export interface WaitForReadyOptions {
  /** Minimum elapsed time before we trust the absent-marker signal. Defaults to 800ms. */
  min_wait_ms?: number;
  /** Hard cap on polling. Defaults to 15000ms. */
  max_wait_ms?: number;
  /** Poll interval. Defaults to 200ms. */
  poll_interval_ms?: number;
}

export interface WaitForReadyResult {
  /** True if the agent is past consent. False if the deadline expired. */
  ready: boolean;
  /** True if we observed the consent marker at any point during polling. */
  saw_consent: boolean;
  /** Total milliseconds spent polling. */
  elapsed_ms: number;
}

const CONSENT_MARKER = "Enter to confirm";

export async function waitForReady(
  orchestrator: Orchestrator,
  agent_id: string,
  options: WaitForReadyOptions = {},
): Promise<WaitForReadyResult> {
  const min_wait_ms = options.min_wait_ms ?? 800;
  const max_wait_ms = options.max_wait_ms ?? 15_000;
  const poll_interval_ms = options.poll_interval_ms ?? 200;

  const start_ms = Date.now();
  let saw_consent = false;

  while (Date.now() - start_ms < max_wait_ms) {
    let buf: string | undefined;
    try {
      buf = await orchestrator.readAgent(agent_id);
    } catch {
      // Screen may be momentarily unavailable during startup; treat as no signal.
    }

    const has_marker = buf?.includes(CONSENT_MARKER) ?? false;
    if (has_marker) saw_consent = true;

    const elapsed_ms = Date.now() - start_ms;
    if (!has_marker && elapsed_ms >= min_wait_ms) {
      return { ready: true, saw_consent, elapsed_ms };
    }

    await new Promise((r) => setTimeout(r, poll_interval_ms));
  }

  return {
    ready: false,
    saw_consent,
    elapsed_ms: Date.now() - start_ms,
  };
}
