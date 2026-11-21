# Unattended private Storage cleanup

Every ten minutes, the database can wake the existing private Edge worker even when nobody has the app open and the notification queue is empty. The worker finishes pending notification delivery before handling one cleanup page. The owner’s automation setting controls each workspace. The owner dashboard shows the last scan, outstanding jobs, confirmed worker removals during the last 24 hours, the exact scheduler configuration, and whether the private worker credentials are configured.

| Stored object | Eligibility for physical removal |
| --- | --- |
| Personal file | An explicit delete, or an unfinished upload at least 24 hours old. Ready files, including archived files, stay available. |
| Chat upload | An unlinked upload at least 24 hours old, or a previously linked asset whose last reference has gone. Each page first expires up to 250 due messages or messages in deleted rooms. A surviving forward, profile avatar, active room avatar, or active member’s wallpaper protects the asset. |
| Gallery upload | An unfinished reservation after 24 hours of inactivity, or an unattached ready image after seven days. A saved slide, card, logo, background, social image, print profile, order-line snapshot, or live legacy media record protects it. Hidden cards and slides and archived orders count. Opening an image for editing, replacing a saved reference, or repeating an active upload refreshes the editing grace period. |

Gallery reservations allow 256 MiB per workspace and 64 MiB per account. Each account may hold 256 outstanding images and start 64 new reservations per rolling hour. A repeat of an active command uses its existing reservation. A completed deletion permanently reserves its original UUID against reuse. When upgrading from a release without edit timestamps, existing assets receive their grace period starting at the upgrade.

## Delivery and retries

Each claim locks up to four eligible workspaces, sharing the workspace lock used by edits. One scan considers up to 30 candidates of each asset type per workspace. Each worker claims up to 12 objects for five minutes and performs at most four Storage requests concurrently. It rechecks the owner setting, object state, references, and immutable address before removing a single key from the private `wow-files` bucket.

An expired lease makes the same object eligible again. A provider failure moves the job to a delayed retry. The delay starts at five minutes and doubles up to six hours. A successful provider response for the exact key, together with an absent Storage catalog entry, permits the quota credit. If Storage already removed the object but the worker lost its acknowledgement, the next exact removal completes that same reservation. The source tombstone survives cleanup of the seven-day completed-job history.

The dashboard’s **pending**, **leased**, and **retrying** counts are disjoint. The last scan records database work performed by the authenticated worker. A scheduled job and configured credentials alone cannot establish live delivery. Job status contains counts and fixed error codes. Personal filenames, file contents, paths, tokens, and provider messages stay outside that status.

## Installation and acceptance

Apply the release manifest in order, including the current files, chat, gallery, operations, notifications and maintenance modules, then deploy the matching Edge bundle. The existing management initializer sets up the project’s worker token, private route and Web Push configuration in Vault. The ten-minute Cron job is named `wow-storage-maintenance` and calls `select public.wow_storage_wake();`. The wake function accepts no destination. It verifies the configured project origin and exact private worker route before dispatch.

Run `node --test tests/storage-maintenance.test.mjs` from the repository root. These tests run the full release in PGlite and exercise the worker with provider fixtures. Hosted acceptance requires the authorized project to demonstrate an actual closed-app Cron wake, an exact synthetic private-object removal, its quota credit, and a second run with the owner setting disabled. Supabase Auth, Storage, Vault, Cron and network delivery in the hosted project remain separate acceptance checks.

[Supabase Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects) · [Storage removal response](https://supabase.com/docs/reference/javascript/file-buckets-remove) · [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
