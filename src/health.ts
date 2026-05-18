// health — diagnostic across all legs (crew + wire + knowledge).
//
// Read-only. Useful for "is everything wired correctly?" at session start or
// before a complex orchestration push.
//
// Checks:
//   - Wire reachable? (HEAD the wire server)
//   - Crew DB readable? (count of agents + panes)
//   - Knowledge vault present? (does the configured path exist? journal.db present?)

import type { Orchestrator } from "@agiterra/crew-tools";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface HealthOptions {
  /** Path to the orchestrator's knowledge vault (.knowledge/ dir). Optional. */
  vault_path?: string;
}

export interface HealthResult {
  wire: { ok: boolean; latency_ms?: number; error?: string };
  crew: { ok: boolean; agents: number; panes: number; tabs: number; error?: string };
  knowledge: { ok: boolean; vault_path?: string; has_journal?: boolean; error?: string };
  overall_ok: boolean;
}

export interface HealthDeps {
  orchestrator: Orchestrator;
  wire_url: string;
}

export async function health(
  opts: HealthOptions,
  deps: HealthDeps,
): Promise<HealthResult> {
  const result: HealthResult = {
    wire: { ok: false },
    crew: { ok: false, agents: 0, panes: 0, tabs: 0 },
    knowledge: { ok: false },
    overall_ok: false,
  };

  // Wire reachability.
  try {
    const t0 = Date.now();
    const res = await fetch(`${deps.wire_url}/agents?kind=all`, { method: "HEAD" });
    result.wire = {
      ok: res.ok,
      latency_ms: Date.now() - t0,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (e) {
    result.wire = { ok: false, error: (e as Error).message };
  }

  // Crew state.
  try {
    const store = deps.orchestrator.store;
    result.crew = {
      ok: true,
      agents: store.listAgents().length,
      panes: store.listPanes().length,
      tabs: store.listTabs().length,
    };
  } catch (e) {
    result.crew = { ok: false, agents: 0, panes: 0, tabs: 0, error: (e as Error).message };
  }

  // Knowledge vault.
  if (opts.vault_path) {
    try {
      const dir_ok = existsSync(opts.vault_path);
      const journal_ok = existsSync(join(opts.vault_path, "journal.db"));
      result.knowledge = {
        ok: dir_ok,
        vault_path: opts.vault_path,
        has_journal: journal_ok,
        ...(dir_ok ? {} : { error: `vault path missing: ${opts.vault_path}` }),
      };
    } catch (e) {
      result.knowledge = { ok: false, error: (e as Error).message };
    }
  } else {
    result.knowledge = { ok: true, error: "vault_path not supplied — skipped" };
  }

  result.overall_ok = result.wire.ok && result.crew.ok && result.knowledge.ok;
  return result;
}
