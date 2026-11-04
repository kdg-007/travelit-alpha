# TravelIt — v0.39 RC1 (UNRELEASED)

TravelIt is a local-first, family travel planning progressive web app. This is the consolidated release candidate for the **unreleased** v0.39 feature set. The public GitHub Pages website is deployed separately from `main`; changes in this branch and [draft PR #16](https://github.com/kdg-007/travelit-alpha/pull/16) are **not yet live**.

**Testing only:** Do not enter real family identity documents, private bookings or sensitive information into the alpha app. Trip data stays in this browser's IndexedDB and is **not synced to the cloud**. Export encrypted-at-rest backups through a separate trusted mechanism if personal data are ever used in a later approved release; current TravelIt backups have SHA-256 integrity protection but are **not encrypted**.

## Implemented in the RC1 branch
- Saved destinations and social-video reference links with optional locally selected cover images
- Online, no-key interactive multi-pin map; external Waze/Google Maps navigation handoff
- Day-by-day itinerary table and timeline with optional linked activities, guarded schedule-reflow preview, and fixed-booking protection
- Trip-linked local notes, visual packing brainstorm and tabular packing checklist
- Trip vehicle assignment and budget formulas
- Compressed local photo stories with metadata and saved-place cover reuse
- Offline *application shell* with explicit readiness diagnosis and local-data persistence
- Checked JSON backup/restore of travel records, notes and compressed photos

## Explicit limits
- KeepIt and LiveIt are **not connected**; any associations or local changes are not proof of remote sync
- Online map tiles need internet access; offline application availability does not imply offline routing
- Imported offline map packages require a separate export and are **not** in the travel-data backup
- Local photos are bounded compressed JPEG copies, **not original-resolution archival photos**
- Browser/site data deletion can remove local TravelIt records. Backups must be saved outside the browser
- Verified JSON import is limited to 64 MiB; oversize backups need special handling
- Real iPhone standalone-PWA safe-area and OS-specific behaviors remain release gates

## Automated verification
GitHub Actions runs syntax checks and Node unit tests, auto-discovers all `tests/*.browser.mjs` Chromium mobile journeys, and checks a targeted WebKit mobile-browser smoke test on release PRs. Unit tests and browser emulation **cannot** replace a real iPhone standalone-PWA acceptance check.

## Release procedure
1. Confirm all GitHub checks are green on the exact head of [draft PR #16](https://github.com/kdg-007/travelit-alpha/pull/16).
2. Verify backup export/restore, offline reopen, installed-app update, Safari safe-area behavior, and external navigation on a disposable iPhone test workspace.
3. Approve the release explicitly; only then merge PR #16 into `main` for the production staging site.
4. Keep source feature PRs for audit trail; they need not be individually merged after the consolidated candidate is approved.

No paid API key or subscription is required for core local TravelIt operation. Third-party online services may impose their own terms, network dependency or usage limits.
