# Delta Chat CLI / Library TODO

## Current coverage

Source lives in `src/` and generated JavaScript is emitted to `dist/` via `tsc`.

Implemented in the CLI (`src/cli.ts` -> `dist/cli.js`):

- `status`
- `list-chats`
- `list-messages`
- `send`
- `delete-messages`
- `set-profile`
- `save-attachment`
- `edit-message`
- `react`
- `chat-info`
- `create-group`
- `rename-chat`
- `leave-group`
- `join-qr`
- `show-qr`
- `receive`
- `create-chat`

Implemented in the library/plugin:

- send messages
- receive messages through the runtime listener
- create chats by email
- update local profile name/avatar
- save attachments
- edit sent messages
- react to messages
- inspect chats
- create groups
- rename chats
- leave groups
- generate secure-join QR codes
- join QR-based secure-join flows

## High-priority missing features

These are the most useful next additions for day-to-day usage:

- `search-messages`
- `list-contacts`
- `create-contact`
- `message-info`

## Chat management

- accept chats
- block chats
- delete chats
- create broadcast lists
- set group avatar
- set chat visibility
- set disappearing message timer
- get disappearing message timer
- mute/unmute chats
- get similar chat IDs
- list chat members
- list past chat members
- add contact to chat
- remove contact from chat
- mark chat noticed
- get first unread message of chat

## Contact management

- list contacts
- get contact by ID
- get contacts by IDs
- create contact
- rename contact
- delete contact
- block contact
- unblock contact
- list blocked contacts
- reset contact encryption
- inspect contact encryption info
- import vCard from file
- import vCard contents
- export vCard
- set draft vCard

## Message operations

- search messages
- load multiple messages in one call
- get message HTML
- get detailed message info
- get message info object
- get read receipts
- forward messages
- resend messages
- get reactions
- save messages
- download full message
- send quoted replies
- send locations
- send stickers
- send via raw `sendMsg`
- get fresh/unread message counts
- get message list items
- convert search results to detailed output

## Drafts

- set draft
- send draft
- get draft
- remove draft

## Media and files

- browse chat media by type
- better attachment metadata output
- download attachment helper
- sticker folder/list/save commands

## QR / secure join

- check QR
- set config from QR
- add transport from QR

## Account and configuration

- list accounts
- select account
- remove account
- configure account
- list transports
- delete transport
- stop ongoing process
- get provider info
- get account info
- get account file size
- get selected account
- get all account IDs
- get raw config value
- set raw config value
- batch get config
- batch set config
- validate email

## Backup and key management

- export backup
- import backup
- provide backup
- get backup QR
- get backup QR SVG
- receive backup from QR
- export self keys
- import self keys
- initiate Autocrypt key transfer
- continue Autocrypt key transfer

## Connectivity and maintenance

- manual background fetch
- start IO for all accounts
- stop IO for all accounts
- network poke / `maybeNetwork`
- get connectivity state
- get connectivity HTML
- estimate auto-deletion count

## Webxdc

- initialize Webxdc integration
- set Webxdc integration
- get Webxdc info
- get Webxdc href
- get Webxdc blob
- get Webxdc status updates
- send Webxdc status update
- send Webxdc realtime data
- send Webxdc realtime advertisement
- leave Webxdc realtime

## Diagnostics and developer utilities

- get system info
- get account info dump
- draft self-report
- raw RPC helper for debugging

## Library API gaps

The runtime/plugin should eventually expose wrappers for:

- contact CRUD
- chat CRUD and group membership management
- QR / secure-join flows
- backup / key import-export
- connectivity / diagnostics

## Notes

- Prefer implementing new CLI commands on top of `src/runtime.ts` methods instead of embedding all RPC calls directly in `src/cli.ts`.
- Keep command output human-readable by default and add `--json` where structured output matters.
- For destructive operations, consider explicit flags such as `--for-all` or confirmation-like argument requirements.
