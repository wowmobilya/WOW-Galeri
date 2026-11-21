# Prepared WOW cloud synchronization contract

Status: source prepared on `feat/wow-cloud-211`; this document does not establish
that the backend exists or that this code has been deployed. Work was paused
when the user narrowed the active request to removing Masarifi components.

## Module and integration

`modules/platform/cloud/wow-cloud-sync.js` exports `WFCloudSync` in the browser and a CommonJS API in
tests. The integration owns the active business database and supplies a verified
`WFCloud` client. The module itself never chooses an alternate owner database or
falls back from a remote employee session to local owner access.

```js
WFCloudSync.upgrade(connection); // Called in IndexedDB onupgradeneeded.

const engine = WFCloudSync.create({
  getDB: () => initDB(),
  client: window.WFCloud,
  onRemoteCommit: ({stores, changes}) => refreshCommittedViews(stores, changes),
  onStatus: snapshot => renderSyncStatus(snapshot)
});

await engine.start({
  seedExisting: !remoteEmployeeMode,
  initialPull: remoteEmployeeMode
});
```

The three additional object stores use `keyPath: 'id'`:

- `wf_cloud_outbox`: immutable queued batch payloads, order and blocked status.
- `wf_cloud_meta`: verified database binding, device identifier, pull cursor,
  per-record revisions and pending batch identifiers, and the runner lease.
- `wf_cloud_conflicts`: active conflicts and preserved resolution history.

The six synchronized business stores are `companies`, `products`, `invoices`,
`payments`, `settings`, and `media`. An owner's existing local database is seeded
before the first pull. Seed batches are bounded; the seed marker and queued
records commit atomically. A failed seed leaves the original records intact and
blocks network synchronization with `BOOTSTRAP_INCOMPLETE` until a retry succeeds.
The caller may retain read access to the existing local application after a seed
error; it must not bypass this gate and pull into unqueued owner data.

Owner startup reads the durable binding without waiting for cloud authentication
or network refresh. A verification event that arrives during that initial read
causes attachment after the read finishes. An existing local binding remains
usable for capturing edits when authentication is absent or a different cloud
account is signed in. It cannot send those edits under the other account.

Remote startup requires an authenticated first pull. The selected database name
is checked against the client's verified `cacheName()` when that method exists.

## Atomic write hook

```js
const stores = engine.writeStores(businessStores);
const tx = db.transaction(stores, 'readwrite');

// Perform the real application writes. Capture final values after merges,
// permission checks and image dehydration, including any generated media rows.
engine.enqueue(tx, finalOperations, {
  onError(error) { failure = error; },
  onQueued(batchId) { /* The outbox put succeeded; the tx is not committed yet. */ }
});

// Run only from the successful original transaction's oncomplete callback.
engine.afterCommit();
```

`enqueue` schedules IndexedDB requests synchronously while the existing
transaction is active. It never performs network work inside that transaction.
Validation and persistence failures abort the entire transaction. A missing
binding leaves the ordinary local write path unchanged.

Each final operation is `{store, id, kind: 'put', value}` or
`{store, id, kind: 'delete'}`. The compatibility form `type: 'delete'` is accepted,
and a put can take its identifier from `value.id`. Numeric and string identifiers
remain distinct. Repeated operations for one typed identifier use its last final
transaction value. Every unique operation records its expected server revision,
including earlier pending updates to that same record.

There is a maximum of 100 unique records in an original atomic batch. Larger
batches fail with `SYNC_BATCH_TOO_LARGE` before any local part commits. This limit
matches the agreed server contract; splitting a financial transaction implicitly
would change its atomic behavior.

Direct backup restore and bulk database replacement must stay gated while the
database is linked unless an explicit reconciliation workflow is provided.

## Transport contract

The client supplies `request(action, payload, {authenticated: true})` and returns
the parsed successful response. Failed responses throw an error with `code`,
`status`, and a `conflicts` array when supplied by the server.

| Action | Request | Response |
| --- | --- | --- |
| `sync.push` | `{batchId, deviceId, operations:[{store,id,kind,baseRevision,value?}]}` | `{ok:true,batchId,changes,commitRevision}` |
| `sync.pull` | `{cursor,limit:100}` | `{ok:true,changes,cursor,hasMore}` |
| `sync.inspect` | Owner only: `{records:[{store,id}]}`; at most 100 | `{ok:true,changes}` including absent records as revision zero tombstones |
| `media.upload` | `{id,data,kind,size,updatedAt}`; data is an image data URL | `{ok:true,record:{id,storagePath,kind,size,updatedAt}}` |
| `media.download` | `{id,storagePath}` | `{ok:true,url,contentType,...}` with a short-lived signed URL |

A change is `{store,id,revision,deleted,value?}`. Each record revision increases
by exactly one for a unique committed operation. The global pull cursor is
independent: a push acknowledgement never advances it. The backend must authorize
the full batch, validate all expected revisions, and commit it atomically. A
repeated `batchId` must return its original result without repeating effects.

Media object paths are immutable. The server verifies the requested media path
against the permitted record and returns `MEDIA_REVISION_MISMATCH` if it changed.
Such a mismatch leaves the pull cursor unchanged so a later pull can retrieve a
coherent version. Uploaded bytes do not enter the server's JSON record rows.
Images support PNG, JPEG, WebP, GIF, AVIF and SVG up to 8 MiB. Media-store Blobs are
converted to data URLs explicitly. Unsupported binary values remain blocked and
exportable; they are not omitted silently.

## Queue and conflict behavior

Pushes are debounced after commits. One runner uses a database lease for the
bound scope; requests are also single flight within the page. Work pauses while
hidden or offline. Visible pulls poll every 30 seconds, with bounded retries and
backoff for transient failures. No interval loop runs in the background.

Pull transactions recheck record metadata immediately before applying data.
They do not overwrite a record with pending local work. Tombstones retain their
server revisions. Signing out during an asynchronous media download cancels its
pending application to the cache. Remote authorization failure locks the remote
session; local owner authentication loss retains its original outbox binding.

CAS conflicts and deterministic failures such as duplicate invoice numbers,
invalid records and oversized data stay in the outbox for review. They do not
retry the same invalid head batch indefinitely. Transient network and server
failures retain retry behavior.

The owner can explicitly resolve a connected group of dependent batches:

```js
await engine.resolveConflict(batchId, {strategy: 'local'});
await engine.resolveConflict(batchId, {strategy: 'server'});
const preserved = await engine.exportConflict(batchId);
```

Both choices inspect fresh authoritative server records first and abort with
`SYNC_QUEUE_CHANGED` if a local edit arrives during verification. The group
includes whole batches connected by shared record identifiers, preserving
multi-record transaction relationships. Original batches are archived before
any replacement or removal.

The local choice squashes that group to its final per-record values, with fresh
CAS revisions and a new batch identifier. This applies a later owner correction
instead of retrying an older invalid invoice value. It never generates a new
invoice number. Local resolution groups larger than 100 records remain preserved
and exportable with `CONFLICT_GROUP_TOO_LARGE`.

The server choice applies the inspected records and removes only that connected
group. Unrelated queued work remains. `exportConflict` works before resolution
and afterward using the original batch identifier; its JSON-ready bundle retains
original operations and binary bytes. Individual exported Blobs have a 64 MiB
bound and report an explicit size error if exceeded.

## Status API

`getSnapshot()` and `subscribe(listener)` provide:

- `linked` and `scope` (`mode`, `workspaceId`, `userId`, `scopeKey`).
- `connection`, `pending`, `conflicts`, `lastSyncAt`, and `lastError`.
- Equivalent UI aliases `status`, `pendingCount`, `conflictCount`, and `error`.

Connection values include `unlinked`, `idle`, `syncing`, `offline`, `paused`,
`auth-required`, `scope-mismatch`, `conflict`, `resolving`, and `error`.
`wf-cloud-sync-change` carries the same snapshot in its event detail.
`listConflicts()` returns active conflicts, excluding archived resolution history.
`linkedScope()` is synchronous and remains available through owner auth loss.
`syncNow()` returns status after its attempt; callers must inspect that status
instead of displaying success merely because the promise settled. `stop()`
cancels scheduling and removes listeners.

## Verification completed before pause

`node --test tests/wow-cloud-sync.test.cjs` passed 27 tests. They exercise
transaction rollback, typed identifiers, pending revision chains, conflict
retention, write/pull races, tombstones, idempotent retries, owner seeding, media
transport, binding durability, revocation, runner leasing, pagination, explicit
conflict reconciliation, preserved exports, startup races, scope mismatch and
failed-seed protection. The fixture models serialized multi-store IndexedDB
transactions with commit/abort behavior and a CAS/idempotency server ledger.

These are local implementation checks. They do not establish production backend
availability, deployed schema, browser end-to-end behavior, or a live publication.
