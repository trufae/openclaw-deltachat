import { DeltaChatRuntime, loadRuntimeConfig } from '../lib/runtime.js';
import type { ChannelConfig, DmPolicy, SendMessageParams, InboundMessageParams, ProfileUpdateParams, CreateGroupParams, CreateAccountParams, Gateway } from '../lib/runtime.js';

const CHANNEL_ID = 'deltachat';

let runtime: DeltaChatRuntime | null = null;

interface DeltaChatChannelConfig extends Partial<ChannelConfig> {
  accounts?: Record<string, Partial<PluginAccountConfig>>;
}

interface OpenClawConfig {
  channels?: {
    deltachat?: DeltaChatChannelConfig;
  };
  session?: { store?: string };
}

interface PluginAccountConfig extends Partial<ChannelConfig> {
  accountId?: string;
  allowFrom?: string[];
  accounts?: Record<string, Partial<PluginAccountConfig>>;
}

interface Logger {
  info?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

interface ActivityEntry {
  channel: string;
  accountId: string;
  direction: 'inbound' | 'outbound';
  at: number;
}

interface PairingOpts {
  channel: string;
  accountId: string;
}

interface PairingRequestOpts extends PairingOpts {
  id: string;
  meta: { name: string };
}

interface PairingReplyOpts {
  channel: string;
  idLine: string;
  code: string;
}

interface AgentRouteOpts {
  cfg: OpenClawConfig;
  channel: string;
  accountId: string;
  peer: { kind: 'group' | 'direct'; id: string };
}

interface AgentRoute {
  agentId: string;
  sessionKey: string;
  accountId: string;
}

interface SessionRecordOpts {
  storePath: string;
  sessionKey: string;
  ctx: Record<string, unknown>;
  onRecordError: (err: unknown) => void;
}

interface ReplyDispatcherOpts {
  cfg: OpenClawConfig;
  agentId: string;
  channel: string;
  accountId: string;
}

interface ReplyDispatcherResult {
  onModelSelected?: unknown;
  [key: string]: unknown;
}

interface ChannelRuntime {
  activity?: {
    record?: (entry: ActivityEntry) => void;
  };
  pairing?: {
    readAllowFromStore: (opts: PairingOpts) => Promise<string[]>;
    upsertPairingRequest: (opts: PairingRequestOpts) => Promise<{ code: string; created: boolean }>;
    buildPairingReply?: (opts: PairingReplyOpts) => string | null;
  };
  routing?: {
    resolveAgentRoute?: (opts: AgentRouteOpts) => AgentRoute;
  };
  session?: {
    resolveStorePath?: (store: string | undefined, opts: { agentId: string }) => string;
    readSessionUpdatedAt?: (opts: { storePath: string; sessionKey: string }) => number | undefined;
    recordInboundSession?: (opts: SessionRecordOpts) => Promise<void>;
  };
  reply?: {
    resolveEnvelopeFormatOptions?: (cfg: OpenClawConfig) => Record<string, unknown>;
    formatAgentEnvelope?: (opts: Record<string, unknown>) => string;
    finalizeInboundContext?: (opts: Record<string, unknown>) => Record<string, unknown>;
    createReplyDispatcherWithTyping?: (opts: ReplyDispatcherOpts) => ReplyDispatcherResult;
    dispatchReplyWithBufferedBlockDispatcher?: (opts: Record<string, unknown>) => Promise<void>;
  };
}

interface GatewayContext {
  account: PluginAccountConfig;
  channelRuntime: ChannelRuntime;
  cfg: OpenClawConfig;
  log?: Logger;
  abortSignal: AbortSignal;
}

interface DeliverPayload {
  text?: string;
  body?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
}

interface AttachmentFields {
  MediaPath?: string | null;
  MediaType?: string | null;
}

function getRuntime(channelConfig: Partial<ChannelConfig>): DeltaChatRuntime {
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
  version: '1.2.0',
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
  capabilities: {
    chatTypes: ['direct', 'group'],
    media: true,
    reactions: true,
    threads: false,
    nativeCommands: true,
    blockStreaming: false,
  },

  config: {
    listAccountIds: (cfg: OpenClawConfig) => {
      const section = cfg?.channels?.deltachat;
      if (!section) return ['default'];
      if (section.accounts && typeof section.accounts === 'object') {
        return Object.keys(section.accounts);
      }
      return ['default'];
    },
    resolveAccount: (cfg: OpenClawConfig, accountId?: string): PluginAccountConfig => {
      const section = cfg?.channels?.deltachat ?? {};
      if (accountId && accountId !== 'default' && section.accounts?.[accountId]) {
        return { ...section, ...section.accounts[accountId], accountId } as PluginAccountConfig;
      }
      return { ...section, accountId: accountId ?? 'default' } as PluginAccountConfig;
    },
    defaultAccountId: () => 'default',
    isConfigured: (account: PluginAccountConfig) => {
      return Boolean(account?.enabled || account?.configPath);
    },
    isEnabled: (account: PluginAccountConfig) => {
      return account?.enabled !== false;
    },
  },

  pairing: {
    idLabel: 'deltachatAddress',
  },

  gateway: {
    startAccount: async (ctx: GatewayContext) => {
      const account = ctx.account;
      const cr = ctx.channelRuntime;
      const instance = getRuntime(account);
      const cfg = ctx.cfg;

      ctx.log?.info?.(`[deltachat] starting account ${account.accountId ?? 'default'}`);

      // Initialize the runtime without the built-in listener — we run our own
      // message loop that feeds into the openclaw reply pipeline.
      await instance.init(undefined, { skipListener: true });

      const accountId = instance.account?.accountId;
      const selfEmail = instance.account?.email?.toLowerCase() ?? '';

      // Resolve DM policy from config
      const dmPolicy: DmPolicy = account.dmPolicy ?? 'pairing';

      // Message listener loop
      const abortSignal: AbortSignal = ctx.abortSignal;

      const listen = async () => {
        while (!abortSignal.aborted && instance.client && instance.account) {
          try {
            const messageIds = await Promise.race([
              instance.client.rpc.waitNextMsgs(accountId!),
              new Promise<null>((resolve) => {
                const onAbort = () => resolve(null);
                abortSignal.addEventListener('abort', onAbort, { once: true });
              }),
            ]);

            if (!messageIds || abortSignal.aborted) break;

            for (const messageId of messageIds) {
              const message = await instance.client.rpc.getMessage(accountId!, messageId);
              const senderAddress = message?.sender?.address ?? null;

              if (!message || (!message.text && !message.file)) continue;
              if (senderAddress && senderAddress.toLowerCase() === selfEmail) continue;

              await instance.client.rpc.markseenMsgs(accountId!, [messageId]);

              const chat = await instance.client.rpc.getFullChatById(accountId!, message.chatId);
              const isGroup = chat?.chatType === 120;
              const senderName = message.sender?.displayName || message.sender?.name || senderAddress || 'unknown';
              const peerId = isGroup ? `dc:group:${message.chatId}` : `dc:${senderAddress}`;
              const hasFile = Boolean(message.file);
              const rawBody = (message.text || '').trim();

              if (!rawBody && !hasFile) continue;

              cr?.activity?.record?.({
                channel: CHANNEL_ID,
                accountId: account.accountId ?? 'default',
                direction: 'inbound',
                at: Date.now(),
              });

              // DM policy gate
              if (!isGroup && dmPolicy === 'disabled') {
                ctx.log?.debug?.(`[deltachat] drop DM from ${senderAddress} (dmPolicy=disabled)`);
                continue;
              }

              if (!isGroup && dmPolicy !== 'open') {
                // For pairing mode, issue a pairing challenge
                if (dmPolicy === 'pairing' && cr?.pairing) {
                  const allowStore = await cr.pairing.readAllowFromStore({
                    channel: CHANNEL_ID,
                    accountId: account.accountId ?? 'default',
                  }).catch(() => [] as string[]);

                  const configAllow = Array.isArray(account.allowFrom) ? account.allowFrom : [];
                  const allAllowed = [...configAllow, ...allowStore].map((e: string) => e.toLowerCase());
                  const senderId = (senderAddress || '').toLowerCase();

                  if (!allAllowed.includes(senderId)) {
                    const { code, created } = await cr.pairing.upsertPairingRequest({
                      channel: CHANNEL_ID,
                      accountId: account.accountId ?? 'default',
                      id: senderId,
                      meta: { name: senderName },
                    }).catch(() => ({ code: '', created: false }));

                    if (created && code) {
                      const replyText = cr.pairing.buildPairingReply?.({
                        channel: CHANNEL_ID,
                        idLine: `Your Delta Chat address: ${senderAddress}`,
                        code,
                      });
                      if (replyText) {
                        await instance.send({ chatId: message.chatId, text: replyText });
                      }
                    }

                    ctx.log?.debug?.(`[deltachat] drop DM from ${senderAddress} (dmPolicy=pairing, not allowed)`);
                    continue;
                  }
                }
              }

              // Resolve agent route
              const route = cr?.routing?.resolveAgentRoute?.({
                cfg,
                channel: CHANNEL_ID,
                accountId: account.accountId ?? 'default',
                peer: {
                  kind: isGroup ? 'group' : 'direct',
                  id: peerId,
                },
              }) ?? { agentId: 'main', sessionKey: peerId, accountId: account.accountId ?? 'default' };

              const storePath = cr?.session?.resolveStorePath?.(cfg.session?.store, { agentId: route.agentId }) ?? '';
              const envelopeOptions = cr?.reply?.resolveEnvelopeFormatOptions?.(cfg) ?? {};
              const previousTimestamp = cr?.session?.readSessionUpdatedAt?.({
                storePath,
                sessionKey: route.sessionKey,
              });

              const body = cr?.reply?.formatAgentEnvelope?.({
                channel: 'Delta Chat',
                from: senderName,
                timestamp: message.timestamp ? message.timestamp * 1000 : Date.now(),
                previousTimestamp,
                envelope: envelopeOptions,
                body: rawBody,
              }) ?? rawBody;

              const attachmentFields: AttachmentFields = {};
              if (hasFile) {
                attachmentFields.MediaPath = message.file;
                attachmentFields.MediaType = message.fileMime || 'application/octet-stream';
              }

              const ctxPayload = cr?.reply?.finalizeInboundContext?.({
                Body: body,
                RawBody: rawBody,
                CommandBody: rawBody,
                From: peerId,
                To: peerId,
                SessionKey: route.sessionKey,
                AccountId: route.accountId,
                ChatType: isGroup ? 'group' : 'direct',
                ConversationLabel: isGroup ? (chat?.name || `chat-${message.chatId}`) : senderName,
                SenderName: senderName,
                SenderId: (senderAddress || '').toLowerCase(),
                GroupSubject: isGroup ? chat?.name : undefined,
                Provider: CHANNEL_ID,
                Surface: CHANNEL_ID,
                MessageSid: String(message.id),
                Timestamp: message.timestamp ? message.timestamp * 1000 : Date.now(),
                OriginatingChannel: CHANNEL_ID,
                OriginatingTo: peerId,
                ...attachmentFields,
              }) ?? { Body: rawBody, RawBody: rawBody, SessionKey: route.sessionKey, ...attachmentFields };

              // Record session and dispatch AI reply
              if (cr?.session?.recordInboundSession) {
                await cr.session.recordInboundSession({
                  storePath,
                  sessionKey: route.sessionKey,
                  ctx: ctxPayload,
                  onRecordError: (err: unknown) => {
                    ctx.log?.error?.(`[deltachat] session record error: ${err}`);
                  },
                });
              }

              if (cr?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
                const { onModelSelected, ...replyPipeline } = cr.reply.createReplyDispatcherWithTyping?.({
                  cfg,
                  agentId: route.agentId,
                  channel: CHANNEL_ID,
                  accountId: account.accountId ?? 'default',
                }) ?? { onModelSelected: undefined };

                await cr.reply.dispatchReplyWithBufferedBlockDispatcher({
                  ctx: ctxPayload,
                  cfg,
                  dispatcherOptions: {
                    ...replyPipeline,
                    deliver: async (payload: DeliverPayload) => {
                      const text = (payload?.text || payload?.body || '').trim() || null;
                      const mediaUrls = payload?.mediaUrls ?? (payload?.mediaUrl ? [payload.mediaUrl] : []);
                      if (mediaUrls.length > 0) {
                        for (const mediaUrl of mediaUrls) {
                          await instance.send({ chatId: message.chatId, text: null, file: mediaUrl });
                        }
                        if (text) {
                          await instance.send({ chatId: message.chatId, text });
                        }
                      } else if (text) {
                        await instance.send({ chatId: message.chatId, text });
                      }
                    },
                    onError: async (err: unknown, info: { kind?: string }) => {
                      ctx.log?.error?.(`[deltachat] reply dispatch error (${info?.kind}): ${err}`);
                      try {
                        await instance.send({ chatId: message.chatId, text: `[error] ${err}` });
                      } catch (_sendErr) {
                        // best-effort error delivery
                      }
                    },
                  },
                  replyOptions: {
                    onModelSelected,
                  },
                });
              }
            }
          } catch (error: unknown) {
            if (!abortSignal.aborted) {
              ctx.log?.error?.(`[deltachat] listener error: ${error instanceof Error ? error.message : error}`);
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        }
      };

      // Start listening in the background (non-blocking)
      const listenPromise = listen();

      ctx.log?.info?.(`[deltachat] account started, listening for messages`);

      // Return a stop handle and block until abort
      return new Promise<void>((resolve) => {
        abortSignal.addEventListener('abort', async () => {
          await listenPromise.catch(() => {});
          if (runtime) {
            await runtime.stop().catch(() => {});
            runtime = null;
          }
          resolve();
        }, { once: true });
      });
    },
  },

  async init(gateway: Gateway, channelConfig: Partial<ChannelConfig> = {}) {
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

  async send(channelConfig: Partial<ChannelConfig> = {}, message: SendMessageParams = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.send(message);
  },

  async handleMessage(channelConfig: Partial<ChannelConfig> = {}, message: InboundMessageParams = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.handleMessage(message);
  },

  async updateProfile(channelConfig: Partial<ChannelConfig> = {}, profile: ProfileUpdateParams = {}) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.updateProfile(profile);
  },

  async getChatInfo(channelConfig: Partial<ChannelConfig> = {}, chatId: number) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.getChatInfo(chatId);
  },

  async createGroup(channelConfig: Partial<ChannelConfig> = {}, options: CreateGroupParams) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.createGroup(options);
  },

  async renameChat(channelConfig: Partial<ChannelConfig> = {}, chatId: number, newName: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.renameChat(chatId, newName);
  },

  async leaveGroup(channelConfig: Partial<ChannelConfig> = {}, chatId: number) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.leaveGroup(chatId);
  },

  async saveAttachment(channelConfig: Partial<ChannelConfig> = {}, messageId: number, destinationPath: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.saveAttachment(messageId, destinationPath);
  },

  async editMessage(channelConfig: Partial<ChannelConfig> = {}, messageId: number, newText: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.editMessage(messageId, newText);
  },

  async reactToMessage(channelConfig: Partial<ChannelConfig> = {}, messageId: number, reaction: string | string[]) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.reactToMessage(messageId, reaction);
  },

  async getSecureJoinQr(channelConfig: Partial<ChannelConfig> = {}, chatId: number | null, withSvg = false) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.getSecureJoinQr(chatId, withSvg);
  },

  async joinQr(channelConfig: Partial<ChannelConfig> = {}, qrText: string) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.joinQr(qrText);
  },

  async acceptChat(channelConfig: Partial<ChannelConfig> = {}, chatId: number) {
    const instance = getRuntime(channelConfig);
    await instance.init();
    return instance.acceptChat(chatId);
  },

  async listAccounts(channelConfig: Partial<ChannelConfig> = {}) {
    const instance = getRuntime(channelConfig);
    return instance.listAccounts();
  },

  async createAccount(channelConfig: Partial<ChannelConfig> = {}, options: CreateAccountParams) {
    const instance = getRuntime(channelConfig);
    return instance.createAccount(options);
  },

  async deleteAccount(channelConfig: Partial<ChannelConfig> = {}, accountId: number) {
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
      } catch (error: unknown) {
        return {
          running: false,
          configured: false,
          account: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return runtime.getStatus();
  },
};
