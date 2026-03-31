OPENCLAW_DIR ?= $(HOME)/.openclaw
OPENCLAW_EXTENSIONS_DIR ?= $(OPENCLAW_DIR)/extensions
OPENCLAW_CHANNELS_DIR ?= $(OPENCLAW_DIR)/channels
CHANNEL_ID ?= deltachat
TARGET_DIR ?= $(OPENCLAW_EXTENSIONS_DIR)/$(CHANNEL_ID)

INSTALL_FILES = \
	package.json \
	package-lock.json \
	tsconfig.json \
	openclaw.plugin.json \
	deltachat-config.json \
	README.md

.PHONY: build clean install uninstall

build:
	./node_modules/.bin/tsc -p tsconfig.json

clean:
	rm -rf dist

install: build
	install -d "$(TARGET_DIR)"
	cp $(INSTALL_FILES) "$(TARGET_DIR)/"
	rm -rf "$(TARGET_DIR)/dist"
	cp -R dist "$(TARGET_DIR)/dist"
	rm -rf "$(TARGET_DIR)/node_modules"
	cp -R node_modules "$(TARGET_DIR)/node_modules"
	rm -rf "$(OPENCLAW_CHANNELS_DIR)/delta-chat" "$(OPENCLAW_CHANNELS_DIR)/deltachat"
	mkdir -p "$(OPENCLAW_CHANNELS_DIR)"
	ln -s "$(TARGET_DIR)" "$(OPENCLAW_CHANNELS_DIR)/$(CHANNEL_ID)"
	@python3 -c '\
import json, sys; \
from pathlib import Path; \
oc = Path(sys.argv[1]); \
cfg = json.loads(oc.read_text()) if oc.exists() else {}; \
ch = cfg.setdefault("channels", {}); \
ch.pop("delta-chat", None); \
d = ch.setdefault("deltachat", {}); \
d["enabled"] = True; \
d["configPath"] = sys.argv[2]; \
d.setdefault("inviteLink", ""); \
d.setdefault("dmPolicy", "pairing"); \
d.setdefault("groupPolicy", "allowlist"); \
pl = cfg.setdefault("plugins", {}); \
al = pl.setdefault("allow", []); \
[al.append(x) for x in ["deltachat"] if x not in al]; \
pe = pl.setdefault("entries", {}); \
pe.setdefault("deltachat", {})["enabled"] = True; \
pi = pl.setdefault("installs", {}); \
pi["deltachat"] = {"source": "path", "spec": "deltachat", "installPath": sys.argv[2].rsplit("/deltachat-config.json", 1)[0]}; \
oc.parent.mkdir(parents=True, exist_ok=True); \
oc.write_text(json.dumps(cfg, indent=2) + "\n"); \
print("Updated", oc); \
cat = Path(sys.argv[3]); \
cdata = json.loads(cat.read_text()) if cat.exists() else {"entries": []}; \
entries = cdata.get("entries", []); \
entries = [e for e in entries if e.get("openclaw", {}).get("channel", {}).get("id") not in ("delta-chat", "deltachat") and e.get("name") != "@openclaw/deltachat"]; \
entries.append({"name": "@openclaw/deltachat", "version": "1.0.0", "description": "OpenClaw Delta Chat channel plugin", "openclaw": {"channel": {"id": "deltachat", "label": "Delta Chat", "selectionLabel": "Delta Chat (Email)", "detailLabel": "Delta Chat", "docsPath": "/channels/deltachat", "docsLabel": "deltachat", "blurb": "Email-based E2E encrypted messaging.", "aliases": ["dc"], "order": 95}, "install": {"npmSpec": "@openclaw/deltachat", "localPath": "extensions/deltachat", "defaultChoice": "local"}}}); \
cdata["entries"] = entries; \
cat.parent.mkdir(parents=True, exist_ok=True); \
cat.write_text(json.dumps(cdata, indent=2) + "\n"); \
print("Updated", cat)' \
		"$(OPENCLAW_DIR)/openclaw.json" \
		"$(TARGET_DIR)/deltachat-config.json" \
		"$(OPENCLAW_DIR)/workspace/channel-catalog.json"

uninstall:
	rm -rf "$(TARGET_DIR)" "$(OPENCLAW_CHANNELS_DIR)/delta-chat" "$(OPENCLAW_CHANNELS_DIR)/deltachat"
