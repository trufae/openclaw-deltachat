#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
EXTENSIONS_DIR="${OPENCLAW_EXTENSIONS_DIR:-$OPENCLAW_DIR/extensions}"
CHANNELS_DIR="${OPENCLAW_CHANNELS_DIR:-$OPENCLAW_DIR/channels}"
CHANNEL_ID="${CHANNEL_ID:-deltachat}"
TARGET_DIR="${TARGET_DIR:-$EXTENSIONS_DIR/$CHANNEL_ID}"
CONFIG_PATH="${CONFIG_PATH:-$TARGET_DIR/deltachat-config.json}"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG:-$OPENCLAW_DIR/openclaw.json}"

mkdir -p "$TARGET_DIR"

./node_modules/.bin/tsc -p "$SCRIPT_DIR/tsconfig.json"

cp \
  "$SCRIPT_DIR/package.json" \
  "$SCRIPT_DIR/package-lock.json" \
  "$SCRIPT_DIR/tsconfig.json" \
  "$SCRIPT_DIR/openclaw.plugin.json" \
  "$SCRIPT_DIR/deltachat-config.json" \
  "$SCRIPT_DIR/README.md" \
  "$TARGET_DIR/"

rm -rf "$TARGET_DIR/dist"
cp -R "$SCRIPT_DIR/dist" "$TARGET_DIR/dist"
rm -rf "$TARGET_DIR/node_modules"
cp -R "$SCRIPT_DIR/node_modules" "$TARGET_DIR/node_modules"
rm -rf "$CHANNELS_DIR/delta-chat" "$CHANNELS_DIR/deltachat"
mkdir -p "$CHANNELS_DIR"
ln -s "$TARGET_DIR" "$CHANNELS_DIR/$CHANNEL_ID"

CATALOG="${OPENCLAW_DIR}/workspace/channel-catalog.json"

python3 - "$OPENCLAW_CONFIG" "$CONFIG_PATH" "$CATALOG" <<'PY'
import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
channel_config_path = sys.argv[2]
catalog_path = Path(sys.argv[3]).expanduser()

if config_path.exists():
    data = json.loads(config_path.read_text())
else:
    data = {}

channels = data.setdefault("channels", {})
channels.pop("delta-chat", None)
delta = channels.setdefault("deltachat", {})
delta["enabled"] = True
delta["configPath"] = channel_config_path
delta.setdefault("inviteLink", "")
delta.setdefault("dmPolicy", "pairing")
delta.setdefault("groupPolicy", "allowlist")

config_path.parent.mkdir(parents=True, exist_ok=True)
config_path.write_text(json.dumps(data, indent=2) + "\n")
print(config_path)

if catalog_path.exists():
    cdata = json.loads(catalog_path.read_text())
else:
    cdata = {"entries": []}

entries = cdata.get("entries", [])
entries = [e for e in entries
           if e.get("openclaw", {}).get("channel", {}).get("id") not in ("delta-chat", "deltachat")
           and e.get("name") != "@openclaw/deltachat"]
entries.append({
    "name": "@openclaw/deltachat",
    "version": "1.0.0",
    "description": "OpenClaw Delta Chat channel plugin",
    "openclaw": {
        "channel": {
            "id": "deltachat",
            "label": "Delta Chat",
            "selectionLabel": "Delta Chat (Email)",
            "detailLabel": "Delta Chat",
            "docsPath": "/channels/deltachat",
            "docsLabel": "deltachat",
            "blurb": "Email-based E2E encrypted messaging.",
            "aliases": ["dc"],
            "order": 95,
        },
        "install": {
            "npmSpec": "@openclaw/deltachat",
            "localPath": "extensions/deltachat",
            "defaultChoice": "local",
        },
    },
})
cdata["entries"] = entries
catalog_path.parent.mkdir(parents=True, exist_ok=True)
catalog_path.write_text(json.dumps(cdata, indent=2) + "\n")
print(catalog_path)
PY

printf 'Installed DeltaChat extension into %s\n' "$TARGET_DIR"
printf 'Removed stale channel copies from %s\n' "$CHANNELS_DIR"
printf 'Updated OpenClaw config at %s\n' "$OPENCLAW_CONFIG"
