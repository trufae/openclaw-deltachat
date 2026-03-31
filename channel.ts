#!/usr/bin/env node
/**
 * DELTACHAT CHANNEL
 * OpenClaw Delta Chat channel plugin
 * Handles incoming and outgoing messages via Delta Chat
 */

import DeltaChatMonitor from './monitor';
import DeltaChatSender from './send';
import { Server } from '@deltachat/jsonrpc-client';

interface Config {
  accounts: Array<{
    email: string;
    mail_pw: string;
    data_dir: string;
    account_id: number;
  }>;
  rpc: {
    port: number;
    host: string;
  };
}

interface DeltaChatMessage {
  chatId: number;
  text: string;
  from: string;
  fromName: string;
  timestamp: number;
  messageId: number;
}

export interface DeltaChatChannelConfig {
  enabled: boolean;
  dmPolicy: 'allowlist' | 'pairing';
  groupPolicy: 'allowlist' | 'deny';
  allowlist?: string[];
  email?: string;
  password?: string;
}

export class DeltaChatChannel {
  private monitor: DeltaChatMonitor;
  private sender: DeltaChatSender;
  private client: Server | null = null;
  private config: Config;
  private channelConfig: DeltaChatChannelConfig;
  private lastProcessedMsgId: Map<number, number> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: Config, channelConfig: DeltaChatChannelConfig) {
    this.config = config;
    this.channelConfig = channelConfig;
    this.monitor = new DeltaChatMonitor(config);
    this.sender = new DeltaChatSender(config);
  }

  /**
   * Initialize the channel
   */
  public async init(): Promise<void> {
    console.log('[DeltaChatChannel] Initializing...');

    // Start RPC server
    await this.monitor.start();

    // Connect to Delta Chat
    await this.sender.connect();

    // Start listening for messages
    await this.startListening();

    console.log('[DeltaChatChannel] Initialized and listening');
  }

  /**
   * Start listening for messages
   */
  private async startListening(): Promise<void> {
    console.log('[DeltaChatChannel] Starting message listener...');

    while (this.monitor.isRunning()) {
      try {
        // Get next batch of messages
        const messages = await this.client?.getNextMsgBatch();

        if (!messages) continue;

        // Process each message
        for (const event of messages) {
          if (event.type === 'DC_EVENT_MSGS_CHANGED') {
            await this.handleNewMessages();
          }
        }
      } catch (error) {
        console.error('[DeltaChatChannel] Error processing messages:', error);

        // Reconnect if connection lost
        if (!this.sender.isConnected()) {
          console.log('[DeltaChatChannel] Reconnecting...');
          await this.monitor.restart();
          await this.sender.connect();
          await this.startListening();
          return;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Handle new messages
   */
  private async handleNewMessages(): Promise<void> {
    if (!this.client) return;

    const accounts = this.monitor.getAccounts();

    for (const account of accounts) {
      // Get chat list to find chats with unread messages
      const chats = await this.client.getChatlistEntries(
        account.account_id,
        null,
        null,
        null
      );

      for (const chat of chats) {
        // Get messages from chat
        const messageIds = await this.client.getMessageIds(
          account.account_id,
          chat.id,
          false,
          false
        );

        // Get fresh messages
        const freshMsgs = await this.client.getFreshMsgs(account.account_id);

        for (const msgId of freshMsgs) {
          // Skip if already processed
          const lastId = this.lastProcessedMsgId.get(chat.id) || 0;
          if (msgId <= lastId) continue;

          const message = await this.client.getMessage(account.account_id, msgId);

          // Check if message is from self
          if (message.from.id === DC_CONTACT_ID_SELF) {
            continue;
          }

          // Process message
          await this.processMessage(account.account_id, message);
        }

        // Update last processed message ID
        if (messageIds.length > 0) {
          this.lastProcessedMsgId.set(chat.id, messageIds[0]);
        }
      }
    }
  }

  /**
   * Process incoming message
   */
  private async processMessage(
    accountId: number,
    message: any
  ): Promise<void> {
    if (!this.client) return;

    const chat = await this.client.getFullChatById(accountId, message.chat_id);

    // Check if chat is blocked
    if (chat.is_blocked) {
      console.log(`[DeltaChatChannel] Chat blocked, skipping message from ${message.from.name}`);
      return;
    }

    // Create message object
    const deltaMessage: DeltaChatMessage = {
      chatId: message.chat_id,
      text: message.text,
      from: message.from.addr,
      fromName: message.from.name,
      timestamp: message.timestamp,
      messageId: message.id,
    };

    console.log(`[DeltaChatChannel] Received from ${deltaMessage.fromName}: ${deltaMessage.text}`);

    // Notify OpenClaw about new message
    await this.notifyOpenClaw(deltaMessage);

    // Send automatic reply if configured
    if (this.channelConfig.email && deltaMessage.from !== this.channelConfig.email) {
      await this.sendResponse(deltaMessage);
    }
  }

  /**
   * Notify OpenClaw about new message
   */
  private async notifyOpenClaw(message: DeltaChatMessage): Promise<void> {
    // Emit event to OpenClaw gateway
    // This would typically use OpenClaw's event system
    console.log(`[DeltaChatChannel] -> OpenClaw: ${message.text}`);

    // TODO: Implement OpenClaw event emission
    // This depends on OpenClaw's channel plugin API
  }

  /**
   * Send response message
   */
  public async sendResponse(message: DeltaChatMessage, replyText: string): Promise<number> {
    if (!this.sender.isConnected()) {
      await this.sender.connect();
    }

    console.log(`[DeltaChatChannel] Sending response: ${replyText}`);

    // Use existing chat or create new one
    let chatId = message.chatId;

    if (!chatId) {
      chatId = await this.sender.getChatIdByContact(message.from);
    }

    const messageId = await this.sender.sendMessage({
      chatId,
      text: replyText,
    });

    return messageId;
  }

  /**
   * Send message to specific chat
   */
  public async sendMessage(
    chatId: number,
    text: string
  ): Promise<number> {
    if (!this.sender.isConnected()) {
      await this.sender.connect();
    }

    return await this.sender.sendMessage({ chatId, text });
  }

  /**
   * Create new chat
   */
  public async createChat(contactEmail: string): Promise<number> {
    if (!this.sender.isConnected()) {
      await this.sender.connect();
    }

    return await this.sender.createChat(contactEmail);
  }

  /**
   * Get chat list
   */
  public async getChatList(): Promise<any[]> {
    if (!this.client) {
      await this.monitor.start();
      await this.sender.connect();
    }

    const chats = [];
    const accounts = this.monitor.getAccounts();

    for (const account of accounts) {
      const accountChats = await this.client.getChatlistEntries(
        account.account_id,
        null,
        null,
        null
      );

      chats.push(...accountChats);
    }

    return chats;
  }

  /**
   * Stop the channel
   */
  public async stop(): Promise<void> {
    console.log('[DeltaChatChannel] Stopping...');

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    await this.sender.disconnect();
    await this.monitor.stop();

    console.log('[DeltaChatChannel] Stopped');
  }

  /**
   * Check if channel is running
   */
  public isRunning(): boolean {
    return this.monitor.isRunning() && this.sender.isConnected();
  }
}

// Define DC constants
const DC_CONTACT_ID_SELF = 0;

// Export for use in other modules
export default DeltaChatChannel;