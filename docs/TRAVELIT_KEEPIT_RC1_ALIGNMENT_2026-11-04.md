# TravelIt × KeepIt — RC1 alignment gate (4 November 2026)

**Status:** Source-contract alignment only; **no runtime integration enabled**.
**TravelIt reference:** draft PR #16, v0.39 RC1. **KeepIt reference:** private source QA `c0277e720363`, compiled site `8c2bf6a81a3b`; later KeepIt commits `d33a7795`/`5afa3ffe` inspect backup history internals, **not an approved fix or release**.
KeepIt's `PLATFORM_CONTRACT_V1.md` is Gate A frozen / Gate B partial and **NOT RELEASED**. This receipt does not supersede provider approval.

## Separation of responsibility

| Data or operation | Authoritative owner | RC1 implementation truth |
|---|---|---|
| Trips, itinerary, route/pins, packing, expenses, vehicle, TravelIt photo-gallery records | TravelIt | Stored locally, backup/restore tested; no provider dependency |
| TravelIt Markdown capture notes | TravelIt temporarily | Locally edited and backed up; **not** native KeepIt notes and **not synced** |
| Native rich notes, note assets, version history, library originals, cloud reconciliation | KeepIt | Provider QA progressed, **no TravelIt-hosted writer** |
| TravelIt→KeepIt association intent / local opaque reference | TravelIt | Strict reference-v1 shape, scope not authorization; link preservation only |
| Authorized association ledger, typed reference construction, native note editor | KeepIt provider | Platform v1 composition / grants **not installed in TravelIt** |
| Calendar projections to LiveIt | TravelIt source; LiveIt destination | Disabled; no verified sync service |

## Distinct reference envelopes

- Legacy native-note reference v1: `{provider:'keepit', version:1, scope, itemId, revision}`. Current TravelIt association data preserves exactly that shape, including historical revision zero.
- Generic KeepIt Platform v1 reference: `{provider:'keepit', version:1, scope, itemId, revision, kind:'note'|'file'}`; its revision must be **positive**. No TravelIt code may infer or append `kind` from a client label or cast a note into a file. KeepIt's authorized provider must resolve and issue the typed reference.
- `js/keepit-platform-compat.js` validates typed records and exact native↔typed correspondence. It is **not** a connection method, token mechanism, or proof of remote persistence.

## Integration gates (future independent release, not RC1)

1. **Trusted composition:** provider-owned first-party same-origin in-process transport; approved TravelIt `appId` and capability manifest. Never use independent iframe `postMessage`, public HTTP endpoint, a URL flag, or Microsoft bearer tokens supplied to TravelIt.
2. **Session checks:** `contractMajor:1`, original library scope fingerprint, provider-controlled account/library target, expiry ≤1 hour and per-call grant revalidation. Native note use additionally requires `notes.native`.
3. **Verified native workflow:** create/open/status via actual KeepIt editor; exact ID, revision, checksum and readback. Save-on-device is **not** cloud verified. Pending drafts/assets and conflict status must survive reopen without duplicate uploads.
4. **No destructive associations:** attach/detach/relabel only the link, never original files; copying Trip/Place requires explicit share/omit/independent-verified policy. Maintain stable TravelIt IDs.
5. **Portable recovery:** TravelIt JSON backup includes domain data and local notes, **not KeepIt native note bodies/history or original files**. KeepIt's November 4 QA still lacks proven preservation of **all prior native-note revisions** in full backup/restore. Do not claim cross-app recovery until that gap is fixed and tested.
6. **Real-device/provider acceptance:** authorized disposable KeepIt QA library, iPhone and Mac, OneDrive login/reconciliation, offline replay, wrong-library/expiry/denied cases, original-byte readback, and independent restore. No production OneDrive writes.

## Release sequencing

- **TravelIt RC1 standalone:** proceed to isolated-origin synthetic iPhone acceptance independently. Do not hold core itinerary/packing/route usability hostage to KeepIt.
- **KeepIt QA:** native-note and recovery checks have green browser evidence, but physical device/cloud and full revision-history archive remain open.
- **TravelIt + KeepIt integration:** separate post-RC1 candidate, activated only after provider conformance and explicit approval. Maintain a truthful `NOT_CONNECTED` fallback.
- **LiveIt:** remains separate; no calendar event transport or automatic projection has been certified.

Nothing in this alignment authorizes an endpoint, credentials, production migration, or new subscription. No production data or deployed site is changed.
