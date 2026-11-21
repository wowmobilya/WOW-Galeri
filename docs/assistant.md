# Mark Assistant

Mark Assistant is a read-only workspace in Mark Robot for WOW Furniture. An employee can find a record, trace a cash-flow figure back to Finance, review a possible data problem, or look up a question in a conversation. Each result has a reference such as E2 and a control that opens its source workspace. The interface follows the current WOW theme and supports Arabic, English, Turkish, French and Russian.

## Evidence available without a model

| Task | Required source grant in addition to `assistant.view` | What the employee can verify |
| --- | --- | --- |
| Find records | `products.view`, `customers.view`, or `invoices.view` for each source included | Literal matches in the displayed record number, name or invoice reference, type or customer name, and product barcode. The preview shows up to 12 matches. |
| Check data | The corresponding source grant above | Missing product or customer names, invoice references, invoice customer names, product types, and exact barcodes shared by multiple products. Each finding points to a record and suggests a manual check. |
| Monthly cash flow | `finance.view` | PostgreSQL rolls up the existing Finance report across the entire chosen month. Each currency retains its exact inflow, outflow, net and number of cashbox movements. Transfers contribute a movement for each leg. |
| Conversation digest | `chat.view` and active membership of the selected room | Up to 12 text excerpts from the latest visible feed page, in chronological order, each limited to 360 characters. The digest links to excerpts containing an explicit question mark. It marks shortened text. |

Mixed currencies retain their original units. The Finance workspace supplies the ledger rules. Mark Assistant counts recorded cash movements, so a transfer between two cashboxes can appear in both inflow and outflow. The data checks cover the fields in the table. A clean result describes those specific checks.

The server applies each source grant before matching or grouping. It selects explicit scalar fields. Private files, attachments, message drafts, cost structures, bank fields, and full company, invoice or settings documents have no assistant retrieval path. The chat service checks hidden, cleared, deleted and expired messages as well as current room membership. An owner also needs room membership to see a conversation.

## Optional model analysis

Employees first review the evidence. They select individual references and can add a short focus. The explicit OpenAI action submits that selection. The model can rank matching records or findings and can draft a cited discussion summary. For finance and data checks, its response schema accepts only source references. The application renders the actual finding and monetary amount from PostgreSQL. Chat prose appears as a draft with one or more supporting citations per note. When a request has insufficient support, the model can return an empty set of notes.

The server sends text through the official HTTPS Responses endpoint with Structured Outputs, `store: false`, a fixed system instruction and an empty tool list. The adapter reduces records to the reviewed text and findings. For chat it sends only excerpt text and an E-reference. It omits author IDs, display names, room metadata, attachments and drafts. It masks common secret, link and contact patterns in human-authored fields. Users review the selection because unstructured text can still contain confidential information. OpenAI documents its separate abuse-monitoring retention controls. [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [Data controls](https://developers.openai.com/api/docs/guides/your-data) · [Official OpenAI JavaScript examples](https://github.com/openai/openai-node/blob/main/docs/responses.md)

### Server limits

| Control | Implemented value |
| --- | --- |
| Request and concurrency limits | 12 attempts per account and 60 per workspace per UTC day. One in flight per account and three per workspace. Admission is serialized in PostgreSQL. |
| Provider timeout | 12 seconds in the deployment adapter. No automatic generation retries. |
| Provider input | At most 12 selected references, a focus of 240 characters and 24 KiB of UTF-8 JSON evidence and focus. |
| Provider output | 1,000 model output tokens and a 64 KiB response body cap. At most four validated notes. |
| Failure circuit | Three upstream, timeout, unusable-output or indeterminate-result failures per workspace within five minutes pause new provider attempts. Explicit model refusals consume budget and do not trip the outage circuit. |
| Result lifetime | AES-256-GCM-encrypted replies can be reopened for 15 minutes after completion. Every release rechecks current authorization and recomputes the evidence. The routine cleanup job deletes expired ciphertext in bounded batches every 15 minutes. |

A random UUID identifies each explicit request. The browser keeps only a digest and UUID in tab session storage. Search text, chat excerpts, focus and answers stay out of browser persistence. If the return path fails, submitting the same reviewed selection reuses the original reservation. A changed request under that UUID fails. The server keeps compact request tombstones after the encrypted reply expires. An abandoned or timed-out request uses one quota slot even when the provider’s exact token usage is unknown. Explicit new requests can incur another provider charge.

The database records the account, workspace, session epoch, action mode, configured model, outcome, timestamps, and provider token counts when available. It stores request/evidence hashes and a one-use settlement capability. Model prose exists in a separate encrypted table. The public Edge action list exposes no settlement endpoint. The settlement path records usage following sign-out, while the release path requires a live session, current source grants, live room visibility and an identical evidence fingerprint.

Ordinary assistant reads need a current server connection. The workspace clears evidence when the page is hidden, the session changes, the connection goes offline, the source expires, or a preview reaches one minute. Language switching preserves the current search and focus while the workspace is mounted.

## Deployment gates

1. Obtain authorized access to the intended Supabase project and its Edge secret manager. Apply the base schema and the finance, chat and assistant migrations. The assistant installs the private RLS-protected tables, service-role-only RPC and the `wow-assistant-receipts` cleanup schedule.
2. Deploy the common `wow-cloud` Edge entry point with `wow_assistant_service` on its explicit RPC allowlist. Test `assistant.status` and the four evidence paths using actual accounts with the relevant grants. The assistant route can operate at this stage with generative analysis unconfigured.
3. To enable paid generation, provision an authorized OpenAI API project with billing, choose an available model supporting Responses Structured Outputs and review that model’s price and data controls. Configure these secrets on the server. A paid Supabase project and an OpenAI model account are separate services.

   | Server secret | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | Server-side OpenAI API credential for the authorized project. |
   | `WOW_AI_MODEL` | Explicit model ID available to that OpenAI project. Use a pinned snapshot when the chosen model offers one. |
   | `WOW_AI_RECEIPT_KEY` | Independent 32-byte cryptographically random key, encoded as 64 hexadecimal characters, generated and kept in the secret manager. Rotation makes earlier encrypted replies unreadable. |

4. Review a non-sensitive fixture, generate one result, open its citation, and repeat the exact request ID. Confirm a single provider attempt, one database receipt and the recorded token usage. Open the same room as a nonmember and verify denial. Check the server clock, the cleanup job and grants before admitting production users. The UI reports local configuration separately from the signed-in account’s most recent successful response on the configured model.

The local verification uses in-memory PostgreSQL from the project's pinned PGlite distribution, fixture Auth sessions and a simulated provider transport. It exercises the shipping SQL and Edge/UI code. Live acceptance still requires the authorized target project, a working provider credential and a successful real model response. Browser layout and live delivery require their own deployment checks.

## Reproduce local checks

```sh
node --test tests/assistant-provider.test.mjs tests/assistant-transaction.test.mjs tests/assistant-workspace.test.mjs
```

The suites cover source-scoped search and checks, an exact large decimal report, forbidden-field and cross-workspace attempts, chat hide/removal during a provider call, revoked sessions, lost acknowledgements, response validation, encryption and expiry, durable timeout outcomes, workspace/account concurrency and quotas, circuit opening, a UTC day change, five-language controls, lost-response retry identity, and late responses after a user change.
