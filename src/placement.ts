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
 *
 * `defaultAnchor`: caller's identity. When `placement` is omitted, the
 * default is to land the new agent in the caller's workspace ("near me,
 * right of me"). This is the default-to-visible rule — see the comment
 * in the `if (!placement)` branch. Pass `undefined` to opt out and get
 * the historical "no placement, agent runs headless" behavior.
 *
 * `defaultTabName`: tab name to use when the caller can't be resolved as
 * an anchor (e.g. caller isn't crew-registered). When omitted, the
 * fallback degrades to `kind:"none"` (headless). When provided, the
 * fallback creates a fresh tab so the agent is still VISIBLE — the
 * second tier of "default to visible." Recommended: pass something
 * derived from the new agent's identity (e.g. `spawn-${agent_id}`).
 */
export function validatePlacement(
  placement: Placement | undefined,
  orchestrator: Orchestrator,
  defaultAnchor?: string,
  defaultTabName?: string,
): ValidatedPlacement {
  if (!placement) {
    // Default-to-visible: three-tier fallback.
    //   1. Anchor on caller's pane → RelativePlacement (lands next to caller)
    //   2. Caller has no resolvable pane but a defaultTabName is provided
    //      → NewTabPlacement (still visible, just in a fresh tab)
    //   3. Truly nothing → kind:"none" (headless, last-resort fallback)
    //
    // Operators almost always want to SEE the agent they just asked to
    // spin up. Headless creates orphans on the wire that get forgotten.
    // Caller can still opt into headless explicitly with `{ detached: true }`.
    if (defaultAnchor) {
      try {
        const spec: RelativePlacement = { near: defaultAnchor, direction: "right" };
        const resolved = paneNear(spec, { orchestrator });
        return { kind: "relative", spec, resolved };
      } catch {
        // Anchor didn't resolve — caller isn't crew-registered (common on
        // boxes where persistent agents are launched outside crew's pane
        // tracking). Fall through to NewTabPlacement if we have a name.
      }
    }
    if (defaultTabName) {
      // Use NewWorkspacePlacement (functionally equivalent to NewTab in cmux,
      // per spawn.ts handler comment) — its required-field surface is just
      // `new_workspace: string`, which matches what we have. NewTab would
      // also require a `workspace` field we don't know in the fallback path.
      return { kind: "new_workspace", spec: { new_workspace: defaultTabName } };
    }
    return { kind: "none" };
  }

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
