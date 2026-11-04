# TravelIt RC1 — stable, isolated iPhone preview hosting

**Status: prepared, not deployed. Do not use private data or merge PR #16.**

## Decision

Codespaces is a developer workstation. It sleeps/stops its backend, so a public forwarded port is not persistent hosting. The branch now uses both `postStartCommand` and `postAttachCommand` with an idempotent server probe to reduce manual restarts when the workspace reconnects. This does **not** keep a Codespace awake or create a permanent URL.

GitHub Pages under `https://kdg-007.github.io/travelit-alpha` is not accepted for RC1 because it shares an origin with KeepIt's current QA. Its separate path is not an independent IndexedDB or localStorage security boundary.

Recommended **optional** stable-host choice: **Cloudflare Pages Free**. It creates a separate `*.pages.dev` site for TravelIt and does not require a mandatory paid subscription. It **does require a Cloudflare account and a one-time GitHub authorization**. User must approve provider registration and publication. There is currently no deployed stable URL.

## Cloudflare Pages setup (only after owner agrees)

1. Sign in or register for Cloudflare Free; connect GitHub, grant the minimum repository access required for `kdg-007/travelit-alpha`. Avoid broad organization access.
2. Create a new Pages project, preferably named `travelit-rc1-qa` if available, linked to that repository.
3. Select production branch **`release/travelit-v0.39-rc1`**, NOT `main`. Leave production and preview as completely separate applications. Do not enable other branches during initial QA.
4. Framework preset: **None**. Build command: `node scripts/build-rc1-preview.mjs && node scripts/preview-integrity.mjs artifacts/rc1-preview`.
5. Output directory: **`artifacts/rc1-preview`**. Root directory: repository root. No environment secrets or Microsoft credentials are required. The site package contains a `PREVIEW_INTEGRITY.json`, a visible test watermark and a disallow-crawling `robots.txt`/Cloudflare `_headers`.
6. Complete the first build and check that the `*.pages.dev` link presents only **TravelIt RC1 Preview — Test Only** and the **Device checklist**. Confirm the URL hostname differs from `kdg-007.github.io`.
7. Open the Pages URL directly in iPhone Safari. Use synthetic travel records and test Home Screen installation, offline relaunch and local backup. Do not transfer real KeepIt or OneDrive records.
8. Keep PR #16 in DRAFT and do not modify the public KeepIt deployment. After iPhone acceptance, a separately approved decision can establish a production TravelIt site and migration procedure.

## Limits and safety

- Cloudflare Pages Free currently lists 500 builds/month, 20,000 files/site and 25 MiB max per file; recheck current terms before signup.
- The preview remains **publicly reachable** even when `robots.txt` asks crawlers not to index. Never add real bookings, IDs, private photographs, or credentials.
- The URL is stable while the Cloudflare Pages project exists and remains enabled. Client data remains browser-local and origin-specific; deleting the site or switching URLs does not automatically migrate saved records.
- Cloudflare is an external service. Existing GitHub Pages alone cannot supply a separate origin on the same account without a custom domain.
- The static build is reproducible using GitHub Actions. No third-party tokens are added to source, CI, or TravelIt's browser runtime.
- KeepIt Platform v1 remains NOT_CONNECTED. LiveIt remains independent.

## Official references

- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://developers.cloudflare.com/pages/platform/limits/
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
