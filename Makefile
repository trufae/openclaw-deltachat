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

uninstall:
	rm -rf "$(TARGET_DIR)" "$(OPENCLAW_CHANNELS_DIR)/delta-chat" "$(OPENCLAW_CHANNELS_DIR)/deltachat"
