#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { DeltaChatRuntime, loadRuntimeConfig } from '../lib/runtime.js';

function printHelp(): void {
  console.log(`Delta Chat CLI

Usage:
  deltachat-cli status [--config PATH]
  deltachat-cli list-chats [--config PATH] [--json] [--limit N] [--query TEXT]
  deltachat-cli list-messages --chat CHAT_ID [--config PATH] [--json] [--limit N]
  deltachat-cli send (--chat CHAT_ID | --to EMAIL) [--text TEXT] [--file PATH] [--name NAME] [--config PATH]
  deltachat-cli delete-messages --chat CHAT_ID --ids ID[,ID...] [--for-all] [--config PATH]
  deltachat-cli set-profile [--name NAME] [--avatar PATH] [--clear-avatar] [--config PATH]
  deltachat-cli save-attachment --message MESSAGE_ID --path PATH [--config PATH]
  deltachat-cli edit-message --message MESSAGE_ID --text TEXT [--config PATH]
  deltachat-cli react --message MESSAGE_ID --reaction "EMOJI [EMOJI...]" [--config PATH]
  deltachat-cli chat-info --chat CHAT_ID [--json] [--config PATH]
  deltachat-cli create-group --name NAME [--protect] [--members EMAIL[,EMAIL...]] [--json] [--config PATH]
  deltachat-cli rename-chat --chat CHAT_ID --name NAME [--json] [--config PATH]
  deltachat-cli leave-group --chat CHAT_ID [--config PATH]
  deltachat-cli join-qr --qr TEXT [--json] [--config PATH]
  deltachat-cli show-qr [--chat CHAT_ID] [--svg-path PATH] [--json] [--config PATH]
  deltachat-cli receive [--config PATH] [--json] [--timeout SECONDS] [--count N] [--no-mark-seen]
  deltachat-cli create-chat --to EMAIL [--config PATH]

Examples:
  deltachat-cli list-chats
  deltachat-cli list-messages --chat 42 --limit 20
  deltachat-cli send --to friend@example.org --text "hello"
  deltachat-cli send --chat 42 --file ./photo.jpg --text "latest"
  deltachat-cli delete-messages --chat 42 --ids 101,102
  deltachat-cli set-profile --name "New Name" --avatar ./avatar.jpg
  deltachat-cli save-attachment --message 101 --path ./saved.bin
  deltachat-cli edit-message --message 101 --text "updated text"
  deltachat-cli react --message 101 --reaction "👍"
  deltachat-cli chat-info --chat 42
  deltachat-cli create-group --name "Project" --members a@example.org,b@example.org
  deltachat-cli rename-chat --chat 42 --name "New Group Name"
  deltachat-cli leave-group --chat 42
  deltachat-cli join-qr --qr "OPENPGP4FPR:..."
  deltachat-cli show-qr --chat 42 --svg-path ./group-qr.svg
  deltachat-cli receive --json
`);
}

function parseArgs(argv: string[]): any {
  const args: any = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    if (key === 'help' || key === 'json' || key === 'no-mark-seen' || key === 'for-all' || key === 'clear-avatar' || key === 'protect') {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function requireNumber(value: any, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function formatTimestamp(value: any): string {
  if (!value) {
    return '-';
  }

  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function formatSender(message: any): string {
  if (!message || !message.sender) {
    return '-';
  }

  return message.sender.displayName
    || message.sender.name
    || message.sender.address
    || String(message.fromId || '-');
}

function summarizeText(value: any, max = 72): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function parseIdList(value: any, name: string): number[] {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error(`${name} must contain at least one message ID`);
  }

  return items.map((item) => requireNumber(item, name));
}

function parseStringList(value: any): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function createSession(configPath?: string): Promise<DeltaChatRuntime> {
  const runtime = new DeltaChatRuntime({ configPath: configPath || '' });
  runtime.runtimeConfig = loadRuntimeConfig(configPath);

  await runtime.startRpcServer();
  try {
    await runtime.connectClient();
    await runtime.ensureAccount();
    await runtime.joinInviteLink();
    return runtime;
  } catch (error) {
    await runtime.stop();
    throw error;
  }
}

async function withSession(configPath: string | undefined, fn: (runtime: DeltaChatRuntime) => Promise<void>): Promise<void> {
  const runtime = await createSession(configPath);
  try {
    await fn(runtime);
  } finally {
    await runtime.stop();
  }
}

async function listChats(runtime: DeltaChatRuntime, options: any): Promise<void> {
  const accountId = runtime.account.accountId;
  const limit = options.limit ? requireNumber(options.limit, 'limit') : 20;
  const entries = await runtime.client.rpc.getChatlistEntries(
    accountId,
    null,
    options.query || null,
    null
  );
  const selectedEntries = entries.slice(0, limit);
  const items = await runtime.client.rpc.getChatlistItemsByEntries(accountId, selectedEntries);
  const chats: any[] = [];

  for (const entryId of selectedEntries) {
    const item = items[entryId];
    if (!item || item.kind !== 'ChatListItem') {
      continue;
    }

    chats.push({
      id: item.id,
      name: item.name,
      summary: [item.summaryText1, item.summaryText2].filter(Boolean).join(' ').trim(),
      fresh: item.freshMessageCounter,
      archived: item.isArchived,
      pinned: item.isPinned,
      muted: item.isMuted,
      protected: item.isProtected,
      group: item.isGroup,
      lastUpdated: item.lastUpdated,
      lastMessageId: item.lastMessageId,
    });
  }

  if (options.json) {
    console.log(JSON.stringify(chats, null, 2));
    return;
  }

  for (const chat of chats) {
    const flags = [
      chat.group ? 'group' : 'dm',
      chat.protected ? 'protected' : null,
      chat.pinned ? 'pinned' : null,
      chat.archived ? 'archived' : null,
      chat.muted ? 'muted' : null,
      chat.fresh ? `fresh=${chat.fresh}` : null,
    ].filter(Boolean).join(', ');

    console.log(`#${chat.id} ${chat.name}`);
    console.log(`  ${flags || 'no-flags'}`);
    console.log(`  updated=${formatTimestamp(chat.lastUpdated)} lastMsg=${chat.lastMessageId || '-'} summary=${chat.summary || '-'}`);
  }
}

async function listMessages(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.chat) {
    throw new Error('list-messages requires --chat CHAT_ID');
  }

  const accountId = runtime.account.accountId;
  const chatId = requireNumber(options.chat, 'chat');
  const limit = options.limit ? requireNumber(options.limit, 'limit') : 20;
  const chat = await runtime.client.rpc.getFullChatById(accountId, chatId);
  const messageIds = await runtime.client.rpc.getMessageIds(accountId, chatId, false, false);
  const selectedIds = messageIds.slice(0, limit);
  const messages: any[] = [];

  for (const messageId of selectedIds) {
    const message = await runtime.client.rpc.getMessage(accountId, messageId);
    messages.push({
      id: message.id,
      chatId: message.chatId,
      text: message.text,
      sender: formatSender(message),
      senderAddress: message.sender ? message.sender.address : null,
      timestamp: message.timestamp,
      viewType: message.viewType,
      file: message.file,
      fileName: message.fileName,
      isInfo: message.isInfo,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({ chat: { id: chat.id, name: chat.name }, messages }, null, 2));
    return;
  }

  console.log(`#${chat.id} ${chat.name}`);
  for (const message of messages) {
    const attachment = message.fileName || message.file ? ` file=${message.fileName || message.file}` : '';
    const kind = message.isInfo ? 'info' : 'msg';
    console.log(`[${formatTimestamp(message.timestamp)}] ${kind} ${message.id} ${message.sender}: ${message.text || ''}${attachment}`);
  }
}

async function sendMessage(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.text && !options.file) {
    throw new Error('send requires --text TEXT or --file PATH');
  }

  const accountId = runtime.account.accountId;
  let chatId = options.chat ? requireNumber(options.chat, 'chat') : 0;

  if (!chatId) {
    if (!options.to) {
      throw new Error('send requires --chat CHAT_ID or --to EMAIL');
    }
    chatId = await runtime.getOrCreateChatByEmail(options.to);
  }

  let filePath: string | null = null;
  let fileName: string | null = null;
  if (options.file) {
    filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    fileName = options.name || path.basename(filePath);
  }

  const [messageId] = await runtime.client.rpc.miscSendMsg(
    accountId,
    chatId,
    options.text || null,
    filePath,
    fileName,
    null,
    null
  );

  // Give Delta Chat IO a moment to flush the queued outgoing message before teardown.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`sent message ${messageId} to chat ${chatId}`);
}

async function deleteMessages(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.chat) {
    throw new Error('delete-messages requires --chat CHAT_ID');
  }
  if (!options.ids) {
    throw new Error('delete-messages requires --ids ID[,ID...]');
  }

  const accountId = runtime.account.accountId;
  const chatId = requireNumber(options.chat, 'chat');
  const messageIds = parseIdList(options.ids, 'ids');

  await runtime.client.rpc.getFullChatById(accountId, chatId);

  if (options['for-all']) {
    await runtime.client.rpc.deleteMessagesForAll(accountId, messageIds);
  } else {
    await runtime.client.rpc.deleteMessages(accountId, messageIds);
  }

  console.log(`deleted ${messageIds.length} message(s) from chat ${chatId}${options['for-all'] ? ' for all recipients' : ''}`);
}

async function setProfile(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.name && !options.avatar && !options['clear-avatar']) {
    throw new Error('set-profile requires --name NAME, --avatar PATH, or --clear-avatar');
  }

  const profile = await runtime.updateProfile({
    displayName: options.name,
    avatarPath: options.avatar,
    clearAvatar: Boolean(options['clear-avatar']),
  });

  console.log(`profile updated accountId=${profile.accountId} name=${profile.displayName || '-'} avatar=${profile.avatarPath || '-'}`);
}

async function saveAttachment(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.message) {
    throw new Error('save-attachment requires --message MESSAGE_ID');
  }
  if (!options.path) {
    throw new Error('save-attachment requires --path PATH');
  }

  const saved = await runtime.saveAttachment(
    requireNumber(options.message, 'message'),
    options.path
  );

  console.log(`saved attachment from message ${saved.messageId} to ${saved.path}`);
}

async function editMessage(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.message) {
    throw new Error('edit-message requires --message MESSAGE_ID');
  }
  if (!options.text) {
    throw new Error('edit-message requires --text TEXT');
  }

  const message = await runtime.editMessage(
    requireNumber(options.message, 'message'),
    options.text
  );

  console.log(`edited message ${message.id}: ${message.text}`);
}

async function reactToMessage(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.message) {
    throw new Error('react requires --message MESSAGE_ID');
  }
  if (options.reaction === undefined) {
    throw new Error('react requires --reaction "EMOJI [EMOJI...]"');
  }

  const result = await runtime.reactToMessage(
    requireNumber(options.message, 'message'),
    options.reaction
  );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`reacted to message ${result.messageId} with ${result.reaction.join(' ') || '(cleared)'}`);
}

async function showChatInfo(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.chat) {
    throw new Error('chat-info requires --chat CHAT_ID');
  }

  const info = await runtime.getChatInfo(requireNumber(options.chat, 'chat'));
  const payload = {
    id: info.id,
    name: info.name,
    protected: info.isProtected,
    archived: info.archived,
    pinned: info.pinned,
    muted: info.isMuted,
    canSend: info.canSend,
    selfInGroup: info.selfInGroup,
    freshMessages: info.freshMessageCounter,
    ephemeralTimer: info.ephemeralTimer,
    profileImage: info.profileImage,
    contactIds: info.contactIds,
    contacts: info.contacts.map((contact: any) => ({
      id: contact.id,
      name: contact.displayName || contact.name,
      address: contact.address,
      verified: contact.isVerified,
    })),
    mailingListAddress: info.mailingListAddress,
    encryptionInfo: info.encryptionInfo,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`#${payload.id} ${payload.name}`);
  console.log(`  protected=${payload.protected} archived=${payload.archived} pinned=${payload.pinned} muted=${payload.muted} canSend=${payload.canSend}`);
  console.log(`  selfInGroup=${payload.selfInGroup} fresh=${payload.freshMessages} ephemeralTimer=${payload.ephemeralTimer} profileImage=${payload.profileImage || '-'}`);
  console.log(`  members=${payload.contacts.length} mailingList=${payload.mailingListAddress || '-'}`);
  for (const contact of payload.contacts) {
    console.log(`  - ${contact.id} ${contact.name || '-'} <${contact.address}> verified=${contact.verified}`);
  }
  if (payload.encryptionInfo) {
    console.log('  encryption:');
    for (const line of String(payload.encryptionInfo).split('\n')) {
      if (line.trim()) {
        console.log(`    ${line}`);
      }
    }
  }
}

async function createGroup(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.name) {
    throw new Error('create-group requires --name NAME');
  }

  const info = await runtime.createGroup({
    name: options.name,
    protect: Boolean(options.protect),
    members: parseStringList(options.members),
  });

  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log(`created group ${info.id} "${info.name}" members=${info.contacts.length} protected=${info.isProtected}`);
}

async function renameChat(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.chat) {
    throw new Error('rename-chat requires --chat CHAT_ID');
  }
  if (!options.name) {
    throw new Error('rename-chat requires --name NAME');
  }

  const info = await runtime.renameChat(requireNumber(options.chat, 'chat'), options.name);
  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log(`renamed chat ${info.id} to "${info.name}"`);
}

async function leaveGroup(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.chat) {
    throw new Error('leave-group requires --chat CHAT_ID');
  }

  const result = await runtime.leaveGroup(requireNumber(options.chat, 'chat'));
  console.log(`left group ${result.chatId}`);
}

async function joinQr(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.qr) {
    throw new Error('join-qr requires --qr TEXT');
  }

  const result = await runtime.joinQr(options.qr);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`joined via QR kind=${result.kind} chat=${result.chatId}`);
}

async function showQr(runtime: DeltaChatRuntime, options: any): Promise<void> {
  const chatId = options.chat ? requireNumber(options.chat, 'chat') : null;
  const payload: any = await runtime.getSecureJoinQr(chatId, Boolean(options['svg-path']));

  if (options['svg-path']) {
    const svgPath = path.resolve(options['svg-path']);
    fs.writeFileSync(svgPath, payload.svg, 'utf8');
    payload.svgPath = svgPath;
    delete payload.svg;
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(payload.qr);
  if (payload.svgPath) {
    console.log(`svg=${payload.svgPath}`);
  }
}

async function createChat(runtime: DeltaChatRuntime, options: any): Promise<void> {
  if (!options.to) {
    throw new Error('create-chat requires --to EMAIL');
  }

  const chatId = await runtime.getOrCreateChatByEmail(options.to);
  console.log(chatId);
}

async function receiveMessages(runtime: DeltaChatRuntime, options: any): Promise<void> {
  const accountId = runtime.account.accountId;
  const markSeen = !options['no-mark-seen'];
  const maxCount = options.count ? requireNumber(options.count, 'count') : Number.POSITIVE_INFINITY;
  const timeoutSeconds = options.timeout ? requireNumber(options.timeout, 'timeout') : 0;
  const deadline = timeoutSeconds > 0 ? Date.now() + (timeoutSeconds * 1000) : Number.POSITIVE_INFINITY;
  let delivered = 0;

  while (delivered < maxCount && Date.now() < deadline) {
    const pendingMs = Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : null;
    const ids = pendingMs !== null
      ? await waitNextMsgsWithDeadline(runtime, pendingMs)
      : await runtime.client.rpc.waitNextMsgs(accountId);

    if (ids === null) {
      break;
    }

    for (const messageId of ids) {
      const message = await runtime.client.rpc.getMessage(accountId, messageId);
      const senderAddress = message && message.sender ? message.sender.address : null;
      if (!message || (!message.text && !message.file) || (
        senderAddress
        && senderAddress.toLowerCase() === runtime.account.email.toLowerCase()
      )) {
        continue;
      }

      if (markSeen) {
        await runtime.client.rpc.markseenMsgs(accountId, [messageId]);
      }

      const output = {
        id: message.id,
        chatId: message.chatId,
        timestamp: message.timestamp,
        sender: formatSender(message),
        senderAddress,
        text: message.text,
        file: message.file,
        fileName: message.fileName,
      };

      if (options.json) {
        console.log(JSON.stringify(output));
      } else {
        const attachment = output.fileName || output.file ? ` file=${output.fileName || output.file}` : '';
        console.log(`[${formatTimestamp(output.timestamp)}] chat=${output.chatId} msg=${output.id} from=${output.sender} <${output.senderAddress || '-'}> ${summarizeText(output.text || '')}${attachment}`);
      }

      delivered += 1;
      if (delivered >= maxCount) {
        return;
      }
    }
  }
}

async function waitNextMsgsWithDeadline(runtime: DeltaChatRuntime, timeoutMs: number): Promise<any[] | null> {
  if (timeoutMs <= 0) {
    return null;
  }

  return Promise.race([
    runtime.client.rpc.waitNextMsgs(runtime.account.accountId),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

async function showStatus(runtime: DeltaChatRuntime, options: any): Promise<void> {
  const transports = await runtime.client.rpc.listTransports(runtime.account.accountId);
  const payload = {
    accountId: runtime.account.accountId,
    email: runtime.account.email,
    configPath: runtime.runtimeConfig.configPath,
    transports: transports.map((transport: any) => ({
      addr: transport.addr,
      imapServer: transport.imapServer,
      smtpServer: transport.smtpServer,
    })),
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`account=${payload.email} accountId=${payload.accountId}`);
  console.log(`config=${payload.configPath}`);
  for (const transport of payload.transports) {
    console.log(`transport=${transport.addr} imap=${transport.imapServer || '-'} smtp=${transport.smtpServer || '-'}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];

  if (options.help || !command || command === 'help') {
    printHelp();
    return;
  }

  await withSession(options.config, async (runtime) => {
    switch (command) {
      case 'status':
        await showStatus(runtime, options);
        return;
      case 'list-chats':
        await listChats(runtime, options);
        return;
      case 'list-messages':
        await listMessages(runtime, options);
        return;
      case 'send':
        await sendMessage(runtime, options);
        return;
      case 'delete-messages':
        await deleteMessages(runtime, options);
        return;
      case 'set-profile':
        await setProfile(runtime, options);
        return;
      case 'save-attachment':
        await saveAttachment(runtime, options);
        return;
      case 'edit-message':
        await editMessage(runtime, options);
        return;
      case 'react':
        await reactToMessage(runtime, options);
        return;
      case 'chat-info':
        await showChatInfo(runtime, options);
        return;
      case 'create-group':
        await createGroup(runtime, options);
        return;
      case 'rename-chat':
        await renameChat(runtime, options);
        return;
      case 'leave-group':
        await leaveGroup(runtime, options);
        return;
      case 'join-qr':
        await joinQr(runtime, options);
        return;
      case 'show-qr':
        await showQr(runtime, options);
        return;
      case 'receive':
        await receiveMessages(runtime, options);
        return;
      case 'create-chat':
        await createChat(runtime, options);
        return;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
