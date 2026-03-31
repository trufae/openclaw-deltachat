# AGENTS.md

## Project

OpenClaw Delta Chat channel plugin -- TypeScript/Node.js. Provides a CLI, library, and OpenClaw plugin for Delta Chat messaging.

## Build & Run

```bash
npm run build        # compile src/ -> dist/
npm link             # install deltachat-cli on PATH
make install         # install as OpenClaw extension
make uninstall       # remove extension
```

Node.js >= 18 required. No test suite configured.

## Architecture

```
src/
  lib/runtime.ts        Core DeltaChatRuntime class (RPC, accounts, messaging)
  lib/index.ts          Public library exports
  cli/index.ts          CLI command dispatcher and handlers
  openclaw/plugin.ts    OpenClaw plugin lifecycle (init, send, receive, shutdown)
  openclaw/channel.ts   Channel registration shim
  legacy/               Old code, excluded from build
```

**Entry points:** library (`dist/lib/index.js`), CLI (`dist/cli/index.js`), plugin (`dist/openclaw/channel.js`).

**Key dependency:** `@deltachat/jsonrpc-client` -- communicates with `deltachat-rpc-server` over stdio.

## Conventions

- New CLI commands should call `src/lib/runtime.ts` methods, not embed RPC calls directly.
- Human-readable output by default; add `--json` for structured output.
- Use explicit flags (`--for-all`, etc.) for destructive operations.
- Config loaded from `deltachat-config.json` or `OPENCLAW_DELTACHAT_CONFIG` env var.
- TypeScript strict mode is off. `src/legacy/` is excluded from `tsconfig.json`.

## Plugin Integration

The OpenClaw plugin (`openclaw/plugin.ts`) manages a singleton `DeltaChatRuntime`, handles DM policy gating (`disabled` / `pairing` / `open`), and hooks into the OpenClaw gateway for routing, sessions, pairing, and reply dispatch.
