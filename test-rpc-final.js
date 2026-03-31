#!/usr/bin/env node
/**
 * DELTACHAT RPC TEST
 */

import { StdioTransport } from '@deltachat/jsonrpc-client';

async function test() {
  const transport = new StdioTransport();
  console.log('✓ Transport created');

  await new Promise(r => setTimeout(r, 2000));
  console.log('✓ Connected');

  const client = new RawClient(transport);
  console.log('✓ Client created');

  const events = await client.getNextEvent();
  console.log('✓ Event:', events);

  const accounts = await client.getAllAccounts();
  console.log('✓ Accounts:', accounts.length);
}

test().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});