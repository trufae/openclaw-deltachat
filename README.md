# OpenClaw Delta Chat Channel

This plugin now builds from TypeScript sources in `src/` into CommonJS output in `dist/`.

## What changed

- TypeScript source lives in `src/`.
- Generated JavaScript lives in `dist/`.
- Runtime config is loaded lazily from `deltachat-config.json` or `OPENCLAW_DELTACHAT_CONFIG`.
- Delta Chat RPC startup prefers the `deltachat-rpc-server` script, falls back to `python <script>`, and only uses Python module startup as a legacy last resort.
- Incoming and outgoing messaging use the actual JSON-RPC method signatures.
- `Makefile` builds `dist/` and installs the plugin as an OpenClaw extension with the required manifest.

## Config

Default config file: `deltachat-config.json`

Supported account fields:

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

Notes:

- `database_path` is optional. If omitted, the runtime assumes `data_dir/dc.db`.
- `OPENCLAW_DELTACHAT_CONFIG` can point to a different config file.
- OpenClaw channel-level config can override `configPath`, `rpcServerPath`, and `pythonPath`.
- `inviteLink` can be set in `openclaw.json` or `deltachat-config.json` to auto-join a Delta Chat invite.

## CLI

This workspace also includes a CLI client built to `dist/cli.js` that reuses the same runtime/account bootstrap path as the OpenClaw plugin.

Build first:

```bash
npm run build
```

Examples:

```bash
node dist/cli.js status
node dist/cli.js list-chats
node dist/cli.js list-messages --chat 42 --limit 20
node dist/cli.js send --to friend@example.org --text "hello from the CLI"
node dist/cli.js send --chat 42 --file ./photo.jpg --text "hello from the CLI"
node dist/cli.js delete-messages --chat 42 --ids 101,102
node dist/cli.js set-profile --name "OpenClaw Bot" --avatar ./avatar.jpg
node dist/cli.js receive --json
```

To install the CLI onto your shell `PATH` for local development:

```bash
npm link
```

Then run:

```bash
deltachat-cli status
```

Supported commands:

- `status`
- `list-chats [--query TEXT] [--limit N] [--json]`
- `list-messages --chat CHAT_ID [--limit N] [--json]`
- `send (--chat CHAT_ID | --to EMAIL) --text TEXT`
- `send (--chat CHAT_ID | --to EMAIL) [--text TEXT] [--file PATH] [--name NAME]`
- `delete-messages --chat CHAT_ID --ids ID[,ID...] [--for-all]`
- `set-profile [--name NAME] [--avatar PATH] [--clear-avatar]`
- `save-attachment --message MESSAGE_ID --path PATH`
- `edit-message --message MESSAGE_ID --text TEXT`
- `react --message MESSAGE_ID --reaction "EMOJI [EMOJI...]"`
- `chat-info --chat CHAT_ID [--json]`
- `create-group --name NAME [--protect] [--members EMAIL[,EMAIL...]] [--json]`
- `rename-chat --chat CHAT_ID --name NAME [--json]`
- `leave-group --chat CHAT_ID`
- `join-qr --qr TEXT [--json]`
- `show-qr [--chat CHAT_ID] [--svg-path PATH] [--json]`
- `receive [--timeout SECONDS] [--count N] [--json] [--no-mark-seen]`
- `create-chat --to EMAIL`

## Library API

The plugin/runtime can also update the account profile:

```js
const plugin = require('./dist/plugin');

await plugin.updateProfile(
  { configPath: '/path/to/deltachat-config.json' },
  {
    displayName: 'OpenClaw Bot',
    avatarPath: '/path/to/avatar.jpg',
  }
);
```

To clear the avatar:

```js
const plugin = require('./dist/plugin');

await plugin.updateProfile(
  { configPath: '/path/to/deltachat-config.json' },
  { clearAvatar: true }
);
```

## Install

```bash
make install
```

Default target directory:

```text
~/.openclaw/extensions/deltachat
```

Apply the full install and config repair:

```bash
bash ./configure-openclaw.sh
```

Or run the end-to-end repair script, which installs the extension, rewrites
`openclaw.json`, runs `openclaw doctor --fix`, and then executes
`openclaw channels list`:

```bash
bash ./repair-openclaw-deltachat.sh
```

## Uninstall

```bash
make uninstall
```

## OpenClaw channel config

Use a minimal channel config and let the plugin read the JSON file:

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
