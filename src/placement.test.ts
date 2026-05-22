// Unit tests for validatePlacement. Uses minimal hand-rolled orchestrator
// stubs — full crew integration is covered by the bridge-claude-code
// adapter's end-to-end smoke.

import { describe, it, expect } from "bun:test";
import { validatePlacement } from "./placement.js";
import type { Orchestrator } from "@agiterra/crew-tools";

function stubOrchestrator(opts: {
  tabs?: Record<string, unknown>;
  panes?: Record<string, { tab: string }>;
}): Orchestrator {
  return {
    store: {
      getTab: (name: string) => opts.tabs?.[name],
      getPane: (name: string) => opts.panes?.[name],
    },
  } as unknown as Orchestrator;
}

describe("validatePlacement", () => {
  it("returns 'none' when placement is undefined", () => {
    const result = validatePlacement(undefined, stubOrchestrator({}));
    expect(result.kind).toBe("none");
  });

  it("returns 'detached' when placement.detached is true (any variant)", () => {
    const result = validatePlacement(
      { near: "walnut", direction: "right", detached: true },
      stubOrchestrator({ panes: { walnut: { tab: "main" } } }),
    );
    expect(result.kind).toBe("detached");
  });

  it("returns 'detached' for explicit placement with detached:true (no anchor lookup)", () => {
    // Validates that detached short-circuits placement validation — even
    // missing tabs/anchors shouldn't matter for detached spawns.
    const result = validatePlacement(
      {
        workspace: "w",
        tab: "nonexistent",
        relative_to: "nonexistent",
        direction: "right",
        detached: true,
      },
      stubOrchestrator({}),
    );
    expect(result.kind).toBe("detached");
  });

  it("validates RelativePlacement via paneNear (anchor must exist)", () => {
    const result = validatePlacement(
      { near: "walnut", direction: "right" },
      stubOrchestrator({ panes: { walnut: { tab: "main" } } }),
    );
    expect(result.kind).toBe("relative");
    if (result.kind === "relative") {
      expect(result.spec.near).toBe("walnut");
    }
  });

  it("validates ExplicitPlacement: tab and anchor pane must both exist", () => {
    const result = validatePlacement(
      {
        workspace: "w",
        tab: "engineering",
        relative_to: "oak",
        direction: "right",
      },
      stubOrchestrator({
        tabs: { engineering: {} },
        panes: { oak: { tab: "engineering" } },
      }),
    );
    expect(result.kind).toBe("explicit");
  });

  it("throws when ExplicitPlacement tab does not exist", () => {
    expect(() =>
      validatePlacement(
        {
          workspace: "w",
          tab: "missing-tab",
          relative_to: "oak",
          direction: "right",
        },
        stubOrchestrator({ panes: { oak: { tab: "other-tab" } } }),
      ),
    ).toThrow(/explicit placement tab 'missing-tab' does not exist/);
  });

  it("throws when ExplicitPlacement anchor pane is in a different tab", () => {
    expect(() =>
      validatePlacement(
        {
          workspace: "w",
          tab: "engineering",
          relative_to: "oak",
          direction: "right",
        },
        stubOrchestrator({
          tabs: { engineering: {} },
          panes: { oak: { tab: "different-tab" } },
        }),
      ),
    ).toThrow(/anchor pane 'oak' not found in tab 'engineering'/);
  });

  it("returns 'new_tab' without runtime lookup (creation happens at spawn time)", () => {
    const result = validatePlacement(
      { workspace: "w", new_tab: "fresh" },
      stubOrchestrator({}),
    );
    expect(result.kind).toBe("new_tab");
  });

  it("returns 'new_workspace' without runtime lookup", () => {
    const result = validatePlacement(
      { new_workspace: "side-quest" },
      stubOrchestrator({}),
    );
    expect(result.kind).toBe("new_workspace");
  });
});
