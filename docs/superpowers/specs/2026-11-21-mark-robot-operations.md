# Mark Robot: unattended operation, administration and AI

## User intent and confirmed decisions

The owner requires one coherent WOW FURNITURE application named **مارك ربوت**, preserving the existing visual identity. The final requested origin is `https://markrobot.wowfurniture.com.tr`; the current `galeri.wowfurniture.com.tr` origin remains until local data has been safely migrated. The intended paid Supabase project is `sldthbnigivpsqixccah`. The available connector presently denies access to that project. Nothing in this specification authorizes substituting the old empty Masarifi project or bypassing that denial.

The application must remain available while its owner is travelling or absent, without periodic opening of a browser. The owner clarified that the subscription remains paid. Supabase Pro does not pause projects for inactivity. Operational automation must run on the server; browser background APIs are not a durable scheduler. The intended result is unattended routine operation with bounded, tested automatic recovery. It is not a claim of guaranteed availability during every possible infrastructure, billing or administrative incident.

This is a permanent production business system for WOW FURNITURE. The user explicitly clarified that the graduation presentation is an additional use, not a temporary lifetime or a reason to substitute demo behavior. Durable business data, recovery, controlled upgrades, operational monitoring and continued service while the owner is absent are required. The deliverable must demonstrate measurable behavior, documented boundaries, security checks and honest distinction between local testing and live acceptance. Existing source features from Galeri.TR are mapped in `docs/galeri-feature-merge.md`.

## Architecture

- One real Supabase Auth identity and permission catalog, one Edge API hub, PostgreSQL transactions, private Storage, an atomic durable push queue and database Cron.
- Independent UI modules for gallery/orders, chat, files, finance/payroll/metals, the assistant and owner administration. Shared shell uses the original WOW tokens.
- Phone/device storage is an authenticated, bounded working cache. Current business data has a durable outbox; new module commands retain stable idempotency IDs. Only useful pages and explicitly downloaded files are cached. Unsynced work is never a candidate for automatic cache eviction.
- Server state is authoritative for inventory reservation, ledger posting and shared records. Local pending commands remain visibly pending until an authoritative receipt arrives. Permission changes invalidate projections and quarantine pending work under the old identity.
- The administrative page reports observed status with timestamps: server heartbeat, queues, incidents, bounded recovery history and deployment integrations. It must not display unverified paid-plan, backup, email, AI or external-monitor status as healthy.

## Automatic recovery boundary

Safe automatic actions are fixed, reviewed operations: recover expired queue leases, trigger retries with exponential delay/jitter, reactivate the exact known queue schedule when configured, remove only expired temporary operational rows under retention rules, and record duplicate-suppressed incidents. Financial records, user permissions, database migrations and arbitrary model-generated code are never silently rewritten by the monitoring loop. Source changes pass the normal tests and review pipeline. Browser-generated actions cannot invoke arbitrary SQL, shell commands, URLs or package installation.

The loop runs from Cron every five minutes, with a transaction advisory lock and bounded work. A disabled automation setting remains visible. Internal monitoring cannot detect its own provider being entirely unreachable; independent external monitoring is a separate deployment requirement. Alerts require a real registered delivery channel. None is invented by the dashboard.

## AI boundary

The assistant provides permission-scoped record search, cited record summaries, explanation of deterministic reports and missing-data checks. A model receives bounded authorized projections, never tokens, service keys, passwords, unrestricted database results or other accounts' private chat/files. Retrieved text is data, not instructions. No general shell/SQL/HTTP or write tools are exposed to the model.

Model credentials and model choice remain server-side. A provider call has a timeout, input/output caps, explicit daily/request budgets, audited usage, circuit breaking and a useful unavailable state. Paid Supabase is not an AI model subscription. Real provider configuration and a successful server-side call are required before declaring generative AI enabled. Deterministic search and operational rules remain usable without an LLM.

## Deployment and email

Use `info@wowfurniture.com.tr` as the known business contact subject to real sender-domain verification. Domain DNS provider, SMTP credentials, SPF/DKIM/DMARC and target Auth URLs must be inspected before mutation. No early DNS cutover or guessed verification records. A frontend domain and a paid Supabase API custom-domain add-on are different settings and costs.

Database backup success does not cover Storage object content. Live acceptance must include a database restore exercise and independently verified object copies, protected outside public source. Provider-managed backup configuration remains unverified until correct project access exists.

## Acceptance evidence

1. Real PostgreSQL executes all business migrations, membership/RLS/idempotency/CAS and compensation gates; provider-only surfaces are explicit fixtures.
2. A dropped response/restarted client cannot duplicate a sale, payment, chat send or file upload.
3. Changed identity/session epoch cannot read a previous cached projection or replay its queue.
4. A long disconnected period preserves recoverable pending work, fetches missing changes, and never invents confirmed stock or payroll.
5. Runtime automation recovers an expired lease, respects disabled state and a retry cap, and changes no business records.
6. Owner administration is unavailable to staff, including a local staff identity with a remembered cloud-owner connection.
7. Real device delivery with the app closed, actual email receipt, authenticated origin cutover and target provider tests are separate live gates.

## Primary references verified on 2026-11-21

- Supabase production availability and Pro inactivity policy: https://supabase.com/docs/guides/deployment/going-into-prod
- Cron scheduling and monitoring: https://supabase.com/docs/guides/cron
- Edge runtime limits: https://supabase.com/docs/guides/functions/limits
- Database/Storage backup distinction: https://supabase.com/docs/guides/platform/backups
- Supabase encryption: https://supabase.com/security
- Google SRE, retry amplification and cascading failures: https://sre.google/sre-book/addressing-cascading-failures/
- MDN storage quotas/eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN background synchronization limits: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- WHATWG Storage Standard: https://storage.spec.whatwg.org/
- Supabase official implementation examples: https://github.com/supabase/supabase/tree/master/examples
