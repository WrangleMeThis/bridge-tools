// spawn — the marquee composite function. Collapses Brioche's 6-skill-call
// orchestration dance into a single call.
//
// Sequence executed inside this function:
//   1. Run pre_spawn BridgeHooks for each declared capability
//      → collect env contributions from each hook
//   2. Validate placement against the current crew state (fast, read-only).
//      Done BEFORE any non-reversible work — a failed placement must not
//      leave behind a Wire registration that permanently burns the agent_id.
//   3. Wire identity: orchestrator sponsors a new keypair for the ephemeral
//      → receives back the new private key to forward via env
//   4. Assemble final env: parent identity → hook contributions → per-spawn env
//      (per-spawn env wins on collisions)
//   5. Create the new pane for post-launch attach variants (Explicit/NewTab/
//      NewWorkspace). RelativePlacement is handled inline by launchAgent.
//   6. crew.launchAgent({env, runtime, prompt: task, splitInCallerWorkspace})
//      → forwards env to the spawned process, optionally splits caller's pane
//   7. Attach the agent to the pre-created pane for variants that need it.
//   8. Wait for readiness (consent modal dismissed) unless wait_ready=false.
//      Without this gate the brief is sent into the void while Claude is
//      still in startup, and a fast close-after-spawn dies on the modal.
//   9. wire-ipc kickoff: send a signed `bridge.kickoff` envelope to the new
//      ephemeral carrying the task brief.
//  10. Return SpawnResult with the new agent's id, wire identity, applied
//      capabilities, brief-sent flag, and readiness diagnostics.
//
// Notes:
//   - Roles are opaque tags. Forwarded as AGENT_ROLES env var; bridge does not
//     interpret them. The orchestrator owns prompt assembly upstream of spawn;
//     by the time we're here, `task` is the finished brief.
//   - Partial-failure cleanup: if wire-ipc kickoff fails after the agent
//     launches, the agent stays alive — the orchestrator can retry kickoff
//     or close manually. We do NOT auto-close on kickoff failure because the
//     agent process is already running and may have done useful work.

import type {
  SpawnOptions,
  SpawnResult,
  BridgeHook,
  BridgeHookContribution,
} from "./types.js";
import { validatePlacement } from "./placement.js";
import { waitForReady } from "./wait-ready.js";

import { Orchestrator } from "@agiterra/crew-tools";
import {
  generateKeyPair,
  exportPrivateKey,
  registerOrRefresh,
  sendSignedMessage,
  type KeyPair,
} from "@agiterra/wire-tools";

/** Runtime dependencies spawn needs but doesn't own. The MCP adapter constructs these once at boot and passes them in. */
export interface SpawnDeps {
  /** Crew orchestrator instance. Holds the terminal backend + state DB. */
  orchestrator: Orchestrator;
  /** Wire server URL (e.g., "https://the-wire.ngrok.io"). */
  wire_url: string;
  /** Orchestrator's agent ID — used as the sponsoring identity for the new ephemeral. */
  parent_agent_id: string;
  /** Orchestrator's signing key — signs the registration request. */
  parent_signing_key: CryptoKey;
}

/**
 * Spawn a new agent with the given roles, task, and placement.
 *
 * @param opts spawn arguments
 * @param deps runtime deps (orchestrator, wire url, parent identity + signing key)
 * @param registry pre_spawn BridgeHooks indexed by capability
 * @returns the new agent's id, wire identity, applied capabilities, brief-sent flag, readiness diagnostics
 */
export async function spawn(
  opts: SpawnOptions,
  deps: SpawnDeps,
  registry: ReadonlyMap<string, BridgeHook>,
): Promise<SpawnResult> {
  const new_agent_id = opts.agent_id;
  const display_name = opts.display_name ?? new_agent_id;

  // 0. Require project_dir. Without it, the spawnee inherits the bridge MCP's
  //    cwd (= the bridge plugin directory) instead of the orchestrator's
  //    project — almost always wrong. Per Brian 2026-05-24: "the directory
  //    should be the orchestrator's choice, contingent on the project's needs
  //    or the user's prompt." Making it required forces that explicit choice
  //    instead of silently landing the agent in the bridge repo.
  //    Common call: `project_dir: process.cwd()` to inherit caller's cwd.
  if (!opts.project_dir) {
    throw new Error(
      "spawn: opts.project_dir is required. Pass the working directory the spawnee should start in (e.g. `process.cwd()` to inherit your own cwd, or a project root). Without this, the spawnee silently inherits the bridge plugin's cwd which is almost never what you want.",
    );
  }

  // 1. Run pre_spawn hooks for declared capabilities.
  const applied_capabilities: string[] = [];
  const hook_env: Record<string, string> = {};
  for (const cap of opts.capabilities ?? []) {
    const hook = registry.get(cap);
    if (!hook || hook.stage !== "pre_spawn") continue;
    const contribution = (await hook.run({
      capability: cap,
      stage: "pre_spawn",
      spawn: opts,
      env_so_far: hook_env,
    })) as BridgeHookContribution;
    Object.assign(hook_env, contribution.env ?? {});
    applied_capabilities.push(cap);
  }

  // 2. Validate placement BEFORE any non-reversible work. A failed
  //    placement must not leave behind a Wire registration that
  //    permanently consumes the agent_id (HTTP 409 on retry).
  //    Default-to-visible fallback chain (see placement.ts):
  //      - omitted placement + caller has a pane → land next to caller
  //      - omitted placement + caller is unanchored → fresh tab named after
  //        the new agent (still visible)
  //      - explicit detached → headless
  //    The defaultTabName uses new_agent_id so the tab is self-identifying
  //    if the fresh-tab fallback fires.
  const validated = validatePlacement(
    opts.placement,
    deps.orchestrator,
    deps.parent_agent_id,
    `spawn-${new_agent_id}`,
  );

  // 3. Wire identity: sponsor a new keypair for the ephemeral.
  const new_keypair: KeyPair = await generateKeyPair();
  const new_privkey_b64 = await exportPrivateKey(new_keypair.privateKey);
  await registerOrRefresh(
    deps.wire_url,
    deps.parent_agent_id,
    deps.parent_signing_key,
    new_agent_id,
    display_name,
    { pubkey: new_keypair.publicKey, force_rotate: opts.force_rotate },
  );

  // 4. Assemble env. Precedence (lowest → highest): hook contributions,
  //    bridge-required identity vars, per-spawn env overrides.
  const env: Record<string, string> = {
    ...hook_env,
    AGENT_ID: new_agent_id,
    AGENT_NAME: display_name,
    AGENT_PRIVATE_KEY: new_privkey_b64,
    AGENT_PARENT: opts.sponsor?.parent_identity ?? deps.parent_agent_id,
    AGENT_ROLES: opts.roles.join(","),
    WIRE_URL: deps.wire_url,
    ...(opts.env ?? {}),
  };

  // 5. Create the new pane for post-launch attach variants. RelativePlacement
  //    is handled inline by launchAgent's splitInCallerWorkspace below.
  let split: { direction: "right" | "down" } | undefined;
  let post_launch_attach: { tab: string; pane?: string } | undefined;

  if (validated.kind === "relative") {
    split = {
      direction:
        validated.spec.direction === "right" || validated.spec.direction === "left"
          ? "right"
          : "down",
    };
  } else if (validated.kind === "explicit") {
    const new_pane = await deps.orchestrator.createPane(
      validated.spec.tab,
      undefined,
      validated.spec.direction === "right" || validated.spec.direction === "left"
        ? "right"
        : "below",
      validated.spec.relative_to,
    );
    post_launch_attach = { tab: validated.spec.tab, pane: new_pane.name };
  } else if (validated.kind === "new_tab") {
    const tab = await deps.orchestrator.createTab(validated.spec.new_tab);
    post_launch_attach = { tab: tab.name, pane: tab.pane?.name };
  } else if (validated.kind === "new_workspace") {
    // crew's createTab doubles as workspace creation in cmux; in iTerm it
    // creates a tab in the current window. Refine if/when crew exposes a
    // dedicated new-workspace primitive.
    const tab = await deps.orchestrator.createTab(validated.spec.new_workspace);
    post_launch_attach = { tab: tab.name, pane: tab.pane?.name };
  }
  // validated.kind === "detached" | "none" → no split, no post-launch attach.

  // 6. Crew launchAgent. For RelativePlacement we use splitInCallerWorkspace;
  //    for other placement variants the pane was pre-created in step 5 and we
  //    attach POST-launch.
  const launched = await deps.orchestrator.launchAgent({
    env,
    runtime: opts.runtime,
    projectDir: opts.project_dir,
    prompt: opts.task,
    splitInCallerWorkspace: split,
  });

  // 7. Post-launch attach for variants that need it.
  if (post_launch_attach?.pane) {
    try {
      await deps.orchestrator.attachAgent(launched.id, post_launch_attach.pane);
    } catch (e) {
      // Attach failure leaves the agent headless. Surface via a thrown error
      // so the caller can decide whether to handoff() the dangling agent.
      throw new Error(
        `spawn: agent ${launched.id} launched but failed to attach to pane '${post_launch_attach.pane}': ${(e as Error).message}. Use handoff() to close cleanly.`,
      );
    }
  }

  // 8. Wait for the agent to be past the dev-channel consent modal. crew's
  //    autoConfirmDevChannel fires-and-forgets on launch; we poll until it
  //    has completed (or until we time out). Without this, brief_sent:true
  //    is misleading and a fast close-after-spawn races the boot sequence.
  const wait_ready = opts.wait_ready !== false;
  let ready: boolean | undefined;
  let saw_consent: boolean | undefined;
  let ready_elapsed_ms: number | undefined;
  if (wait_ready) {
    const result = await waitForReady(deps.orchestrator, launched.id, {
      max_wait_ms: opts.ready_timeout_ms,
    });
    ready = result.ready;
    saw_consent = result.saw_consent;
    ready_elapsed_ms = result.elapsed_ms;
  }

  // 9. Wire-ipc kickoff: send the task brief on bridge.kickoff topic.
  //    If this fails, the agent is alive but unbriefed — return brief_sent=false
  //    rather than unwinding (the agent process is real work in flight).
  let brief_sent = false;
  try {
    await sendSignedMessage(
      deps.wire_url,
      deps.parent_agent_id,
      deps.parent_signing_key,
      "bridge.kickoff",
      { task: opts.task, roles: opts.roles, applied_capabilities },
      new_agent_id,
    );
    brief_sent = true;
  } catch (_err) {
    // Surface the failure via brief_sent=false; caller decides retry.
    brief_sent = false;
  }

  // Resolve tab from the pane (relative placement) or from post_launch_attach
  // (explicit/new_tab/new_workspace). Either source is fine; we just want the
  // orchestrator to get {tab, pane, screen_pid} in the return so they don't
  // have to do a discovery dance via crew.tab_list + pane_list after every spawn.
  let tab: string | undefined = post_launch_attach?.tab;
  if (!tab && launched.pane) {
    const paneRow = deps.orchestrator.store.getPane(launched.pane);
    tab = paneRow?.tab ?? undefined;
  }

  return {
    agent_id: launched.id,
    pane_name: launched.pane ?? undefined,
    tab,
    screen_pid: launched.screen_pid ?? undefined,
    wire_identity: new_agent_id,
    applied_capabilities,
    brief_sent,
    ready,
    saw_consent,
    ready_elapsed_ms,
  };
}
