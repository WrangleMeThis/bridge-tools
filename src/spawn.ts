// spawn — the marquee composite function. Collapses Brioche's 6-skill-call
// orchestration dance into a single call.
//
// Sequence executed inside this function:
//   1. Run pre_spawn BridgeHooks for each declared capability
//      → collect env contributions from each hook
//   2. Wire identity: orchestrator sponsors a new keypair for the ephemeral
//      → receives back the new private key to forward via env
//   3. Assemble final env: parent identity → hook contributions → per-spawn env
//      (per-spawn env wins on collisions)
//   4. crew.launchAgent({env, runtime, prompt: task, splitInCallerWorkspace})
//      → forwards env to the spawned process, optionally splits caller's pane
//   5. wire-ipc kickoff: send a signed `bridge.kickoff` envelope to the new
//      ephemeral carrying the task brief
//   6. Return SpawnResult with the new agent's id, wire identity, applied
//      capabilities, and brief-sent flag.
//
// Notes:
//   - Roles are opaque tags. Forwarded as AGENT_ROLES env var; bridge does not
//     interpret them. The orchestrator owns prompt assembly upstream of spawn;
//     by the time we're here, `task` is the finished brief.
//   - Placement v1: only RelativePlacement is wired (via crew's
//     splitInCallerWorkspace, supported by cmux). Explicit/new-tab/
//     new-workspace placement variants throw NotImplementedError until v0.3.
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
 * @returns the new agent's id, wire identity, applied capabilities, brief-sent flag
 */
export async function spawn(
  opts: SpawnOptions,
  deps: SpawnDeps,
  registry: ReadonlyMap<string, BridgeHook>,
): Promise<SpawnResult> {
  const new_agent_id = opts.agent_id;
  const display_name = opts.display_name ?? new_agent_id;

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

  // 2. Wire identity: sponsor a new keypair for the ephemeral.
  const new_keypair: KeyPair = await generateKeyPair();
  const new_privkey_b64 = await exportPrivateKey(new_keypair.privateKey);
  await registerOrRefresh(
    deps.wire_url,
    deps.parent_agent_id,
    deps.parent_signing_key,
    new_agent_id,
    display_name,
    { pubkey: new_keypair.publicKey },
  );

  // 3. Assemble env. Precedence (lowest → highest): hook contributions,
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

  // 4. Resolve placement → splitInCallerWorkspace. v1 only handles the
  //    relative variant; others throw until v0.3.
  const placement = opts.placement;
  let split: { direction: "right" | "down" } | undefined;
  if (placement) {
    if ("near" in placement) {
      if (placement.detached) {
        split = undefined;
      } else if (placement.direction === "right" || placement.direction === "left") {
        split = { direction: "right" };
      } else {
        split = { direction: "down" };
      }
    } else {
      throw new Error(
        `spawn: placement variant not yet implemented in v0.2.0 (${JSON.stringify(placement)}). Only RelativePlacement (near+direction) is wired so far.`,
      );
    }
  }

  // 5. Crew launchAgent.
  const launched = await deps.orchestrator.launchAgent({
    env,
    runtime: opts.runtime,
    projectDir: opts.project_dir,
    prompt: opts.task,
    splitInCallerWorkspace: split,
  });

  // 6. Wire-ipc kickoff: send the task brief on bridge.kickoff topic.
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

  return {
    agent_id: launched.id,
    wire_identity: new_agent_id,
    applied_capabilities,
    brief_sent,
  };
}
