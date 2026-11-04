# TravelIt RC1 - temporary HTTPS iPhone preview with existing GitHub account

OPTIONAL, NOT DEPLOYED, NO PRODUCTION DATA. This procedure is not itself physical-device acceptance.

Why: the current GitHub Pages host kdg-007.github.io also hosts KeepIt QA. Different paths on the same host share browser storage, so TravelIt RC1 refuses that host. A GitHub Codespaces forwarded HTTPS URL is a separate origin and requires no new account, but consumes Codespaces usage quota. Check billing controls before starting.

Owner steps:
1. From the TravelIt draft PR #16, use Code > Codespaces > Create codespace, selecting the release/travelit-v0.39-rc1 branch, NOT main.
2. The branch devcontainer starts a Node server automatically on port 8000. It assembles the isolated preview only and verifies PREVIEW_INTEGRITY.json. No production Pages deployment occurs.
3. In the Codespace Ports panel, find port 8000 and set its Visibility to Public for this disposable synthetic test. Copy its browser HTTPS address ending in app.github.dev. Public means anyone with the URL can visit; do not expose private data.
4. Open the forwarded URL in iPhone Safari. Confirm the RC1 PREVIEW TEST DATA ONLY watermark; open Device checklist, test the six observations, and use Add to Home Screen to test offline reopening. No family IDs, private photos, real bookings or production backups.
5. After finishing, stop or delete the Codespace to stop usage. The preview address is temporary; do not treat it as production hosting.

Safety and limitations:
- No Microsoft credentials, OneDrive operations, KeepIt editor connection, subscriptions or new service account are introduced by the RC1 branch.
- The tunnel HTTPS address is distinct from the production GitHub Pages host. Backend port 8000 runs plain HTTP inside Codespaces; leave Codespaces forwarded port protocol at its default rather than switching it to backend HTTPS.
- GitHub Codespaces may have included free usage depending on account ownership and remaining quota, with potential costs if paid usage is enabled.
- Chromium passed offline preview reopening. Linux WebKit proved cached bytes and normal reopening, but its simulated offline cold-start caused a browser-internal error. Actual iPhone offline boot remains unverified.
- The app remains local-only; neither TravelIt nor KeepIt is remotely synchronized through this test.

References:
https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-included-usage
https://docs.github.com/en/codespaces/reference/security-in-github-codespaces
