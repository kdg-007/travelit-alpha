# TravelIt RC1 — GitHub-only stable iPhone preview

**Decision (November 4, 2026): GitHub only. No Cloudflare.** No other hosting account or domain. This is prepared but not deployed, and draft PR #16 remains unmerged.

Codespaces is an ephemeral developer workspace. Server/tunnel failures (502, 404 after sleep) do not establish an app defect. We retained a port-aware startup guard for convenience, but it is no longer the release-acceptance hosting plan.

KeepIt QA operates at `https://kdg-007.github.io/`. Hosting TravelIt at `https://kdg-007.github.io/travelit-alpha/` changes the path, **not the browser origin**. We will not bypass preview's blocked-host guard, because that would weaken the verified storage-isolation requirement.

The GitHub-only stable plan is a **free GitHub organization** owned by the same existing login. Create its public Pages user/organization repo `<organization>.github.io` and install the one-file, manually triggered workflow from `ops/github-only-pages/workflow.yml` in that new repository. It reads a reviewed pinned SHA of the already-public TravelIt source, builds the synthetic preview, verifies SHA-256 integrity, and publishes **only the isolated preview files** to that organization's separate origin. It needs no external hosting vendor, persistent running server, paid subscription, personal access token, or new login.

**Owner action required:** Create the GitHub Free organization and its Pages repository. Details in `ops/github-only-pages/README.md`. No site was created, no public test link exists, and no data was moved as a result of preparing these files. Continue to use only synthetic data.

**Release gates:** GitHub Actions source/Chromium/WebKit evidence at pinned candidate; separate organization Pages origin; actual iPhone Home Screen and offline cold-start; local backup/restore into disposable workspace; explicit user approval before anything reaches production. KeepIt and LiveIt still disconnected.

Official guidance: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
