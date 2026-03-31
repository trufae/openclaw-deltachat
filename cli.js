#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { DeltaChatRuntime, loadRuntimeConfig } = require('./runtime.js');

function printHelp() {
  console.log(`Delta Chat CLI

Usage:
  node cli.js status [--config PATH]
  node cli.js list-chats [--config PATH] [--json] [--limit N] [--query TEXT]
  node cli.js list-messages --chat CHAT_ID [--config PATH] [--json] [--limit N]
  node cli.js send (--chat CHAT_ID | --to EMAIL) [--text TEXT] [--file PATH] [--name NAME] [--config PATH]
  node cli.js delete-messages --chat CHAT_ID --ids ID[,ID...] [--for-all] [--config PATH]
  node cli.js receive [--config PATH] [--json] [--timeout SECONDS] [--count N] [--no-mark-seen]
  node cli.js create-chat --to EMAIL [--config PATH]

Examples:
  node cli.js list-chats
  node cli.js list-messages --chat 42 --limit 20
  node cli.js send --to friend@example.org --text "hello"
  node cli.js send --chat 42 --file ./photo.jpg --text "latest"
  node cli.js delete-messages --chat 42 --ids 101,102
  node cli.js receive --json
`);
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    if (key === 'help' || key === 'json' || key === 'no-mark-seen' || key === 'for-all') {
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

function requireNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function formatSender(message) {
  if (!message || !message.sender) {
    return '-';
  }

  return message.sender.displayName
    || message.sender.name
    || message.sender.address
    || String(message.fromId || '-');
}

function summarizeText(value, max = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function parseIdList(value, name) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error(`${name} must contain at least one message ID`);
  }

  return items.map((item) => requireNumber(item, name));
}

async function createSession(configPath) {
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

async function withSession(configPath, fn) {
  const runtime = await createSession(configPath);
  try {
    return await fn(runtime);
  } finally {
    await runtime.stop();
  }
}

async function listChats(runtime, options) {
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
  const chats = [];

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

async function listMessages(runtime, options) {
  if (!options.chat) {
    throw new Error('list-messages requires --chat CHAT_ID');
  }

  const accountId = runtime.account.accountId;
  const chatId = requireNumber(options.chat, 'chat');
  const limit = options.limit ? requireNumber(options.limit, 'limit') : 20;
  const chat = await runtime.client.rpc.getFullChatById(accountId, chatId);
  const messageIds = await runtime.client.rpc.getMessageIds(accountId, chatId, false, false);
  const selectedIds = messageIds.slice(0, limit);
  const messages = [];

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

async function sendMessage(runtime, options) {
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

  let filePath = null;
  let fileName = null;
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

async function deleteMessages(runtime, options) {
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

async function createChat(runtime, options) {
  if (!options.to) {
    throw new Error('create-chat requires --to EMAIL');
  }

  const chatId = await runtime.getOrCreateChatByEmail(options.to);
  console.log(chatId);
}

async function receiveMessages(runtime, options) {
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

async function waitNextMsgsWithDeadline(runtime, timeoutMs) {
  if (timeoutMs <= 0) {
    return null;
  }

  return Promise.race([
    runtime.client.rpc.waitNextMsgs(runtime.account.accountId),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

async function showStatus(runtime, options) {
  const transports = await runtime.client.rpc.listTransports(runtime.account.accountId);
  const payload = {
    accountId: runtime.account.accountId,
    email: runtime.account.email,
    configPath: runtime.runtimeConfig.configPath,
    transports: transports.map((transport) => ({
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

async function main() {
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
