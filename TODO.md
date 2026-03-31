# Delta Chat -- Roadmap & TODO

> Tracking planned features and API coverage for the CLI, library, and OpenClaw plugin.

---

## Implemented

### CLI Commands (`src/cli.ts` -> `dist/cli.js`)

- [x] `status`
- [x] `list-chats`
- [x] `list-messages`
- [x] `send`
- [x] `delete-messages`
- [x] `set-profile`
- [x] `save-attachment`
- [x] `edit-message`
- [x] `react`
- [x] `chat-info`
- [x] `create-group`
- [x] `rename-chat`
- [x] `leave-group`
- [x] `join-qr`
- [x] `show-qr`
- [x] `receive`
- [x] `create-chat`

### Library / Plugin

- [x] Send messages
- [x] Receive messages through the runtime listener
- [x] Create chats by email
- [x] Update local profile name/avatar
- [x] Save attachments
- [x] Edit sent messages
- [x] React to messages
- [x] Inspect chats
- [x] Create groups
- [x] Rename chats
- [x] Leave groups
- [x] Generate secure-join QR codes
- [x] Join QR-based secure-join flows

---

## High Priority

> Most useful next additions for day-to-day usage.

- [ ] `search-messages` -- full-text search across chats
- [ ] `list-contacts` -- list known contacts
- [ ] `create-contact` -- create a new contact entry
- [ ] `message-info` -- detailed info for a single message

---

## Chat Management

- [ ] Accept chats
- [ ] Block chats
- [ ] Delete chats
- [ ] Create broadcast lists
- [ ] Set group avatar
- [ ] Set chat visibility (pinned / archived)
- [ ] Set disappearing message timer
- [ ] Get disappearing message timer
- [ ] Mute / unmute chats
- [ ] Get similar chat IDs
- [ ] List chat members
- [ ] List past chat members
- [ ] Add contact to chat
- [ ] Remove contact from chat
- [ ] Mark chat noticed
- [ ] Get first unread message of chat

## Contact Management

- [ ] List contacts
- [ ] Get contact by ID
- [ ] Get contacts by IDs
- [ ] Create contact
- [ ] Rename contact
- [ ] Delete contact
- [ ] Block / unblock contact
- [ ] List blocked contacts
- [ ] Reset contact encryption
- [ ] Inspect contact encryption info
- [ ] Import vCard from file
- [ ] Import vCard contents
- [ ] Export vCard
- [ ] Set draft vCard

## Message Operations

- [ ] Search messages
- [ ] Load multiple messages in one call
- [ ] Get message HTML
- [ ] Get detailed message info / info object
- [ ] Get read receipts
- [ ] Forward messages
- [ ] Resend messages
- [ ] Get reactions
- [ ] Save messages
- [ ] Download full message
- [ ] Send quoted replies
- [ ] Send locations
- [ ] Send stickers
- [ ] Send via raw `sendMsg`
- [ ] Get fresh / unread message counts
- [ ] Get message list items
- [ ] Convert search results to detailed output

## Drafts

- [ ] Set draft
- [ ] Send draft
- [ ] Get draft
- [ ] Remove draft

## Media & Files

- [ ] Browse chat media by type
- [ ] Better attachment metadata output
- [ ] Download attachment helper
- [ ] Sticker folder / list / save commands

## QR / Secure Join

- [ ] Check QR
- [ ] Set config from QR
- [ ] Add transport from QR

## Account & Configuration

- [ ] List accounts
- [ ] Select account
- [ ] Remove account
- [ ] Configure account
- [ ] List transports
- [ ] Delete transport
- [ ] Stop ongoing process
- [ ] Get provider info
- [ ] Get account info / file size
- [ ] Get selected account / all account IDs
- [ ] Get / set raw config value
- [ ] Batch get / set config
- [ ] Validate email

## Backup & Key Management

- [ ] Export / import backup
- [ ] Provide backup
- [ ] Get backup QR / QR SVG
- [ ] Receive backup from QR
- [ ] Export / import self keys
- [ ] Initiate Autocrypt key transfer
- [ ] Continue Autocrypt key transfer

## Connectivity & Maintenance

- [ ] Manual background fetch
- [ ] Start / stop IO for all accounts
- [ ] Network poke / `maybeNetwork`
- [ ] Get connectivity state / HTML
- [ ] Estimate auto-deletion count

## Webxdc

- [ ] Initialize Webxdc integration
- [ ] Set Webxdc integration
- [ ] Get Webxdc info / href / blob
- [ ] Get Webxdc status updates
- [ ] Send Webxdc status update
- [ ] Send Webxdc realtime data / advertisement
- [ ] Leave Webxdc realtime

## Diagnostics & Developer Utilities

- [ ] Get system info
- [ ] Get account info dump
- [ ] Draft self-report
- [ ] Raw RPC helper for debugging

---

## Library API Gaps

The runtime/plugin should eventually expose wrappers for:

- [ ] Contact CRUD
- [ ] Chat CRUD and group membership management
- [ ] QR / secure-join flows
- [ ] Backup / key import-export
- [ ] Connectivity / diagnostics

---

## Design Guidelines

1. **Build on the runtime** -- implement new CLI commands on top of `src/runtime.ts` methods instead of embedding RPC calls directly in `src/cli.ts`.
2. **Human-readable by default** -- add `--json` flags where structured output is useful.
3. **Explicit destructive flags** -- use `--for-all`, confirmation arguments, or similar guards for irreversible operations.
