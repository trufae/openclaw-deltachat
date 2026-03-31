#!/usr/bin/env node
'use strict';

const { DeltaChatRuntime, loadRuntimeConfig } = require('./runtime');

let runtime = null;

function getRuntime(channelConfig) {
  if (!runtime) {
    runtime = new DeltaChatRuntime(channelConfig || {});
  } else if (channelConfig && Object.keys(channelConfig).length > 0) {
    runtime.updateChannelConfig(channelConfig);
  }

  return runtime;
}

module.exports = {
  id: 'deltachat',
  name: 'Delta Chat',
  version: '1.1.0',
  description: 'Delta Chat channel plugin for OpenClaw',
  config: {
    enabled: true,
    dmPolicy: 'pairing',
    groupPolicy: 'allowlist',
    configPath: '',
    inviteLink: '',
    rpcServerPath: '',
    pythonPath: '',
  },

  async init(gateway, channelConfig = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init(gateway);
    return instance.getStatus();
  },

  async shutdown() {
    if (runtime) {
      await runtime.stop();
      runtime = null;
    }
  },

  async send(channelConfig = {}, message = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.send(message);
  },

  async handleMessage(channelConfig = {}, message = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.handleMessage(message);
  },

  getStatus() {
    if (!runtime) {
      try {
        const config = loadRuntimeConfig();
        return {
          running: false,
          configured: config.accounts.length > 0,
          account: config.accounts[0] ? config.accounts[0].email : null,
        };
      } catch (error) {
        return {
          running: false,
          configured: false,
          account: null,
          error: error.message,
        };
      }
    }

    return runtime.getStatus();
  },
};
