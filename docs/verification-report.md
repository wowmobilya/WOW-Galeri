# Release 211 — local verification report

Verification checkpoint: **21 November 2026, 17:26 Europe/Istanbul**.

This report records executable local evidence for the assembled Mark Robot / WOW FURNITURE branch. It does not certify a hosted deployment, actual device delivery, the private project's condition, or a completed historical data migration.

## Result

| Gate | Observed result |
| --- | --- |
| Complete Node regression suite | **1,562 passed; 0 failed, cancelled, skipped or todo.** Duration 50.96 seconds. |
| Release source verifier | `RELEASE_SOURCE_VERIFIED`: 192 referenced assets, 128 parsed scripts, 3,995,963 referenced bytes. |
| Whitespace | `git -c core.whitespace=cr-at-eol diff --check` completed successfully. |
| Root dependency audit | `npm audit --json --ignore-scripts`: zero reported vulnerabilities. |
| Server production dependency audit | `npm audit --omit=dev --json --ignore-scripts` in `supabase`: zero reported vulnerabilities. |
| Modified/new-file credential scan | 194 files scanned; no matches for the configured private-key, provider-token, GitHub-token, Supabase-secret or long credential-assignment patterns. No private export/key/archive paths in the publication set. This is a bounded pattern scan, not proof of the absence of all secrets or defects. |
| Independent specialist review | Findings in the reviewed authorization, customer recovery, financial quotes, public sharing, correspondence and supporting storage/notification boundaries closed locally. |

Commands:

```sh
npm run verify:release
node --test --test-concurrency=2 tests/*.test.cjs tests/*.test.mjs
git -c core.whitespace=cr-at-eol diff --check
npm audit --json --ignore-scripts
npm audit --prefix supabase --omit=dev --json --ignore-scripts
```

Runtime: Node **v24.22.3**, Python **3.12.14**, pypdf **6.21.4**, PGlite **0.5.17**, fake-indexeddb **6.2.4**, server web-push **4.0.0**. The pinned CI workflow installs Node 24 and Python 3.13. The pre-music base commit `0523877b93fe3ca315b390201e0a859ddfb9b946` passed both its [push run](https://github.com/wowmobilya/WOW-Galeri/actions/runs/44912380030) and [pull-request run](https://github.com/wowmobilya/WOW-Galeri/actions/runs/44912402081). The follow-up adds a separate Chromium job; its execution evidence is recorded through [draft PR 22](https://github.com/wowmobilya/WOW-Galeri/pull/22).

The first complete run found five failures. Four occurred before the speech/cache assertions because the worker fixture omitted the real browser's `WorkerLocation.href`; that fixture now provides the worker URL and resolves requests against it. The fifth asserted that random Base64 ciphertext could not contain the short sequence `E1`. It now independently decrypts the exact PostgreSQL receipt with AES-256-GCM, verifies its IV and authenticated ciphertext size, and requires a different key or account/session binding to fail authentication. A full 1,530-test baseline passed after both corrections. The complete 1,562-test follow-up above also includes the music lifecycle and immutable-cache regressions; no product checks were disabled.

## What the suite exercises

- The actual assembled Edge entrypoint, all migrations in the release manifest installed twice, current capability catalog, RLS and private function privileges. Provider-owned network integrations use explicit fixtures.
- Canonical WOW products, companies, invoices, payments and cashbox authority; exact financial values, duplicate prevention, compensating actions, stock reservation/reversal and owner-only financial notifications.
- Customer email proof bound to its particular request and workspace; fixed customer principals that cannot become staff/owners during password recovery; cleanup that does not revoke another user's unrelated session.
- Correspondence recipient and sender revalidation, expiry/anonymous-account denial, internationalized-domain mailbox compatibility, immutable provider payloads, bounded retry, idempotency and signed delivery-event processing.
- Scoped IndexedDB queues and media, reload and multiple-tab leases, quota failures, permission changes, stale replies and account switching. Pending work is preserved rather than silently reported as delivered.
- Push encryption and routing, account-bound service-worker storage, hidden/withdrawn public shares and sensitive email callback URLs excluded from application cache replay.
- Optional gallery music with trusted-gesture playback, scoped bounded preferences and interruption on speech, account changes, or a retained inactive route. The actual 128,832-byte MP3 is SHA-256-pinned; cache/network HTML fallbacks, truncation and same-length corruption are rejected. Warm offline byte ranges return the exact original bytes without a network request.
- Reference quote decimal fidelity and maximum observation age; private AI source projections, encrypted answer receipts, metering and cross-account denial.
- Real generated PDF parsing/decryption, application locale coverage, registered DOM controls and exact client/server policy copies.

Focused suites overlap the complete run and one another; their counts are not added to the aggregate result.

## Project and publication boundary

- Intended Supabase project: **`sldthbnigivpsqixccah`**. The authorized connector again returned `You do not have permission to perform this action`. Its actual paid plan, region, private schema, records and backups remain unverified.
- Existing primary URL: **`https://galeri.wowfurniture.com.tr`**. Intended final URL: **`https://markrobot.wowfurniture.com.tr`**, following verified device-data handover. `CNAME` and DNS remain unchanged.
- Repository: **`wowmobilya/WOW-Galeri`**; isolated review branch **`feat/wow-cloud-211`**. The verified upstream base is `39ff395b76f25c5774cf3de2fe15c6d8c5ed9c9d`. The local checkout's 425 baseline file blobs matched its upstream tree before assembling this change.
- Public cloud configuration retains the correct project reference with cloud activation disabled, an empty publishable-key field and no service secrets injected. No target migration or provider activation is inferred from passing fixtures.
- The release manifest contains twelve ordered additive installation files and the actual Edge entrypoint. Inspect and back up the authorized target before applying them; do not substitute a different project or reset existing business data.

## Remaining acceptance

Native browser launch was blocked in this executor. Four bounded Chromium fixtures are now wired into GitHub Actions: gallery controls/RTL/PDF, simulated-provider closed-tab push, native muted music lifecycle, and the actual root worker playing the installed track offline. The offline fixture serves 221 exact public-shell URLs from loopback, clears/disables the HTTP cache, requires real worker 206 responses, and checks that playback adds no track network request. Syntax, static fixture validation and independent fixture review passed; native execution remains pending at this local checkpoint. These synthetic fixtures do not replace actual target login, camera, printing, browser quota behavior, physical audio or an installed phone test. No closed-app phone notification, real SMTP/signup/recovery message, delivered customer correspondence, live model result, public crawler preview, keyed metals quote, target Cron heartbeat or backup restoration has been accepted for this release.

Historical Galeri.TR transfer remains separate. The local tool inventories **28 source families** and validates explicit mappings and relationships; it always returns `applyReady:false`, and Storage bytes retain `objects.contentVerified:false`. Authorized private source/target exports, identity/product/file-ownership maps, verified file bytes and repeatable import adapters are still required. The financial importer does not constitute a full historical importer. Existing WOW data and the old repository must remain available through reconciliation.

Background-music parity is implemented and independently reviewed locally; its behavior, original synthesis and fixture boundaries are recorded in [the music guide](gallery-music.md) and [the acceptance ledger](release-acceptance.md). Native per-cashbox warnings already cover the working low-balance feature. The public legacy overdue/payroll toggles had no visible reminder consumer; new scheduled reminders are optional, unimplemented and inactive. Unseen private jobs remain unknown until target access. Local completion, hosted configuration, observed delivery and data restoration each need their own evidence. See [the operations guide](production-operations.md) for rollout, monitoring and recovery, and [the history transfer boundary](galeri-history-transfer.md) for the migration prerequisites.
