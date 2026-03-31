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

.PHONY: build clean install uninstall invite-link

build:
	./node_modules/.bin/tsc -p tsconfig.json

clean:
	rm -rf dist

install: build
	install -d "$(TARGET_DIR)"
	cp $(INSTALL_FILES) "$(TARGET_DIR)/"
	rm -rf "$(TARGET_DIR)/dist"
	rsync -a --exclude=accounts dist/ "$(TARGET_DIR)/dist/"
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

invite-link: build
	@node --input-type=commonjs -e 'const{DeltaChatRuntime}=require("./dist/lib/runtime");(async()=>{const rt=new DeltaChatRuntime({configPath:process.argv[1]});await rt.init();const aid=rt.account.accountId;for(let i=0;i<10;i++){if(await rt.client.rpc.getConnectivity(aid)>=3000)break;await new Promise(r=>setTimeout(r,1000))}const entries=await rt.client.rpc.getChatlistEntries(aid,null,null,null);let gid=null;for(const c of entries){const ch=await rt.client.rpc.getFullChatById(aid,c);if(ch.chatType==="Group"){gid=c;break}}if(!gid){gid=await rt.client.rpc.createGroupChat(aid,"r2claw",true);console.error("Created group "+gid)}const[qr]=await rt.client.rpc.getChatSecurejoinQrCodeSvg(aid,gid);console.log(qr);process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)})' \
		"$(TARGET_DIR)/deltachat-config.json" > /tmp/.deltachat-invite-link
	@python3 -c 'import json,sys;from pathlib import Path;link=Path("/tmp/.deltachat-invite-link").read_text().strip();[(lambda p:(p.write_text(json.dumps((lambda c:(c.setdefault("channels",{}).setdefault("deltachat",{}).__setitem__("inviteLink",link),c)[-1])(json.loads(p.read_text()))if p.name=="openclaw.json"else(lambda c:(c.__setitem__("inviteLink",link),c)[-1])(json.loads(p.read_text())),indent=2)+"\n"),print("Updated",p)))(p)for p in[Path(sys.argv[1])/"deltachat.json",Path(sys.argv[1])/"openclaw.json"]if p.exists()];print("Invite link:",link)' \
		"$(OPENCLAW_DIR)"
	@rm -f /tmp/.deltachat-invite-link

uninstall:
	rm -rf "$(TARGET_DIR)" "$(OPENCLAW_CHANNELS_DIR)/delta-chat" "$(OPENCLAW_CHANNELS_DIR)/deltachat"
