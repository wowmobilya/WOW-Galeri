# WOW account statement V22

Based exclusively on the uploaded V21 archive. No publication, remote account changes,
IndexedDB migration, record deletion, or automatic historical-money rewriting.

## Added

- Pure read-only financial model; chronological signed balances and period opening balance.
- Receipt-store + invoice-snapshot reconciliation, depositUSD support, snapshot-only receipts.
- Explicit handling of missing dates, historical FX, duplicated IDs, cached-total mismatches,
  orphan payments, archived invoices, drafts/cancellations, refunds and overpayment credit.
- Responsive statement dialog, separate export language (AR/TR/EN), date/currency filters,
  per-invoice detail view, payment history and aging based on actual recorded payment due dates.
- Multi-page A4 PDF built from the full model, with repeated headers, complete row-count
  checks, measured pagination, long-text splitting, cancellation and no partial downloads.
- Seven-sheet editable OOXML with real numeric/date cells and cached balance formulas.
- User-gesture-based file sharing with a download fallback.

## Targeted integration fixes

- Customer financial summaries use the same canonical model, including depositUSD and credit.
- Newly received non-USD payments retain the original currency/amount and booked USD amount;
  accepted conversion rates are snapshotted so a later rate refresh cannot alter the receipt.
- Invalid/non-positive input and unaccepted currency conversions do not write records.
- Totals throughout existing payment/invoice code use normalized USD instead of blindly adding
  native-currency values. Historical missing FX is never filled from today's rates.
- Opening/adding/deleting payments preserves valid invoice-snapshot receipts.
- Existing invoice PDF layout/signature/protection engines and invoice Excel layout are retained.
- Service worker pre-caches local statement files; optional remote images/libraries cannot
  invalidate local installation. Only WOW-prefixed outdated caches are removed.
- Existing Google configuration, manifest and original tests are retained.

## Verification scope

Node tests exercise the actual extracted payment-save function with an atomic-write boundary
stub, not a live database. Existing backup/onboarding tests remain in the suite.
Chromium tests run the shipped scripts in an offline `set_content` harness because managed
navigation is blocked in this environment; initialization, real storage loading and OAuth are
not started. This verifies the new interface, full-model export, pagination and read-only behavior,
not a live Google account or a specific user's browser/device.

PDF output is rasterized page content (not searchable text or a digitally certified statement).
XLSX output is real cells with supported formulas; spreadsheet edits do not write back to the app.
