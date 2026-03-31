<p align="center">
  <img src="https://delta.chat/assets/logos/delta-chat.svg" alt="Delta Chat" width="80" />
</p>

<h1 align="center">OpenClaw Delta Chat Channel</h1>

<p align="center">
  <strong>Email-based, end-to-end encrypted messaging for OpenClaw</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#cli-reference">CLI Reference</a> &bull;
  <a href="#library-api">Library API</a> &bull;
  <a href="#installation">Installation</a>
</p>

---

## Overview

This plugin integrates [Delta Chat](https://delta.chat) as a messaging channel for [OpenClaw](https://openclaw.dev). It provides:

- **OpenClaw channel plugin** -- send and receive messages through Delta Chat
- **Standalone CLI** -- manage chats, contacts, and messages from your terminal
- **Programmatic library** -- embed Delta Chat operations in your own scripts

The project is written in TypeScript (`src/`) and compiles to CommonJS output in `dist/`.

---

## Quick Start

```bash
# Build from source
npm run build

# Install as an OpenClaw extension
make install

# Verify
deltachat-cli status
```

---

## Configuration

Configuration is loaded from `deltachat-config.json` (or the path in `OPENCLAW_DELTACHAT_CONFIG`).

<details>
<summary><strong>Example config</strong></summary>

```json
{
  "accounts": [
    {
      "email": "you@example.org",
      "mail_pw": "app-password",
      "data_dir": "~/.var/app/chat.delta.desktop/config/DeltaChat/accounts/<account-dir>",
      "database_path": "~/.var/app/chat.delta.desktop/config/DeltaChat/accounts/<account-dir>/dc.db",
      "account_id": 1
    }
  ],
  "runtime": {
    "rpc_server_path": "~/.venv/deltachat/bin/deltachat-rpc-server",
    "python_path": "~/.venv/deltachat/bin/python"
  }
}
```

</details>

| Field | Required | Notes |
|-------|----------|-------|
| `accounts[].email` | Yes | Email address for the Delta Chat account |
| `accounts[].mail_pw` | Yes | App password or mail password |
| `accounts[].data_dir` | Yes | Path to the account data directory |
| `accounts[].database_path` | No | Defaults to `<data_dir>/dc.db` if omitted |
| `accounts[].account_id` | No | Numeric account ID |
| `runtime.rpc_server_path` | No | Path to `deltachat-rpc-server` binary |
| `runtime.python_path` | No | Fallback Python interpreter path |

### RPC Server Resolution

The runtime resolves the Delta Chat RPC server in this order:

1. `deltachat-rpc-server` script (preferred)
2. `python <script>` fallback
3. Python module startup (legacy last resort)

### Environment & Overrides

- `OPENCLAW_DELTACHAT_CONFIG` -- point to an alternate config file
- OpenClaw channel-level config can override `configPath`, `rpcServerPath`, and `pythonPath`
- `inviteLink` can be set in `openclaw.json` or `deltachat-config.json` to auto-join a Delta Chat invite

---

## CLI Reference

Build first, then run commands via `node dist/cli.js` or install globally with `npm link` to get the `deltachat-cli` command.

```bash
npm run build
npm link          # optional: adds deltachat-cli to PATH
```

### Commands

| Command | Description |
|---------|-------------|
| `status` | Show account and connection status |
| `list-chats [--query TEXT] [--limit N] [--json]` | List all chats, optionally filtered |
| `list-messages --chat ID [--limit N] [--json]` | List messages in a chat |
| `send (--chat ID \| --to EMAIL) --text TEXT [--file PATH] [--name NAME]` | Send a text or file message |
| `delete-messages --chat ID --ids ID[,ID...] [--for-all]` | Delete messages |
| `set-profile [--name NAME] [--avatar PATH] [--clear-avatar]` | Update local profile |
| `save-attachment --message ID --path PATH` | Save a message attachment to disk |
| `edit-message --message ID --text TEXT` | Edit a sent message |
| `react --message ID --reaction "EMOJI [EMOJI...]"` | React to a message |
| `chat-info --chat ID [--json]` | Show detailed chat info |
| `create-group --name NAME [--protect] [--members EMAIL[,...]] [--json]` | Create a new group |
| `rename-chat --chat ID --name NAME [--json]` | Rename a chat |
| `leave-group --chat ID` | Leave a group chat |
| `join-qr --qr TEXT [--json]` | Join a chat via QR/invite link |
| `show-qr [--chat ID] [--svg-path PATH] [--json]` | Display or export a join QR code |
| `receive [--timeout SECS] [--count N] [--json] [--no-mark-seen]` | Listen for incoming messages |
| `create-chat --to EMAIL` | Create a 1:1 chat by email address |

### Examples

```bash
deltachat-cli status
deltachat-cli list-chats --limit 10 --json
deltachat-cli send --to friend@example.org --text "hello from the CLI"
deltachat-cli send --chat 42 --file ./photo.jpg --text "check this out"
deltachat-cli receive --json --timeout 60
deltachat-cli create-group --name "Project Team" --protect --members a@x.org,b@x.org
deltachat-cli show-qr --chat 42 --svg-path invite.svg
```

---

## Library API

The plugin can be used programmatically from Node.js.

### Update Profile

```js
const plugin = require('./dist/plugin');

// Set display name and avatar
await plugin.updateProfile(
  { configPath: '/path/to/deltachat-config.json' },
  { displayName: 'OpenClaw Bot', avatarPath: '/path/to/avatar.jpg' }
);

// Clear avatar
await plugin.updateProfile(
  { configPath: '/path/to/deltachat-config.json' },
  { clearAvatar: true }
);
```

---

## Installation

### Install Extension

```bash
make install
```

Default target: `~/.openclaw/extensions/deltachat`

### Full Setup & Repair

```bash
# Configure OpenClaw integration
bash ./configure-openclaw.sh

# Or run end-to-end repair (install + rewrite openclaw.json + doctor --fix + verify)
bash ./repair-openclaw-deltachat.sh
```

### Uninstall

```bash
make uninstall
```

### OpenClaw Channel Config

Minimal channel entry for `openclaw.json`:

```json
{
  "channels": {
    "deltachat": {
      "enabled": true,
      "configPath": "~/.openclaw/extensions/deltachat/deltachat-config.json"
    }
  }
}
```

---

## Project Structure

```
src/            TypeScript sources
dist/           Compiled JavaScript (generated)
accounts/       Account data directories
Makefile        Build & install targets
openclaw.plugin.json   Plugin manifest
deltachat-config.json  Default runtime config
```

---

## Requirements

- Node.js >= 18.0.0
- `deltachat-rpc-server` or a Python environment with Delta Chat bindings

## License

MIT
