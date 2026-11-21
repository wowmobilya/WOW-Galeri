# Chat and personal files

The native `chat` and `files` sections use the shared Mark Robot navigation, its current color theme, five languages and the signed-in WOW account. The backend owns messages, membership, private room state, folder metadata and file ownership. Neither module reads the former Galeri.TR project.

## Release integration

1. Install the base WOW schema and then `supabase/modules/files.sql` and `supabase/modules/chat.sql` on the same authorized project. The files script extends the MIME allowlist of the existing private `wow-files` bucket. The limits enforced by these modules are 8 MiB per object, 256 MiB per person and 2 GiB per workspace per module. My Files displays the application's personal allowance and actual usage.
2. Register `createChatActions({moduleRpc,storage})` and `createFilesActions({moduleRpc,storage})` in the verified Edge dispatcher. Both use its fixed RPC allowlist and private storage adapter. The client only receives short-lived signing results after object access checks. The SQL RPCs and push eligibility function grant execution only to the service role.
3. Load `modules/platform/delta.js`, `modules/files/core.js` and `modules/chat/core.js` before the two workspace scripts. Both workspace scripts register with `WFModules`. Load the files stylesheet for shared collaboration controls and the chat stylesheet for the conversation layout. A message notification opens `WFModules.open('chat',{roomId})` after validating the UUID and active account.
4. The platform cache binds private copies and pending commands to the workspace, account and session epoch. It supplies `api.request`, `api.localFiles`, `api.listOutbox`, `api.subscribeReceipts`, `api.subscribeConnection` and `api.syncNow`. A successful file download may persist its bytes through the scoped localFiles adapter. A signed URL is never an offline file. Cached messages are rendered with their server expiration times. An offline read can only know the most recently verified access state. A denied network read invalidates that private view.

In Accounts and permissions, the owner selects **Customer** for a purchaser. For a known purchaser who previously used a **Custom** staff account, change that account’s role to **Customer**. This revokes its previous sessions. On the next sign-in, the purchaser can browse the published gallery, place personal orders, message the owner, and manage personal files. Team rooms, staff groups and employee conversations require a staff role.

**My files → Export and share** grants explicit downloads, multi-file ZIPs and five-minute bearer links. With **View** alone, the account can list its own files and preview its images, audio, videos and PDFs. Download-only formats require the export grant.

## Reads, changes and interrupted operations

| Operation | Behavior |
| --- | --- |
| Chat rooms, current/history page, My Files listing | Each request runs SQL access checks, computes the current authorized projection and accepts an optional `_known` map. The response carries the complete initial page or only changed rows, removed IDs, new ordering and changed metadata. An unchanged response carries a revision marker. The client calls `WFModuleDelta.applyDelta(previous,response)` and retries a full read on `STALE_DELTA`. Sorting, filters, search, room and pagination belong to the local cache key. |
| Send or forward a message | `chat.send` and `chat.forward` use an author-scoped UUID `requestId`. A replay returns the original server message ID. A reused key with different contents fails. Room membership, forward visibility, reply scope, mentions and expiration are checked inside the transaction. |
| Send a voice note or media | Queue `chat.sendFile` as one command containing the same UUID, filename, MIME, base64 bytes, text and optional reply. It reserves an immutable object, writes its content, and rechecks the room before the final message command. A full retry converges on the same upload and message. |
| Upload a personal file | `files.upload` uses a separate per-owner request UUID. The server validates the bytes, computes SHA-256, reserves quota, writes the server-issued path, then marks metadata ready. Only ready files appear in the listing. The UI distinguishes a durable local queue acknowledgement from a server-accepted upload. |
| Mutate existing records | Folder and file changes validate every selected ID inside one SQL transaction. Deleting a folder moves its files to Without folder. Chat moderation requires current room powers in addition to the app permission. Initial group membership, team membership, direct access to the real owner, bans, unbans, stars, personal hides, drafts and read cursors are stored separately from business sync. |
| Cleanup | File deletion immediately prevents further signing. Tombstones permit Storage deletion to retry on the next authorized cleanup. Chat cleanup removes expired contents and unreferenced assets, preserving live forwarded copies. Unfinished reservations have a one-day grace period. Existing signed downloads expire within 60 seconds, or earlier if the message expires sooner. Explicit My Files sharing issues a five-minute bearer link. |

Each user's outgoing disappearing-message preference applies to newly sent messages. Forwarded copies retain the earlier applicable expiration. Ordinary members can edit their own messages for 30 minutes and delete them for everyone for 60 minutes. Room owners and moderators can remove messages in their room. Private hiding removes the message from the viewer’s feed, searches, replies, forwards, download authorization and notification eligibility.

## Push boundary

Sending and forwarding insert member-specific rows into `wow_collab.chat_notifications` inside the same transaction. The primary key is `(message_id,recipient_id)`. Rows contain IDs and a timestamp. The private push bridge binds the job to a device belonging to the exact recipient. It calls `public.wow_chat_push_allowed(workspace_id,recipient_id,room_id,message_id)` immediately before dispatch. Revoked or unreadable rooms, muted members, read, hidden and expired messages are ineligible. The payload can use generic localized text and the two navigation IDs. Financial subscriptions and financial event authorization retain their separate owner checks.

## Local verification

Run `node --test tests/chat-files-*.test.mjs tests/customer-access.test.mjs` from the repository root with the existing Supabase test dependencies installed. These tests execute the real SQL on PostgreSQL WASM with local provider fixtures. They exercise owner provisioning, the upgrade of existing roles, purchaser isolation, mounted file preview and export controls, session revocation, bans and unbans, mute-aware outbox insertion, duplicate sends and uploads, cross-room replies and forwards, stale permission reads, personal hides, message expiration, native ZIP output and incremental page reconciliation.

Live provider delivery, original private data import, installed-device playback, clipboard/native shares, offline reconciliation on target devices and the final production origin require their respective integration checks.
