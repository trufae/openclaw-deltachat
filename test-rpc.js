#!/usr/bin/env node
/**
 * TEST DELTACHAT RPC CONNECTION
 */

import { Server } from '@deltachat/jsonrpc-client';

async function testConnection() {
  console.log('Testing Delta Chat RPC connection...');

  try {
    const client = new Server({
      transport: 'stdio',
    });

    console.log('✓ Client created');

    // Wait for initial connection
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('✓ Connected (waited 2s)');

    // Get next event to verify connection
    const events = await client.getNextEventBatch();
    console.log(`✓ Received ${events.length} event(s)`);

    // Try to get accounts
    const accounts = await client.getAllAccounts();
    console.log(`✓ Found ${accounts.length} account(s)`);

    for (const account of accounts) {
      console.log(`\nAccount ${account.id}:`);
      console.log(`  Email: ${account.addr}`);

      // Try to get transports
      try {
        const transports = await client.listTransports(account.id);
        console.log(`  Transports: ${transports.length}`);
      } catch (e) {
        console.log(`  Transports error: ${e.message}`);
      }
    }

    console.log('\n✅ SUCCESS: Delta Chat RPC is working!');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

testConnection();