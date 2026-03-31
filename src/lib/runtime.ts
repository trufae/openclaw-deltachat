import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { StdioDeltaChat, T } from '@deltachat/jsonrpc-client';

type Socket = T.Socket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NormalizedAccount {
  email: string;
  password: string;
  dataDir: string;
  databasePath: string;
  accountId: number;
  imapServer: string | null;
  imapPort: number | null;
  imapSecurity: Socket | null;
  imapUser: string | null;
  smtpServer: string | null;
  smtpPort: number | null;
  smtpSecurity: Socket | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  displayName: string | null;
  index: number;
}

interface RawAccountConfig {
  email?: string;
  addr?: string;
  mail_pw?: string;
  password?: string;
  data_dir?: string;
  database_path?: string;
  account_id?: number;
  imap_server?: string;
  imap_port?: number;
  imap_security?: Socket;
  imap_user?: string;
  smtp_server?: string;
  smtp_port?: number;
  smtp_security?: Socket;
  smtp_user?: string;
  smtp_password?: string;
  display_name?: string;
}

interface RawConfig {
  accounts: RawAccountConfig[];
  rpc?: Record<string, string | number>;
  runtime?: Record<string, string | string[] | undefined>;
  inviteLink?: string;
  invite_link?: string;
}

interface RuntimeConfig {
  configPath: string;
  rpc: Record<string, string | number>;
  runtime: Record<string, string | string[] | undefined>;
  inviteLink: string;
  accounts: NormalizedAccount[];
}

interface ChannelConfig {
  enabled: boolean;
  dmPolicy: string;
  groupPolicy: string;
  configPath: string;
  inviteLink: string;
  rpcServerPath: string;
  pythonPath: string;
}

interface ActiveAccount {
  accountId: number;
  email: string;
}

interface SendMessageParams {
  text?: string;
  body?: string;
  chatId?: number;
  chat_id?: number;
  file?: string;
  filePath?: string;
  fileName?: string;
  name?: string;
  to?: string;
}

interface InboundMessageParams {
  chatId?: number;
  chat_id?: number;
  text?: string;
  from?: string;
  fromName?: string;
  timestamp?: number;
  messageId?: number;
  id?: number;
}

interface ProfileUpdateParams {
  displayName?: string;
  clearAvatar?: boolean;
  avatarPath?: string | null;
}

interface CreateGroupParams {
  name: string;
  protect?: boolean;
  members?: string[];
}

interface CreateAccountParams {
  email: string;
  password: string;
  imapServer?: string | null;
  imapPort?: number | null;
  imapSecurity?: Socket | null;
  imapUser?: string | null;
  smtpServer?: string | null;
  smtpPort?: number | null;
  smtpSecurity?: Socket | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  displayName?: string;
}

interface GatewayNotification {
  chatId: number;
  text: string;
  from: string | null;
  fromName: string | null;
  timestamp: number;
  messageId: number;
  raw: T.Message | InboundMessageParams;
}

interface Gateway {
  handleMessage?: (channel: string, payload: GatewayNotification) => Promise<void>;
  emit?: (event: string, payload: Record<string, unknown>) => void;
}

const DEFAULT_CONFIG_FILE = 'deltachat-config.json';
const DEFAULT_PLUGIN_DIR = path.resolve(__dirname, '..');
const DEFAULT_RPC_SCRIPT = path.join(os.homedir(), '.venv', 'deltachat', 'bin', 'deltachat-rpc-server');
const DEFAULT_PYTHON = path.join(os.homedir(), '.venv', 'deltachat', 'bin', 'python');

function expandHome(value: string): string;
function expandHome(value: unknown): unknown;
function expandHome(value: unknown): unknown {
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

function resolveConfigPath(customPath?: string): string {
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

function readJsonFile(filePath: string): RawConfig {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawConfig;
}

function isSqliteDatabase(filePath: string): boolean {
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

function normalizeAccount(account: RawAccountConfig, index: number): NormalizedAccount {
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

function validateConfig(config: RawConfig, configPath: string): void {
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

function loadRuntimeConfig(customPath?: string): RuntimeConfig {
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
  gateway: Gateway | null;
  channelConfig: ChannelConfig;
  runtimeConfig: RuntimeConfig | null;
  rpcProcess: ChildProcess | null;
  client: StdioDeltaChat | null;
  account: ActiveAccount | null;
  running: boolean;
  listenLoop: Promise<void> | null;
  stopRequested: boolean;

  constructor(channelConfig: Partial<ChannelConfig> = {}) {
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

  updateChannelConfig(channelConfig: Partial<ChannelConfig> = {}): void {
    this.channelConfig = { ...this.channelConfig, ...channelConfig };
  }

  async init(gateway?: Gateway, options?: { skipListener?: boolean }): Promise<void> {
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

    if (!options?.skipListener) {
      this.listenLoop = this.listenForMessages().catch((error: Error) => {
        console.error('[Delta Chat] listener stopped:', error.message);
      });
    }
  }

  getStatus(): { running: boolean; configured: boolean; account: string | null; configPath: string } {
    return {
      running: this.running,
      configured: Boolean(this.account),
      account: this.account ? this.account.email : null,
      configPath: this.runtimeConfig ? this.runtimeConfig.configPath : resolveConfigPath(this.channelConfig.configPath),
    };
  }

  async send(message: SendMessageParams = {}): Promise<number> {
    const text = message.text || message.body || null;
    const chatId = Number(message.chatId || message.chat_id || 0);
    const filePath = message.file || message.filePath || null;
    const fileName = message.fileName || message.name || null;

    if (!text && !filePath) {
      throw new Error('Delta Chat send requires message.text or message.file');
    }

    if (filePath) {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`File not found: ${resolved}`);
      }
    }

    await this.assertReady();

    let targetChatId = chatId;
    if (!targetChatId && message.to) {
      targetChatId = await this.getOrCreateChatByEmail(message.to);
    }

    if (!targetChatId) {
      throw new Error('Delta Chat send requires message.chatId or message.to');
    }

    const resolvedFile = filePath ? path.resolve(filePath) : null;
    const resolvedName = resolvedFile ? (fileName || path.basename(resolvedFile)) : null;

    const [messageId] = await this.client!.rpc.miscSendMsg(
      this.account!.accountId,
      targetChatId,
      text,
      resolvedFile,
      resolvedName,
      null,
      null
    );

    return messageId;
  }

  async handleMessage(message: InboundMessageParams = {}): Promise<null> {
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

  async updateProfile(profile: ProfileUpdateParams = {}): Promise<{ accountId: number; displayName: string | null; avatarPath: string | null }> {
    await this.assertReady();

    const updates: Record<string, string | null> = {};

    if (profile.displayName !== undefined) {
      updates.displayname = profile.displayName || null;
    }

    if (profile.clearAvatar) {
      updates.selfavatar = null;
    } else if (profile.avatarPath !== undefined && profile.avatarPath !== null) {
      const avatarPath = path.resolve(String(profile.avatarPath));
      if (!fs.existsSync(avatarPath)) {
        throw new Error(`Avatar file not found: ${avatarPath}`);
      }
      updates.selfavatar = avatarPath;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('updateProfile requires displayName, avatarPath, or clearAvatar');
    }

    await this.client!.rpc.batchSetConfig(this.account!.accountId, updates);

    return {
      accountId: this.account!.accountId,
      displayName: Object.prototype.hasOwnProperty.call(updates, 'displayname')
        ? updates.displayname
        : await this.client!.rpc.getConfig(this.account!.accountId, 'displayname'),
      avatarPath: Object.prototype.hasOwnProperty.call(updates, 'selfavatar')
        ? updates.selfavatar
        : await this.client!.rpc.getConfig(this.account!.accountId, 'selfavatar'),
    };
  }

  async getChatInfo(chatId: number): Promise<T.FullChat & { encryptionInfo: string | null }> {
    await this.assertReady();

    const resolvedChatId = Number(chatId || 0);
    if (!Number.isInteger(resolvedChatId) || resolvedChatId <= 0) {
      throw new Error('getChatInfo requires a valid chatId');
    }

    const fullChat = await this.client!.rpc.getFullChatById(this.account!.accountId, resolvedChatId);
    let encryptionInfo: string | null = null;
    try {
      encryptionInfo = await this.client!.rpc.getChatEncryptionInfo(this.account!.accountId, resolvedChatId);
    } catch (_error) {
      encryptionInfo = null;
    }

    return {
      ...fullChat,
      encryptionInfo,
    };
  }

  async createGroup(options: CreateGroupParams): Promise<T.FullChat & { encryptionInfo: string | null }> {
    await this.assertReady();

    if (!options.name) {
      throw new Error('createGroup requires name');
    }

    const chatId = await this.client!.rpc.createGroupChat(
      this.account!.accountId,
      options.name,
      Boolean(options.protect)
    );

    const members = Array.isArray(options.members) ? options.members : [];
    for (const member of members) {
      const email = String(member || '').trim();
      if (!email) {
        continue;
      }
      const contactId = await this.client!.rpc.createContact(this.account!.accountId, email, null);
      await this.client!.rpc.addContactToChat(this.account!.accountId, chatId, contactId);
    }

    return this.getChatInfo(chatId);
  }

  async renameChat(chatId: number, newName: string): Promise<T.FullChat & { encryptionInfo: string | null }> {
    await this.assertReady();

    if (!newName) {
      throw new Error('renameChat requires newName');
    }

    await this.client!.rpc.setChatName(this.account!.accountId, Number(chatId), newName);
    return this.getChatInfo(chatId);
  }

  async leaveGroup(chatId: number): Promise<{ chatId: number; left: boolean }> {
    await this.assertReady();
    await this.client!.rpc.leaveGroup(this.account!.accountId, Number(chatId));
    return { chatId: Number(chatId), left: true };
  }

  async saveAttachment(messageId: number, destinationPath: string): Promise<{ messageId: number; path: string }> {
    await this.assertReady();

    if (!destinationPath) {
      throw new Error('saveAttachment requires destinationPath');
    }

    const resolvedPath = path.resolve(destinationPath);
    await this.client!.rpc.saveMsgFile(this.account!.accountId, Number(messageId), resolvedPath);
    return { messageId: Number(messageId), path: resolvedPath };
  }

  async editMessage(messageId: number, newText: string): Promise<T.Message> {
    await this.assertReady();

    if (!newText) {
      throw new Error('editMessage requires newText');
    }

    await this.client!.rpc.sendEditRequest(this.account!.accountId, Number(messageId), newText);
    return this.client!.rpc.getMessage(this.account!.accountId, Number(messageId));
  }

  async reactToMessage(messageId: number, reaction: string | string[]): Promise<{ messageId: number; reaction: string[]; reactions: T.Reactions }> {
    await this.assertReady();

    const parts = Array.isArray(reaction)
      ? reaction
      : String(reaction || '').split(/\s+/).filter(Boolean);

    await this.client!.rpc.sendReaction(this.account!.accountId, Number(messageId), parts);
    const reactions = await this.client!.rpc.getMessageReactions(this.account!.accountId, Number(messageId));
    return {
      messageId: Number(messageId),
      reaction: parts,
      reactions,
    };
  }

  async getSecureJoinQr(chatId: number | null, withSvg = false): Promise<{ chatId: number | null; qr: string; svg?: string }> {
    await this.assertReady();

    const resolvedChatId = chatId ? Number(chatId) : null;
    if (withSvg) {
      const [qr, svg] = await this.client!.rpc.getChatSecurejoinQrCodeSvg(this.account!.accountId, resolvedChatId);
      return { chatId: resolvedChatId, qr, svg };
    }

    const qr = await this.client!.rpc.getChatSecurejoinQrCode(this.account!.accountId, resolvedChatId);
    return { chatId: resolvedChatId, qr };
  }

  async acceptChat(chatId: number): Promise<{ chatId: number; accepted: boolean }> {
    await this.assertReady();

    const resolvedChatId = Number(chatId || 0);
    if (!Number.isInteger(resolvedChatId) || resolvedChatId <= 0) {
      throw new Error('acceptChat requires a valid chatId');
    }

    await this.client!.rpc.acceptChat(this.account!.accountId, resolvedChatId);
    return { chatId: resolvedChatId, accepted: true };
  }

  async joinQr(qrText: string): Promise<{ kind: string; chatId: number }> {
    await this.assertReady();

    if (!qrText) {
      throw new Error('joinQr requires qrText');
    }

    const qr = await this.client!.rpc.checkQr(this.account!.accountId, qrText);

    if (qr.kind === 'askVerifyGroup' || qr.kind === 'askVerifyContact') {
      const chatId = await this.client!.rpc.secureJoin(this.account!.accountId, qrText);
      await this.client!.rpc.acceptChat(this.account!.accountId, chatId);
      return { kind: qr.kind, chatId };
    }

    if (qr.kind === 'fprOk') {
      const chatId = await this.client!.rpc.createChatByContactId(this.account!.accountId, qr.contact_id);
      await this.client!.rpc.acceptChat(this.account!.accountId, chatId);
      return { kind: qr.kind, chatId };
    }

    throw new Error(`QR kind not joinable via CLI: ${qr.kind}`);
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.running = false;

    if (this.account && this.client) {
      try {
        await withTimeout(this.client!.rpc.stopIo(this.account!.accountId), 2000, 'stopIo');
      } catch (error: unknown) {
        console.error('[Delta Chat] stopIo failed:', error instanceof Error ? error.message : error);
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
      const exitPromise = new Promise<void>((resolve) => {
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

  async assertReady(): Promise<void> {
    if (!this.running) {
      await this.init();
    }
  }

  getRpcCommand(): string[] {
    const configured = this.runtimeConfig!.runtime.rpc_command;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured as string[];
    }

    const scriptPath = expandHome(String(this.channelConfig.rpcServerPath || this.runtimeConfig!.runtime.rpc_server_path || DEFAULT_RPC_SCRIPT));
    const pythonPath = expandHome(String(this.channelConfig.pythonPath || this.runtimeConfig!.runtime.python_path || DEFAULT_PYTHON));

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

  resolveRpcCwd(): string {
    // Use the directory containing the config file so the accounts/
    // database lives next to the config, not next to the code.
    if (this.runtimeConfig?.configPath) {
      return path.dirname(this.runtimeConfig.configPath);
    }
    return DEFAULT_PLUGIN_DIR;
  }

  async startRpcServer(): Promise<void> {
    if (this.rpcProcess) {
      return;
    }

    const command = this.getRpcCommand();
    const [bin, ...args] = command;
    const cwd = this.resolveRpcCwd();

    this.rpcProcess = spawn(bin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.rpcProcess.once('error', (error: Error) => {
      console.error('[Delta Chat] RPC process error:', error.message);
    });
  }

  async connectClient(): Promise<void> {
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

  async ensureAccount(): Promise<void> {
    const configuredAccount = this.runtimeConfig!.accounts[0];
    const accounts = await this.client!.rpc.getAllAccounts();

    let account: T.Account | undefined = accounts.find((entry) => (
      configuredAccount.accountId > 0
      && entry.id === configuredAccount.accountId
    )) || accounts.find((entry) => (
      entry.kind === 'Configured'
      && entry.addr
      && entry.addr.toLowerCase() === configuredAccount.email.toLowerCase()
    ));

    if (!account && isSqliteDatabase(configuredAccount.databasePath)) {
      try {
        const migratedId = await this.client!.rpc.migrateAccount(configuredAccount.databasePath);
        account = await this.client!.rpc.getAccountInfo(migratedId);
      } catch (error: unknown) {
        console.error('[Delta Chat] migrateAccount failed:', error instanceof Error ? error.message : error);
      }
    }

    if (!account) {
      const accountId = await this.client!.rpc.addAccount();
      await this.client!.rpc.addOrUpdateTransport(accountId, {
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
      account = await this.client!.rpc.getAccountInfo(accountId);
    }

    const accountId = account.id;
    const isConfigured = await this.client!.rpc.isConfigured(accountId);
    if (!isConfigured && configuredAccount.password) {
      await this.client!.rpc.addOrUpdateTransport(accountId, {
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

    await this.client!.rpc.selectAccount(accountId);
    await this.client!.rpc.batchSetConfig(accountId, { bot: '1' });
    await this.client!.rpc.startIo(accountId);

    this.account = {
      accountId,
      email: configuredAccount.email,
    };
  }

  async joinInviteLink(): Promise<void> {
    const inviteLink = this.channelConfig.inviteLink || this.runtimeConfig?.inviteLink;
    if (!inviteLink || !this.client || !this.account) {
      return;
    }

    try {
      const qr = await this.client!.rpc.checkQr(this.account!.accountId, inviteLink);
      if (qr.kind === 'askVerifyGroup' || qr.kind === 'askVerifyContact') {
        const chatId = await this.client!.rpc.secureJoin(this.account!.accountId, inviteLink);
        await this.client!.rpc.acceptChat(this.account!.accountId, chatId);
        console.log(`[Delta Chat] Joined invite chat ${chatId}`);
        return;
      }

      if (qr.kind === 'fprOk') {
        const chatId = await this.client!.rpc.createChatByContactId(this.account!.accountId, qr.contact_id);
        await this.client!.rpc.acceptChat(this.account!.accountId, chatId);
        console.log(`[Delta Chat] Joined verified contact chat ${chatId}`);
        return;
      }

      console.log(`[Delta Chat] Invite link check result: ${qr.kind}`);
    } catch (error: unknown) {
      console.error('[Delta Chat] Failed to process invite link:', error instanceof Error ? error.message : error);
    }
  }

  async listenForMessages(): Promise<void> {
    while (!this.stopRequested && this.client && this.account) {
      try {
        const messageIds = await this.client!.rpc.waitNextMsgs(this.account!.accountId);

        for (const messageId of messageIds) {
          const message = await this.client!.rpc.getMessage(this.account!.accountId, messageId);
          const senderAddress = message && message.sender ? message.sender.address : null;
          if (!message || !message.text || (
            senderAddress
            && senderAddress.toLowerCase() === this.account.email.toLowerCase()
          )) {
            continue;
          }

          await this.client!.rpc.markseenMsgs(this.account!.accountId, [messageId]);

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
      } catch (error: unknown) {
        if (!this.stopRequested) {
          console.error('[Delta Chat] waitNextMsgs failed:', error instanceof Error ? error.message : error);
          await sleep(1000);
        }
      }
    }
  }

  async listAccounts(): Promise<{ accountId: number; email: string | null; configured: boolean }[]> {
    if (!this.client) {
      this.runtimeConfig = loadRuntimeConfig(this.channelConfig.configPath);
      await this.startRpcServer();
      await this.connectClient();
    }

    const accounts = await this.client!.rpc.getAllAccounts();
    const result: { accountId: number; email: string | null; configured: boolean }[] = [];

    for (const entry of accounts) {
      const isConfigured = await this.client!.rpc.isConfigured(entry.id);
      let addr: string | null = (entry.kind === 'Configured' ? entry.addr : null) || null;
      if (!addr && isConfigured) {
        try {
          addr = await this.client!.rpc.getConfig(entry.id, 'addr');
        } catch (_error) {
          addr = null;
        }
      }
      result.push({
        accountId: entry.id,
        email: addr,
        configured: isConfigured,
      });
    }

    return result;
  }

  async createAccount(options: CreateAccountParams): Promise<{ accountId: number; email: string; displayName: string | null }> {
    if (!options.email) {
      throw new Error('createAccount requires email');
    }
    if (!options.password) {
      throw new Error('createAccount requires password');
    }

    if (!this.client) {
      this.runtimeConfig = loadRuntimeConfig(this.channelConfig.configPath);
      await this.startRpcServer();
      await this.connectClient();
    }

    const accountId = await this.client!.rpc.addAccount();
    await this.client!.rpc.addOrUpdateTransport(accountId, {
      addr: options.email,
      password: options.password,
      imapServer: options.imapServer || null,
      imapPort: options.imapPort || null,
      imapSecurity: options.imapSecurity || null,
      imapUser: options.imapUser || null,
      smtpServer: options.smtpServer || null,
      smtpPort: options.smtpPort || null,
      smtpSecurity: options.smtpSecurity || null,
      smtpUser: options.smtpUser || null,
      smtpPassword: options.smtpPassword || null,
      certificateChecks: null,
      oauth2: null,
    });

    if (options.displayName) {
      await this.client!.rpc.batchSetConfig(accountId, {
        displayname: options.displayName,
      });
    }

    await this.client!.rpc.selectAccount(accountId);
    await this.client!.rpc.startIo(accountId);

    return {
      accountId,
      email: options.email,
      displayName: options.displayName || null,
    };
  }

  async deleteAccount(accountId: number): Promise<{ accountId: number; deleted: boolean }> {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error('deleteAccount requires a valid accountId');
    }

    if (!this.client) {
      this.runtimeConfig = loadRuntimeConfig(this.channelConfig.configPath);
      await this.startRpcServer();
      await this.connectClient();
    }

    await this.client!.rpc.removeAccount(accountId);

    if (this.account && this.account.accountId === accountId) {
      this.account = null;
    }

    return { accountId, deleted: true };
  }

  async getOrCreateChatByEmail(email: string): Promise<number> {
    let contactId = await this.client!.rpc.lookupContactIdByAddr(this.account!.accountId, email);
    if (!contactId) {
      contactId = await this.client!.rpc.createContact(this.account!.accountId, email, null);
    }

    const existingChatId = await this.client!.rpc.getChatIdByContactId(this.account!.accountId, contactId);
    if (existingChatId) {
      return existingChatId;
    }

    return this.client!.rpc.createChatByContactId(this.account!.accountId, contactId);
  }

  async notifyGateway(payload: GatewayNotification): Promise<void> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export {
  DeltaChatRuntime,
  loadRuntimeConfig,
};

export type {
  ChannelConfig,
  SendMessageParams,
  InboundMessageParams,
  ProfileUpdateParams,
  CreateGroupParams,
  CreateAccountParams,
  ActiveAccount,
  RuntimeConfig,
  Gateway,
  GatewayNotification,
};
