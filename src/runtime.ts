#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { StdioDeltaChat } = require('@deltachat/jsonrpc-client');

const DEFAULT_CONFIG_FILE = 'deltachat-config.json';
const DEFAULT_PLUGIN_DIR = path.resolve(__dirname, '..');
const DEFAULT_RPC_SCRIPT = path.join(os.homedir(), '.venv', 'deltachat', 'bin', 'deltachat-rpc-server');
const DEFAULT_PYTHON = path.join(os.homedir(), '.venv', 'deltachat', 'bin', 'python');
function expandHome(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function resolveConfigPath(customPath) {
  const requested = customPath
    || process.env.OPENCLAW_DELTACHAT_CONFIG
    || process.env.DELTACHAT_CONFIG;

  if (!requested) {
    return path.join(DEFAULT_PLUGIN_DIR, DEFAULT_CONFIG_FILE);
  }

  const expanded = expandHome(requested);
  return path.isAbsolute(expanded)
    ? expanded
    : path.resolve(DEFAULT_PLUGIN_DIR, expanded);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isSqliteDatabase(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 16) {
      return false;
    }

    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, header.length, 0);
      return header.toString('utf8', 0, 15) === 'SQLite format 3';
    } finally {
      fs.closeSync(fd);
    }
  } catch (_error) {
    return false;
  }
}

function normalizeAccount(account, index) {
  const dataDir = expandHome(account.data_dir || '');
  const databasePath = expandHome(
    account.database_path
    || (dataDir ? path.join(dataDir, 'dc.db') : '')
  );

  return {
    email: account.email || account.addr || '',
    password: account.mail_pw || account.password || '',
    dataDir,
    databasePath,
    accountId: Number(account.account_id || 0),
    imapServer: account.imap_server || null,
    imapPort: account.imap_port || null,
    imapSecurity: account.imap_security || null,
    imapUser: account.imap_user || null,
    smtpServer: account.smtp_server || null,
    smtpPort: account.smtp_port || null,
    smtpSecurity: account.smtp_security || null,
    smtpUser: account.smtp_user || null,
    smtpPassword: account.smtp_password || null,
    displayName: account.display_name || null,
    index,
  };
}

function validateConfig(config, configPath) {
  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid Delta Chat config in ${configPath}`);
  }

  if (!Array.isArray(config.accounts) || config.accounts.length === 0) {
    throw new Error(`No Delta Chat accounts configured in ${configPath}`);
  }

  for (const account of config.accounts) {
    if (!account.email) {
      throw new Error(`Configured account is missing email in ${configPath}`);
    }
  }
}

function loadRuntimeConfig(customPath) {
  const configPath = resolveConfigPath(customPath);
  const loaded = readJsonFile(configPath);
  validateConfig(loaded, configPath);

  return {
    configPath,
    rpc: loaded.rpc || {},
    runtime: loaded.runtime || {},
    inviteLink: loaded.inviteLink || loaded.invite_link || '',
    accounts: loaded.accounts.map(normalizeAccount),
  };
}

class DeltaChatRuntime {
  constructor(channelConfig = {}) {
    this.gateway = null;
    this.channelConfig = {
      enabled: channelConfig.enabled !== false,
      dmPolicy: channelConfig.dmPolicy || 'pairing',
      groupPolicy: channelConfig.groupPolicy || 'allowlist',
      configPath: channelConfig.configPath || '',
      inviteLink: channelConfig.inviteLink || '',
      rpcServerPath: channelConfig.rpcServerPath || '',
      pythonPath: channelConfig.pythonPath || '',
    };
    this.runtimeConfig = null;
    this.rpcProcess = null;
    this.client = null;
    this.account = null;
    this.running = false;
    this.listenLoop = null;
    this.stopRequested = false;
  }

  updateChannelConfig(channelConfig = {}) {
    this.channelConfig = { ...this.channelConfig, ...channelConfig };
  }

  async init(gateway) {
    if (gateway) {
      this.gateway = gateway;
    }

    if (this.running) {
      return;
    }

    this.runtimeConfig = loadRuntimeConfig(this.channelConfig.configPath);
    await this.startRpcServer();
    await this.connectClient();
    await this.ensureAccount();
    await this.joinInviteLink();

    this.running = true;
    this.stopRequested = false;
    this.listenLoop = this.listenForMessages().catch((error) => {
      console.error('[Delta Chat] listener stopped:', error.message);
    });
  }

  getStatus() {
    return {
      running: this.running,
      configured: Boolean(this.account),
      account: this.account ? this.account.email : null,
      configPath: this.runtimeConfig ? this.runtimeConfig.configPath : resolveConfigPath(this.channelConfig.configPath),
    };
  }

  async send(message = {}) {
    const text = message.text || message.body;
    const chatId = Number(message.chatId || message.chat_id || 0);

    if (!text) {
      throw new Error('Delta Chat send requires message.text');
    }

    await this.assertReady();

    let targetChatId = chatId;
    if (!targetChatId && message.to) {
      targetChatId = await this.getOrCreateChatByEmail(message.to);
    }

    if (!targetChatId) {
      throw new Error('Delta Chat send requires message.chatId or message.to');
    }

    const [messageId] = await this.client.rpc.miscSendMsg(
      this.account.accountId,
      targetChatId,
      text,
      null,
      null,
      null,
      null
    );

    return messageId;
  }

  async handleMessage(message = {}) {
    if (!message || !message.text) {
      return null;
    }

    await this.notifyGateway({
      chatId: message.chatId || message.chat_id || null,
      text: message.text,
      from: message.from || null,
      fromName: message.fromName || null,
      timestamp: message.timestamp || Date.now(),
      messageId: message.messageId || message.id || null,
      raw: message,
    });

    return null;
  }

  async updateProfile(profile = {}) {
    await this.assertReady();

    const updates = {};

    if (Object.prototype.hasOwnProperty.call(profile, 'displayName')) {
      updates.displayname = profile.displayName || null;
    }

    if (profile.clearAvatar) {
      updates.selfavatar = null;
    } else if (Object.prototype.hasOwnProperty.call(profile, 'avatarPath')) {
      const avatarPath = path.resolve(String(profile.avatarPath || ''));
      if (!fs.existsSync(avatarPath)) {
        throw new Error(`Avatar file not found: ${avatarPath}`);
      }
      updates.selfavatar = avatarPath;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('updateProfile requires displayName, avatarPath, or clearAvatar');
    }

    await this.client.rpc.batchSetConfig(this.account.accountId, updates);

    return {
      accountId: this.account.accountId,
      displayName: Object.prototype.hasOwnProperty.call(updates, 'displayname')
        ? updates.displayname
        : await this.client.rpc.getConfig(this.account.accountId, 'displayname'),
      avatarPath: Object.prototype.hasOwnProperty.call(updates, 'selfavatar')
        ? updates.selfavatar
        : await this.client.rpc.getConfig(this.account.accountId, 'selfavatar'),
    };
  }

  async getChatInfo(chatId) {
    await this.assertReady();

    const resolvedChatId = Number(chatId || 0);
    if (!Number.isInteger(resolvedChatId) || resolvedChatId <= 0) {
      throw new Error('getChatInfo requires a valid chatId');
    }

    const fullChat = await this.client.rpc.getFullChatById(this.account.accountId, resolvedChatId);
    let encryptionInfo = null;
    try {
      encryptionInfo = await this.client.rpc.getChatEncryptionInfo(this.account.accountId, resolvedChatId);
    } catch (_error) {
      encryptionInfo = null;
    }

    return {
      ...fullChat,
      encryptionInfo,
    };
  }

  async createGroup(options = {}) {
    await this.assertReady();

    if (!options.name) {
      throw new Error('createGroup requires name');
    }

    const chatId = await this.client.rpc.createGroupChat(
      this.account.accountId,
      options.name,
      Boolean(options.protect)
    );

    const members = Array.isArray(options.members) ? options.members : [];
    for (const member of members) {
      const email = String(member || '').trim();
      if (!email) {
        continue;
      }
      const contactId = await this.client.rpc.createContact(this.account.accountId, email, null);
      await this.client.rpc.addContactToChat(this.account.accountId, chatId, contactId);
    }

    return this.getChatInfo(chatId);
  }

  async renameChat(chatId, newName) {
    await this.assertReady();

    if (!newName) {
      throw new Error('renameChat requires newName');
    }

    await this.client.rpc.setChatName(this.account.accountId, Number(chatId), newName);
    return this.getChatInfo(chatId);
  }

  async leaveGroup(chatId) {
    await this.assertReady();
    await this.client.rpc.leaveGroup(this.account.accountId, Number(chatId));
    return { chatId: Number(chatId), left: true };
  }

  async saveAttachment(messageId, destinationPath) {
    await this.assertReady();

    if (!destinationPath) {
      throw new Error('saveAttachment requires destinationPath');
    }

    const resolvedPath = path.resolve(destinationPath);
    await this.client.rpc.saveMsgFile(this.account.accountId, Number(messageId), resolvedPath);
    return { messageId: Number(messageId), path: resolvedPath };
  }

  async editMessage(messageId, newText) {
    await this.assertReady();

    if (!newText) {
      throw new Error('editMessage requires newText');
    }

    await this.client.rpc.sendEditRequest(this.account.accountId, Number(messageId), newText);
    return this.client.rpc.getMessage(this.account.accountId, Number(messageId));
  }

  async reactToMessage(messageId, reaction) {
    await this.assertReady();

    const parts = Array.isArray(reaction)
      ? reaction
      : String(reaction || '').split(/\s+/).filter(Boolean);

    await this.client.rpc.sendReaction(this.account.accountId, Number(messageId), parts);
    const reactions = await this.client.rpc.getMessageReactions(this.account.accountId, Number(messageId));
    return {
      messageId: Number(messageId),
      reaction: parts,
      reactions,
    };
  }

  async getSecureJoinQr(chatId, withSvg = false) {
    await this.assertReady();

    const resolvedChatId = chatId ? Number(chatId) : null;
    if (withSvg) {
      const [qr, svg] = await this.client.rpc.getChatSecurejoinQrCodeSvg(this.account.accountId, resolvedChatId);
      return { chatId: resolvedChatId, qr, svg };
    }

    const qr = await this.client.rpc.getChatSecurejoinQrCode(this.account.accountId, resolvedChatId);
    return { chatId: resolvedChatId, qr };
  }

  async joinQr(qrText) {
    await this.assertReady();

    if (!qrText) {
      throw new Error('joinQr requires qrText');
    }

    const qr = await this.client.rpc.checkQr(this.account.accountId, qrText);

    if (qr.kind === 'askVerifyGroup' || qr.kind === 'askVerifyContact') {
      const chatId = await this.client.rpc.secureJoin(this.account.accountId, qrText);
      await this.client.rpc.acceptChat(this.account.accountId, chatId);
      return { kind: qr.kind, chatId };
    }

    if (qr.kind === 'fprOk' && qr.contact_id) {
      const chatId = await this.client.rpc.createChatByContactId(this.account.accountId, qr.contact_id);
      await this.client.rpc.acceptChat(this.account.accountId, chatId);
      return { kind: qr.kind, chatId };
    }

    throw new Error(`QR kind not joinable via CLI: ${qr.kind}`);
  }

  async stop() {
    this.stopRequested = true;
    this.running = false;

    if (this.account && this.client) {
      try {
        await withTimeout(this.client.rpc.stopIo(this.account.accountId), 2000, 'stopIo');
      } catch (error) {
        console.error('[Delta Chat] stopIo failed:', error.message);
      }
    }

    if (this.client && this.client.transport) {
      const { input, output } = this.client.transport;
      if (input && typeof input.end === 'function' && !input.destroyed) {
        input.end();
      }
      if (output && typeof output.removeAllListeners === 'function') {
        output.removeAllListeners('data');
      }
      if (output && typeof output.destroy === 'function' && !output.destroyed) {
        output.destroy();
      }
    }

    this.client = null;
    this.account = null;

    if (this.rpcProcess) {
      const rpcProcess = this.rpcProcess;
      this.rpcProcess = null;
      const exitPromise = new Promise((resolve) => {
        rpcProcess.once('exit', resolve);
      });
      rpcProcess.kill('SIGTERM');
      try {
        await withTimeout(exitPromise, 1500, 'rpc shutdown');
      } catch (_error) {
        rpcProcess.kill('SIGKILL');
      }
    }
  }

  async assertReady() {
    if (!this.running) {
      await this.init();
    }
  }

  getRpcCommand() {
    const configured = this.runtimeConfig.runtime.rpc_command;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured;
    }

    const scriptPath = expandHome(this.channelConfig.rpcServerPath || this.runtimeConfig.runtime.rpc_server_path || DEFAULT_RPC_SCRIPT);
    const pythonPath = expandHome(this.channelConfig.pythonPath || this.runtimeConfig.runtime.python_path || DEFAULT_PYTHON);

    if (fs.existsSync(scriptPath)) {
      try {
        fs.accessSync(scriptPath, fs.constants.X_OK);
        return [scriptPath];
      } catch (_error) {
        if (fs.existsSync(pythonPath)) {
          return [pythonPath, scriptPath];
        }
      }
    }

    if (fs.existsSync(pythonPath)) {
      return [pythonPath, '-m', 'deltachat_rpc_server'];
    }

    throw new Error(`Delta Chat RPC server not found. Checked ${scriptPath} and ${pythonPath}`);
  }

  async startRpcServer() {
    if (this.rpcProcess) {
      return;
    }

    const command = this.getRpcCommand();
    const [bin, ...args] = command;

    this.rpcProcess = spawn(bin, args, {
      cwd: DEFAULT_PLUGIN_DIR,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.rpcProcess.once('error', (error) => {
      console.error('[Delta Chat] RPC process error:', error.message);
    });
  }

  async connectClient() {
    if (!this.rpcProcess || !this.rpcProcess.stdin || !this.rpcProcess.stdout) {
      throw new Error('Delta Chat RPC process is not available');
    }

    this.client = new StdioDeltaChat(this.rpcProcess.stdin, this.rpcProcess.stdout, false);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await this.client.rpc.getSystemInfo();
        return;
      } catch (_error) {
        await sleep(500);
      }
    }

    throw new Error('Delta Chat RPC server did not become ready');
  }

  async ensureAccount() {
    const configuredAccount = this.runtimeConfig.accounts[0];
    const accounts = await this.client.rpc.getAllAccounts();

    let account = accounts.find((entry) => (
      configuredAccount.accountId > 0
      && entry.id === configuredAccount.accountId
    )) || accounts.find((entry) => (
      entry.addr
      && entry.addr.toLowerCase() === configuredAccount.email.toLowerCase()
    ));

    if (!account && isSqliteDatabase(configuredAccount.databasePath)) {
      try {
        const migratedId = await this.client.rpc.migrateAccount(configuredAccount.databasePath);
        account = await this.client.rpc.getAccountInfo(migratedId);
      } catch (error) {
        console.error('[Delta Chat] migrateAccount failed:', error.message);
      }
    }

    if (!account) {
      const accountId = await this.client.rpc.addAccount();
      await this.client.rpc.addOrUpdateTransport(accountId, {
        addr: configuredAccount.email,
        password: configuredAccount.password,
        imapServer: configuredAccount.imapServer,
        imapPort: configuredAccount.imapPort,
        imapSecurity: configuredAccount.imapSecurity,
        imapUser: configuredAccount.imapUser,
        smtpServer: configuredAccount.smtpServer,
        smtpPort: configuredAccount.smtpPort,
        smtpSecurity: configuredAccount.smtpSecurity,
        smtpUser: configuredAccount.smtpUser,
        smtpPassword: configuredAccount.smtpPassword,
        certificateChecks: null,
        oauth2: null,
      });
      account = await this.client.rpc.getAccountInfo(accountId);
    }

    const accountId = account.id;
    const isConfigured = await this.client.rpc.isConfigured(accountId);
    if (!isConfigured && configuredAccount.password) {
      await this.client.rpc.addOrUpdateTransport(accountId, {
        addr: configuredAccount.email,
        password: configuredAccount.password,
        imapServer: configuredAccount.imapServer,
        imapPort: configuredAccount.imapPort,
        imapSecurity: configuredAccount.imapSecurity,
        imapUser: configuredAccount.imapUser,
        smtpServer: configuredAccount.smtpServer,
        smtpPort: configuredAccount.smtpPort,
        smtpSecurity: configuredAccount.smtpSecurity,
        smtpUser: configuredAccount.smtpUser,
        smtpPassword: configuredAccount.smtpPassword,
        certificateChecks: null,
        oauth2: null,
      });
    }

    await this.client.rpc.selectAccount(accountId);
    await this.client.rpc.startIo(accountId);

    this.account = {
      accountId,
      email: configuredAccount.email,
    };
  }

  async joinInviteLink() {
    const inviteLink = this.channelConfig.inviteLink || this.runtimeConfig.inviteLink;
    if (!inviteLink || !this.client || !this.account) {
      return;
    }

    try {
      const qr = await this.client.rpc.checkQr(this.account.accountId, inviteLink);
      if (qr.kind === 'askVerifyGroup' || qr.kind === 'askVerifyContact') {
        const chatId = await this.client.rpc.secureJoin(this.account.accountId, inviteLink);
        await this.client.rpc.acceptChat(this.account.accountId, chatId);
        console.log(`[Delta Chat] Joined invite chat ${chatId}`);
        return;
      }

      if (qr.kind === 'fprOk' && qr.contact_id) {
        const chatId = await this.client.rpc.createChatByContactId(this.account.accountId, qr.contact_id);
        await this.client.rpc.acceptChat(this.account.accountId, chatId);
        console.log(`[Delta Chat] Joined verified contact chat ${chatId}`);
        return;
      }

      console.log(`[Delta Chat] Invite link check result: ${qr.kind}`);
    } catch (error) {
      console.error('[Delta Chat] Failed to process invite link:', error.message);
    }
  }

  async listenForMessages() {
    while (!this.stopRequested && this.client && this.account) {
      try {
        const messageIds = await this.client.rpc.waitNextMsgs(this.account.accountId);

        for (const messageId of messageIds) {
          const message = await this.client.rpc.getMessage(this.account.accountId, messageId);
          const senderAddress = message && message.sender ? message.sender.address : null;
          if (!message || !message.text || (
            senderAddress
            && senderAddress.toLowerCase() === this.account.email.toLowerCase()
          )) {
            continue;
          }

          await this.client.rpc.markseenMsgs(this.account.accountId, [messageId]);

          await this.notifyGateway({
            chatId: message.chatId,
            text: message.text,
            from: senderAddress,
            fromName: message.sender ? (message.sender.displayName || message.sender.name || null) : null,
            timestamp: message.timestamp,
            messageId: message.id,
            raw: message,
          });
        }
      } catch (error) {
        if (!this.stopRequested) {
          console.error('[Delta Chat] waitNextMsgs failed:', error.message);
          await sleep(1000);
        }
      }
    }
  }

  async getOrCreateChatByEmail(email) {
    let contactId = await this.client.rpc.lookupContactIdByAddr(this.account.accountId, email);
    if (!contactId) {
      contactId = await this.client.rpc.createContact(this.account.accountId, email, null);
    }

    const existingChatId = await this.client.rpc.getChatIdByContactId(this.account.accountId, contactId);
    if (existingChatId) {
      return existingChatId;
    }

    return this.client.rpc.createChatByContactId(this.account.accountId, contactId);
  }

  async notifyGateway(payload) {
    if (!this.gateway) {
      console.log('[Delta Chat] message:', payload.text);
      return;
    }

    if (typeof this.gateway.handleMessage === 'function') {
      await this.gateway.handleMessage('deltachat', payload);
      return;
    }

    if (typeof this.gateway.emit === 'function') {
      this.gateway.emit('message', {
        channel: 'deltachat',
        ...payload,
      });
      return;
    }

    console.log('[Delta Chat] message:', payload.text);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

module.exports = {
  DeltaChatRuntime,
  loadRuntimeConfig,
};
