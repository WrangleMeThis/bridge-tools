// Shared placement validation. spawn and composeBrief both call this so a
// dry-run that passes guarantees the corresponding real spawn would also
// pass placement validation. Historical bug: composeBrief reported OK for
// {detached:true} and other variants that spawn then rejected — dry-run
// must match real-run.

import type {
  Placement,
  RelativePlacement,
  ExplicitPlacement,
  NewTabPlacement,
  NewWorkspacePlacement,
} from "./types.js";
import { paneNear, type PaneNearResult } from "./pane-near.js";
import type { Orchestrator } from "@agiterra/crew-tools";

/**
 * Result of a successful validation. Carries any precomputed values
 * (resolved placement, anchor lookups) so callers don't repeat the work.
 */
export type ValidatedPlacement =
  | { kind: "detached" }
  | { kind: "relative"; spec: RelativePlacement; resolved: PaneNearResult }
  | { kind: "explicit"; spec: ExplicitPlacement }
  | { kind: "new_tab"; spec: NewTabPlacement }
  | { kind: "new_workspace"; spec: NewWorkspacePlacement }
  | { kind: "none" };

/**
 * Validate a placement against the current crew state. Throws on
 * validation failure. Returns a discriminated result that downstream
 * code can use without re-querying.
 *
 * MUST be called BEFORE any non-reversible work (Wire registration,
 * crew launch). Failed validation should never leave behind partial
 * state.
 */
export function validatePlacement(
  placement: Placement | undefined,
  orchestrator: Orchestrator,
): ValidatedPlacement {
  if (!placement) return { kind: "none" };

  if ("detached" in placement && placement.detached === true) {
    return { kind: "detached" };
  }

  if ("near" in placement) {
    // paneNear throws if the anchor pane/agent doesn't exist.
    const resolved = paneNear(
      { near: placement.near, direction: placement.direction },
      { orchestrator },
    );
    return { kind: "relative", spec: placement, resolved };
  }

  if ("relative_to" in placement) {
    const tab = orchestrator.store.getTab(placement.tab);
    if (!tab) {
      throw new Error(
        `placement: explicit placement tab '${placement.tab}' does not exist`,
      );
    }
    const anchor = orchestrator.store.getPane(placement.relative_to);
    if (!anchor || anchor.tab !== placement.tab) {
      throw new Error(
        `placement: explicit placement anchor pane '${placement.relative_to}' not found in tab '${placement.tab}'`,
      );
    }
    return { kind: "explicit", spec: placement };
  }

  if ("new_tab" in placement) {
    return { kind: "new_tab", spec: placement };
  }

  if ("new_workspace" in placement) {
    return { kind: "new_workspace", spec: placement };
  }

  // Exhaustiveness — TS will flag any new variant added to the union.
  const _exhaustive: never = placement;
  throw new Error(`placement: unrecognized variant ${JSON.stringify(_exhaustive)}`);
}
