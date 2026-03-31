#!/usr/bin/env node
/**
 * TEST DELTACHAT RPC CONNECTION (STDIO)
 */

import { RawClient } from '@deltachat/jsonrpc-client';

async function testConnection() {
  console.log('Testing Delta Chat RPC connection via stdio...');

  try {
    const client = new RawClient({
      transport: 'stdio',
    });

    console.log('✓ Client created with RawClient');

    // Wait for initial connection
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('✓ Connected');

    // Get next event
    const event = await client.getNextEvent();
    console.log(`✓ Received event: ${JSON.stringify(event)}`);

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
    console.error(error.stack);
    process.exit(1);
  }
}

testConnection();