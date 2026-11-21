# Domain and email: observed configuration and cutover gates

Observed on **2026-11-21** through public DNS-over-HTTPS; these are observations, not a claim of control-panel access or successful email delivery.

| Record | Observed answer |
|---|---|
| `wowfurniture.com.tr NS` | `p3.hosting.com.tr`, `p4.hosting.com.tr` |
| `wowfurniture.com.tr MX` | priority 10 `mx1.promail.com.tr`, priority 20 `mx2.promail.com.tr` |
| `wowfurniture.com.tr TXT` | `v=spf1 +a include:_spf.promail.com.tr -all` |
| `galeri.wowfurniture.com.tr CNAME` | `wowmobilya.github.io` |
| `markrobot.wowfurniture.com.tr CNAME` | NXDOMAIN at this check |
| `_dmarc.wowfurniture.com.tr TXT` | NXDOMAIN at this check |

The known business contact is `info@wowfurniture.com.tr`. No mailbox password, sender verification, SMTP login or DKIM selector has been verified in this work. The absence of an inspected DKIM selector is not evidence that the domain lacks DKIM. Keep the existing mailbox/MX service.

## Concrete next configuration

1. Restore authorized access to the intended paid Supabase project `sldthbnigivpsqixccah` and inspect its actual Auth users, URL settings and SMTP configuration. The current connector denies this project; the cleaned Masarifi project is not a substitute.
2. Verify the existing ProMail mailbox and exact outgoing server from its customer panel. Official ProMail guidance supports TLS on 465 or STARTTLS on 587; use the provider's exact server/certificate name, not a guessed host. Store credentials in the provider/Supabase secret settings, never in public app files.
3. Configure transactional Auth mail with the verified sender and brand. Confirm one actual owner verification/recovery flow and examine delivery headers for SPF/DKIM alignment. Avoid arbitrary test mail to other users.
4. Add DMARC with a reviewed rollout after verifying every legitimate sender and an actual reporting mailbox. No guessed reporting address or immediate rejecting policy is deployed here.
5. Complete cloud upload/migration from the old origin before moving the frontend. IndexedDB storage is isolated by origin; a CNAME change does not transfer a user's local records or pending commands.
6. Verify ownership of the new custom domain with the selected host, add the exact host-provided DNS record, provision HTTPS, and then update Auth redirect origins and the frontend CNAME/host configuration. `markrobot.wowfurniture.com.tr` is the requested final address. Keep the old-origin migration route until all relevant devices have reconciled.

GitHub Pages currently serves the old subdomain. A static GitHub Pages site accepts one configured custom domain; a deliberate old-origin migration/redirect arrangement is necessary. No DNS, CNAME, hosting access-control, mailbox or paid add-on mutation was made by this preparation.

## Evidence and primary provider instructions

- DNS lookup format: `https://dns.google/resolve?name=wowfurniture.com.tr&type=NS` (repeat with MX/TXT and the exact names above).
- ProMail account/server guidance: https://www.promail.com.tr/bilgi-bankasi/yeni-e-posta-hesabi-olusturma-yeni-hesap-ekle/
- ProMail server and TLS settings: https://www.promail.com.tr/bilgi-bankasi/android-gmail-kurumsal-e-posta-kurulumu/
- Supabase production email/availability guidance: https://supabase.com/docs/guides/deployment/going-into-prod
