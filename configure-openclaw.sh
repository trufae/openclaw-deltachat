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

cp \
  "$SCRIPT_DIR/channel.js" \
  "$SCRIPT_DIR/plugin.js" \
  "$SCRIPT_DIR/runtime.js" \
  "$SCRIPT_DIR/package.json" \
  "$SCRIPT_DIR/package-lock.json" \
  "$SCRIPT_DIR/openclaw.plugin.json" \
  "$SCRIPT_DIR/deltachat-config.json" \
  "$SCRIPT_DIR/README.md" \
  "$TARGET_DIR/"

rm -rf "$TARGET_DIR/node_modules"
cp -R "$SCRIPT_DIR/node_modules" "$TARGET_DIR/node_modules"
rm -rf "$CHANNELS_DIR/delta-chat" "$CHANNELS_DIR/deltachat"

python3 - "$OPENCLAW_CONFIG" "$CONFIG_PATH" <<'PY'
import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
channel_config_path = sys.argv[2]

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
PY

printf 'Installed DeltaChat extension into %s\n' "$TARGET_DIR"
printf 'Removed stale channel copies from %s\n' "$CHANNELS_DIR"
printf 'Updated OpenClaw config at %s\n' "$OPENCLAW_CONFIG"
