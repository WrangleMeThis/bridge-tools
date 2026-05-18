# @agiterra/bridge-tools

Runtime-agnostic composite functions for **bridge** — the orchestrator's plugin within the Agiterra Multi-Agent Toolkit (AMAT).

bridge collapses the orchestrator's N-step dances (wire register → env-map assembly → crew launch → pane create → attach → IPC kickoff) into single function calls. This package is the library layer; the MCP servers that expose these functions to Claude Code and Codex live in `bridge-claude-code` and `bridge-codex`.

## Composite functions

| Function | Collapses |
|---|---|
| `spawn` | wire register → env assembly → pre-spawn hooks → crew agent_launch → pane_create → attach → wire-ipc kickoff |
| `paneNear` | crew tree walk → resolved pane spec |
| `personaiInit` | knowledge vault scaffold + spawn scripts + wire register-permanent + crew machine_register |
| `health` | wire status + knowledge vault integrity + crew session liveness |
| `handoff` | knowledge save + wire ack-pending-ipc + crew agent_close |
| `dispatch` | match-or-spawn by role + IPC + monitor return |
| `close` | agent_read wrap-up → audit-checklist verify → Linear Done → agent_close → pane_close |
| `composeBrief` | merge role fragments + assemble final brief (dry-run, no spawn) |

## Integration plugins — `bridge-X` pattern

bridge stays domain-naive. Capability-specific behavior (GitHub minting, Linear ticket sync, etc.) ships as separate **integration plugins** that implement the `BridgeHook` contract:

```ts
import type { BridgeHook } from "@agiterra/bridge-tools/types";

export const bridgeHooks: BridgeHook[] = [
  {
    stage: "pre_spawn",
    capability: "github",
    async run(ctx) {
      const token = await mintInstallationToken(ctx.roles, ctx.task);
      return { env: { GH_TOKEN: token } };
    }
  }
];
```

Each integration plugin's `plugin.json` declares:

```json
{
  "bridge_integration": {
    "capability": "github",
    "stages": ["pre_spawn"],
    "entry": "./dist/bridge-hooks.js"
  }
}
```

`bridge-claude-code` scans `installed_plugins.json` at boot, finds matching declarations, dynamic-imports the entry module, and registers each `BridgeHook` into the runtime registry. The integration plugin imports the `BridgeHook` *type* from `@agiterra/bridge-tools/types` but does not import bridge runtime code — coupling is one-way via the type contract.

Naming convention: integration repos are `bridge-{capability}` (e.g., `bridge-github`, `bridge-linear`, `bridge-gitlab`). External adopters writing their own integration follow the same shape.

## Status

v0.1.0 — early. Surface will change as the composite-tool shape stabilizes through real usage. See [plan-bridge.md](https://github.com/agiterra/Fondant/blob/main/.knowledge/plan-bridge.md) for the implementation roadmap (private; ask Tim or Brioche).

## License

MIT
