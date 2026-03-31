#!/usr/bin/env node
/**
 * FIND DELTACHAT PASSWORD
 * Retrieve password from Delta Chat Desktop RPC server
 */

import { Server } from '@deltachat/jsonrpc-client';

const client = new Server({
  transport: 'stdio',
});

async function findPassword() {
  console.log('Connecting to Delta Chat RPC server...');

  try {
    // Wait for connection
    await client.getNextEventBatch();
    console.log('Connected!');

    // Get accounts
    const accounts = await client.getAllAccounts();
    console.log(`Found ${accounts.length} account(s)`);

    for (const account of accounts) {
      console.log(`\nAccount ${account.id}:`);
      console.log(`  Email: ${account.addr}`);

      // Get transports
      const transports = await client.listTransports(account.id);
      console.log(`  Transports: ${transports.length}`);

      for (const transport of transports) {
        console.log(`\n  Transport ${transport.addr}:`);
        console.log(`    Type: ${transport.transport_type}`);
        console.log(`    Is configured: ${transport.is_configured}`);

        // Note: Password is NOT exposed by Delta Chat API for security
        // You need to re-enter it if you want to configure it here
        console.log(`\n  ⚠️  Password is stored encrypted in Delta Chat, not accessible via API`);
        console.log(`     Please re-enter your app password for this email account.`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client = null;
  }
}

findPassword().catch(console.error);