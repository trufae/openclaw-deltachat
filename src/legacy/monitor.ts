#!/usr/bin/env node
/**
 * DELTACHAT MONITOR
 * Manages Delta Chat RPC server lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import { StdioTransport, RawClient } from '@deltachat/jsonrpc-client';

export class DeltaChatMonitor {
  private rpcProcess: ChildProcess | null = null;
  private rpcClient: RawClient | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private isConnected = false;

  public async start(): Promise<void> {
    console.log('[DeltaChat] Starting RPC server...');

    // Start Python deltachat-rpc-server
    this.rpcProcess = spawn('~/.venv/deltachat/bin/deltachat-rpc-server', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    this.setupProcessListeners();

    // Wait for RPC server to be ready
    await this.waitForConnection();
  }

  public async stop(): Promise<void> {
    console.log('[DeltaChat] Stopping RPC server...');

    if (this.rpcProcess) {
      this.rpcProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    this.rpcProcess = null;
    this.isConnected = false;
    console.log('[DeltaChat] RPC server stopped');
  }

  public async restart(): Promise<void> {
    console.log('[DeltaChat] Restarting RPC server...');
    await this.stop();
    await this.start();
    this.reconnectAttempts = 0;
  }

  public isRunning(): boolean {
    return this.isConnected && this.rpcProcess?.pid !== null;
  }

  private async waitForConnection(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Create RPC client with stdio transport
        this.rpcClient = new RawClient({
          transport: 'stdio',
        });

        // Check if server is responsive
        await this.rpcClient.getNextEvent();

        this.isConnected = true;
        console.log('[DeltaChat] RPC server connected');
        return;
      } catch (error) {
        console.log('[DeltaChat] Waiting for RPC server...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error('[DeltaChat] Failed to connect to RPC server within timeout');
  }

  private setupProcessListeners(): void {
    if (!this.rpcProcess) return;

    this.rpcProcess.stdout?.on('data', (data) => {
      console.log(`[DeltaChat] RPC: ${data.toString().trim()}`);
    });

    this.rpcProcess.stderr?.on('data', (data) => {
      console.error(`[DeltaChat] RPC ERROR: ${data.toString().trim()}`);
    });

    this.rpcProcess.on('error', (error) => {
      console.error('[DeltaChat] RPC process error:', error);
      this.reconnect();
    });

    this.rpcProcess.on('exit', (code) => {
      console.log(`[DeltaChat] RPC process exited with code ${code}`);
      if (this.isConnected) {
        this.isConnected = false;
        this.reconnect();
      }
    });
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[DeltaChat] Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`[DeltaChat] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.restart().catch((error) => {
        console.error('[DeltaChat] Reconnection failed:', error);
      });
    }, delay);
  }

  public getRpcClient(): RawClient | null {
    return this.rpcClient;
  }
}

export default DeltaChatMonitor;