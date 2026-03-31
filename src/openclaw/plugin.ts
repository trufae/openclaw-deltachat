import { DeltaChatRuntime, loadRuntimeConfig } from '../lib/runtime.js';

let runtime: DeltaChatRuntime | null = null;

function getRuntime(channelConfig: any): DeltaChatRuntime {
  if (!runtime) {
    runtime = new DeltaChatRuntime(channelConfig || {});
  } else if (channelConfig && Object.keys(channelConfig).length > 0) {
    runtime.updateChannelConfig(channelConfig);
  }

  return runtime;
}

export default {
  id: 'deltachat',
  name: 'Delta Chat',
  version: '1.1.0',
  description: 'Delta Chat channel plugin for OpenClaw',
  meta: {
    label: 'Delta Chat',
    selectionLabel: 'Delta Chat (Email)',
    detailLabel: 'Delta Chat',
    docsPath: '/channels/deltachat',
    docsLabel: 'deltachat',
    blurb: 'Email-based E2E encrypted messaging.',
    aliases: ['dc'],
    order: 95,
  },
  config: {
    listAccountIds: (cfg: any) => {
      const section = cfg?.channels?.deltachat;
      if (!section) return ['default'];
      if (section.accounts && typeof section.accounts === 'object') {
        return Object.keys(section.accounts);
      }
      return ['default'];
    },
    resolveAccount: (cfg: any, accountId?: string) => {
      const section = cfg?.channels?.deltachat ?? {};
      if (accountId && accountId !== 'default' && section.accounts?.[accountId]) {
        return { ...section, ...section.accounts[accountId], accountId };
      }
      return { ...section, accountId: accountId ?? 'default' };
    },
    defaultAccountId: () => 'default',
    isConfigured: (account: any) => {
      return Boolean(account?.enabled || account?.configPath);
    },
    isEnabled: (account: any) => {
      return account?.enabled !== false;
    },
  },

  async init(gateway: any, channelConfig: any = {}) {
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

  async send(channelConfig: any = {}, message: any = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.send(message);
  },

  async handleMessage(channelConfig: any = {}, message: any = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.handleMessage(message);
  },

  async updateProfile(channelConfig: any = {}, profile: any = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.updateProfile(profile);
  },

  async getChatInfo(channelConfig: any = {}, chatId: any) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.getChatInfo(chatId);
  },

  async createGroup(channelConfig: any = {}, options: any = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.createGroup(options);
  },

  async renameChat(channelConfig: any = {}, chatId: any, newName: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.renameChat(chatId, newName);
  },

  async leaveGroup(channelConfig: any = {}, chatId: any) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.leaveGroup(chatId);
  },

  async saveAttachment(channelConfig: any = {}, messageId: any, destinationPath: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.saveAttachment(messageId, destinationPath);
  },

  async editMessage(channelConfig: any = {}, messageId: any, newText: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.editMessage(messageId, newText);
  },

  async reactToMessage(channelConfig: any = {}, messageId: any, reaction: any) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.reactToMessage(messageId, reaction);
  },

  async getSecureJoinQr(channelConfig: any = {}, chatId: any, withSvg = false) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.getSecureJoinQr(chatId, withSvg);
  },

  async joinQr(channelConfig: any = {}, qrText: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.joinQr(qrText);
  },

  async acceptChat(channelConfig: any = {}, chatId: any) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.acceptChat(chatId);
  },

  async listAccounts(channelConfig: any = {}) {
    const instance = getRuntime(channelConfig);
    return instance.listAccounts();
  },

  async createAccount(channelConfig: any = {}, options: any = {}) {
    const instance = getRuntime(channelConfig);
    return instance.createAccount(options);
  },

  async deleteAccount(channelConfig: any = {}, accountId: number) {
    const instance = getRuntime(channelConfig);
    return instance.deleteAccount(accountId);
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
      } catch (error: any) {
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
