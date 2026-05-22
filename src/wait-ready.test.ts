// waitForReady polls the agent's screen until the dev-channel consent marker
// is absent (and min_wait_ms has elapsed). Tests use a fake orchestrator with
// a programmable readAgent that advances a script of screen states.

import { describe, it, expect } from "bun:test";
import { waitForReady } from "./wait-ready.js";
import type { Orchestrator } from "@agiterra/crew-tools";

/** Build an orchestrator stub whose readAgent returns scripted screen states in order. */
function scriptedOrchestrator(states: string[]): Orchestrator {
  let i = 0;
  return {
    readAgent: async () => {
      const state = states[Math.min(i, states.length - 1)];
      i++;
      return state;
    },
  } as unknown as Orchestrator;
}

describe("waitForReady", () => {
  it("returns ready=true after min_wait_ms when the buffer never contains the consent marker", async () => {
    const orch = scriptedOrchestrator(["❯ ready"]);
    const result = await waitForReady(orch, "agent-1", {
      min_wait_ms: 200,
      max_wait_ms: 2000,
      poll_interval_ms: 50,
    });
    expect(result.ready).toBe(true);
    expect(result.saw_consent).toBe(false);
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(200);
  });

  it("waits through the consent modal and returns ready=true once cleared", async () => {
    // First few reads: modal present. Then it clears.
    const orch = scriptedOrchestrator([
      "I am using this for local development\nEnter to confirm",
      "I am using this for local development\nEnter to confirm",
      "I am using this for local development\nEnter to confirm",
      "❯ prompt ready",
    ]);
    const result = await waitForReady(orch, "agent-2", {
      min_wait_ms: 100,
      max_wait_ms: 2000,
      poll_interval_ms: 50,
    });
    expect(result.ready).toBe(true);
    expect(result.saw_consent).toBe(true);
  });

  it("returns ready=false when the consent marker never clears within max_wait_ms", async () => {
    const orch = scriptedOrchestrator(["Enter to confirm"]);
    const result = await waitForReady(orch, "agent-3", {
      min_wait_ms: 50,
      max_wait_ms: 300,
      poll_interval_ms: 50,
    });
    expect(result.ready).toBe(false);
    expect(result.saw_consent).toBe(true);
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(300);
  });

  it("tolerates readAgent throwing transiently during startup", async () => {
    let i = 0;
    const orch = {
      readAgent: async () => {
        i++;
        if (i <= 2) throw new Error("screen not yet available");
        return "❯ ready";
      },
    } as unknown as Orchestrator;
    const result = await waitForReady(orch, "agent-4", {
      min_wait_ms: 150,
      max_wait_ms: 2000,
      poll_interval_ms: 50,
    });
    expect(result.ready).toBe(true);
  });
});
