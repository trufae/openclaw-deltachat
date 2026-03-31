OPENCLAW_DIR ?= $(HOME)/.openclaw
OPENCLAW_EXTENSIONS_DIR ?= $(OPENCLAW_DIR)/extensions
OPENCLAW_CHANNELS_DIR ?= $(OPENCLAW_DIR)/channels
CHANNEL_ID ?= deltachat
TARGET_DIR ?= $(OPENCLAW_EXTENSIONS_DIR)/$(CHANNEL_ID)

INSTALL_FILES = \
	channel.js \
	plugin.js \
	runtime.js \
	package.json \
	package-lock.json \
	openclaw.plugin.json \
	deltachat-config.json \
	README.md

.PHONY: install uninstall

install:
	install -d "$(TARGET_DIR)"
	cp $(INSTALL_FILES) "$(TARGET_DIR)/"
	rm -rf "$(TARGET_DIR)/node_modules"
	cp -R node_modules "$(TARGET_DIR)/node_modules"
	rm -rf "$(OPENCLAW_CHANNELS_DIR)/delta-chat" "$(OPENCLAW_CHANNELS_DIR)/deltachat"

uninstall:
	rm -rf "$(TARGET_DIR)" "$(OPENCLAW_CHANNELS_DIR)/delta-chat" "$(OPENCLAW_CHANNELS_DIR)/deltachat"
