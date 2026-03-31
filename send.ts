#!/usr/bin/env node
/**
 * DELTACHAT SEND
 * Handles message sending via Delta Chat
 */

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

export interface SendMessageOptions {
  chatId?: number;
  text: string;
  file?: string;
  filename?: string;
}

export class DeltaChatSender {
  private client: Server | null = null;
  private selectedAccountId: number;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.selectedAccountId = config.accounts[0]?.account_id || 1;
  }

  /**
   * Connect to Delta Chat RPC server
   */
  public async connect(): Promise<void> {
    console.log('[DeltaChatSender] Connecting to RPC server...');

    this.client = new Server({
      transport: 'stdio',
    });

    // Wait for connection
    await this.client.getNextEventBatch();

    console.log('[DeltaChatSender] Connected to Delta Chat');
  }

  /**
   * Send text message
   */
  public async sendMessage(options: SendMessageOptions): Promise<number> {
    if (!this.client) {
      await this.connect();
    }

    const { chatId, text, file, filename } = options;

    if (!chatId) {
      throw new Error('[DeltaChatSender] chatId is required');
    }

    console.log(`[DeltaChatSender] Sending message to chat ${chatId}: ${text}`);

    // Send message using Delta Chat RPC
    const messageId = await this.client.miscSendMsg(this.selectedAccountId, chatId, {
      text: text,
      file: file || null,
      filename: filename || null,
    });

    console.log(`[DeltaChatSender] Message sent with ID: ${messageId}`);
    return messageId;
  }

  /**
   * Create new chat with contact
   */
  public async createChat(contactEmail: string): Promise<number> {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[DeltaChatSender] Creating chat with ${contactEmail}`);

    // Look up or create contact
    const contactId = await this.client.lookupContactIdByAddr(
      this.selectedAccountId,
      contactEmail
    );

    if (!contactId) {
      throw new Error(`[DeltaChatSender] Could not find or create contact for ${contactEmail}`);
    }

    // Get or create chat
    const chatId = await this.client.createChatByContactId(
      this.selectedAccountId,
      contactId
    );

    console.log(`[DeltaChatSender] Chat created/selected with ID: ${chatId}`);
    return chatId;
  }

  /**
   * Get chat ID by contact email
   */
  public async getChatIdByContact(contactEmail: string): Promise<number> {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[DeltaChatSender] Looking up chat for ${contactEmail}`);

    const contactId = await this.client.lookupContactIdByAddr(
      this.selectedAccountId,
      contactEmail
    );

    if (!contactId) {
      throw new Error(`[DeltaChatSender] Contact not found: ${contactEmail}`);
    }

    const chatId = await this.client.getChatIdByContactId(
      this.selectedAccountId,
      contactId
    );

    if (!chatId) {
      throw new Error(`[DeltaChatSender] Chat not found for contact: ${contactEmail}`);
    }

    console.log(`[DeltaChatSender] Chat ID: ${chatId}`);
    return chatId;
  }

  /**
   * Send message as reply to existing message
   */
  public async replyToMessage(
    messageId: number,
    text: string
  ): Promise<number> {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[DeltaChatSender] Replying to message ${messageId}`);

    // Get message info
    const message = await this.client.getMessage(this.selectedAccountId, messageId);

    const chatId = message.chat_id;

    return await this.sendMessage({ chatId, text });
  }

  /**
   * Send emoji reaction
   */
  public async sendReaction(
    messageId: number,
    reaction: string[]
  ): Promise<void> {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[DeltaChatSender] Sending reaction: ${reaction.join(',')} to message ${messageId}`);

    await this.client.sendReaction(this.selectedAccountId, messageId, reaction);
  }

  /**
   * Create group chat
   */
  public async createGroupChat(name: string): Promise<number> {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[DeltaChatSender] Creating group chat: ${name}`);

    const chatId = await this.client.createGroupChat(
      this.selectedAccountId,
      name,
      false
    );

    console.log(`[DeltaChatSender] Group chat created with ID: ${chatId}`);
    return chatId;
  }

  /**
   * Add member to group chat
   */
  public async addMemberToChat(chatId: number, contactEmail: string): Promise<void> {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[DeltaChatSender] Adding ${contactEmail} to chat ${chatId}`);

    const contactId = await this.client.lookupContactIdByAddr(
      this.selectedAccountId,
      contactEmail
    );

    if (!contactId) {
      throw new Error(`[DeltaChatSender] Contact not found: ${contactEmail}`);
    }

    await this.client.addContactToChat(this.selectedAccountId, chatId, contactId);
    console.log(`[DeltaChatSender] Member added`);
  }

  /**
   * Disconnect
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      this.client = null;
      console.log('[DeltaChatSender] Disconnected');
    }
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Get selected account ID
   */
  public getSelectedAccountId(): number {
    return this.selectedAccountId;
  }
}

// Export for use in other modules
export default DeltaChatSender;