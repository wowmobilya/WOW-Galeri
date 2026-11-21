# WOW cloud and owner push

## Authorized goal

The owner requested removal of Masarifi and its separate administration service, a clean server for the existing `galeri.wowfurniture.com.tr` application, real detailed notifications while the app is closed, appropriate region selection for Turkey, and verified security and speed. The new request authorizes resuming the previously paused WOW cloud integration. Later instructions explicitly authorize merging the Galeri.TR features into the primary app. The expanded controlling specification is `2026-11-21-mark-robot-operations.md`; legacy private data still requires authorized access and an inventoried migration.

## Design decisions

Preserve current local owner data and the current origin until migration is verified. The final application origin requested by the owner is `https://markrobot.wowfurniture.com.tr`, and the intended paid backend is `sldthbnigivpsqixccah`. The connector currently denies that project. The old Masarifi project is a cleanup target only. Its Frankfurt location must not be presented as the paid target’s verified location; the target plan, region and actual latency remain live gates.

Use authenticated cloud synchronization with a transactional local outbox and server compare-and-swap revisions. All membership, roles and session epochs are checked on the server. Worker caches are isolated across verified permission epochs; stale work is quarantined. Owner enrollment requires an expiring one-time management-created setup proof. A browser visitor is never made owner automatically.

Derive push events on the server from successfully committed proformas, canonical payments and cashbox entries. Important edits/deletes have distinct event identities. Payment invoice mirrors do not create duplicate messages. Owner-authorized bootstrap/restore batches are labeled and audited and do not send historical notifications. Financial notification details go only to opted-in owner devices. The expanded release also requires separately authorized generic chat/gallery notices, with per-recipient eligibility checked before delivery.

An event/subscription queue commits with the business write. Immediate worker dispatch is backed by scheduled retries. Stable event IDs, queue uniqueness and browser notification tags limit duplicates; retries are bounded and dead subscriptions are removed. Recheck recipient authorization before sending. Push endpoints are strictly validated and redirects disabled. Private keys stay on the server.

Use the existing service worker for Web Push and an account/device binding with no bearer tokens in the worker. Notifications contain operation, actor, reference, amount/currency where meaningful, and timestamp. A bounded device delivery history preserves details when an OS truncates the preview. Mismatched or cleared bindings never expose financial details. Logging out disables that device binding. Permission is requested only after an explicit user click.

## Alternatives considered

Local page notifications cannot wake a closed application. Native mobile packaging would add an unrelated distribution project. Standard Web Push fits the existing installed web app, with the explicit limitation that OS permission, network, installation requirements on iPhone/iPad and delivery scheduling remain outside application control. No claim of zero downtime or guaranteed instantaneous delivery is made.

For warm loading, exact versioned assets in the active application cache are served locally. HTML and configuration keep update-aware behavior; authenticated requests are never cached. Paid features are used only after the actual owning organization plan is verified; a paid subscription asserted elsewhere is not proof that this project has that plan.

## Verification and completion

Check schema/RLS/auth boundaries, atomic/idempotent writes, lost acknowledgements, permission changes, offline recovery, event suppression, queue retries and malformed push data. Execute a rollback SQL integration gate using disposable verified fixtures, test the deployed API, and inspect the existing app UI. No live user data is fabricated for demonstrations. Browser/device notification activation and receipt on the owner's actual phone require the owner's device.

Legacy database, Storage and Auth deletion is complete and backed up privately. Six retired Edge entries still require an authenticated dashboard session for physical deletion because the connected API tool lacks deletion. Provider-managed historical migration/log records are not rewritten.
