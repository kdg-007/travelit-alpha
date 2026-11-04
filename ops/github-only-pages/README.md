# GitHub-only TravelIt RC1 iPhone testing host

**Host decision: GitHub only. No Cloudflare, no additional non-GitHub service.**
**Not deployed:** This is an inert workflow template until you create the destination within GitHub.

## Why a separate GitHub organization

KeepIt's current QA uses `https://kdg-007.github.io/`. TravelIt's public project page under the existing username would be `https://kdg-007.github.io/travelit-alpha/`; **that is the same browser origin**, despite a different path. IndexedDB, CacheStorage, localStorage and top-level service-worker interactions demand a separate-origin test before touching KeepIt data.

A **free GitHub organization under the existing personal login** gets its own `https://<organization>.github.io/` origin. No second personal account, new provider, external domain, subscription, Codespace tunnel, or running backend is required. GitHub Pages automatically hosts the static TravelIt PWA. The organization name must be unique; examples below are placeholders, not allocated accounts.

## One-time owner setup

1. In the existing GitHub account, visit https://github.com/settings/organizations and select **New organization**. Choose the **Free** plan. Choose a distinct name for a TravelIt test organization, e.g. `travelit-sima-qa` *if available*.
2. Inside that organization create a **PUBLIC** repository named **`<organization>.github.io`** (replace the placeholder with your actual organization name). Use **Add a README** so the main branch is initialized.
3. In the new organization repository select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. In the same organization repo, add a new file **`.github/workflows/travelit-rc1-qa.yml`**, copying the complete contents of `ops/github-only-pages/workflow.yml` from this TravelIt PR branch. This must be in the **organization site repo**, not in `kdg-007/travelit-alpha`. It is safe by default: **manual `workflow_dispatch` only**, no automatic publishing on pushes.
5. Open **Actions → TravelIt RC1 isolated GitHub Pages QA → Run workflow** in the organization repository. Confirm the entire workflow completes successfully. This deploys only the test preview from the reviewed, **exact SHA-pinned** public TravelIt branch code; it does not deploy source files, production data or secrets.
6. Open **`https://<organization>.github.io/`** and confirm the orange **RC1 PREVIEW · TEST DATA ONLY** label and Device checklist. The URL must NOT contain `kdg-007.github.io`.
7. Open that exact URL in **iPhone Safari**, then use **Add to Home Screen** and the on-device checklist. Use only synthetic trips/photos/notes, because GitHub Pages is **public**.
8. Leave TravelIt PR #16 **draft** and do not merge it. No KeepIt user data or OneDrive credentials are needed.

The deployment is at the organization's **root path**, so TravelIt's relative URL and service-worker root scope remain consistent. If you change the GitHub organization name, create a different host, or update the RC candidate SHA, repeat the isolation/review gate before publishing another build.

## Safety and maintenance

- The public repository and Pages website are visible on the internet. Robots exclusions and TEST DATA ONLY are not access control.
- Github Actions credentials are the built-in Pages-scoped token in the organization's repository; **no personal access token, Microsoft token, Cloudflare token or cross-repo write grant** is required. Checkout only reads the public TravelIt source.
- The workflow is **manual only** and pins TravelIt source to commit `1015c9187ddfd89f529adff7dab54b289120dbb2`. Every future reviewed update requires deliberately changing the pin in the organization workflow. The GitHub source app's `main` and existing `kdg-007.github.io` site stay untouched.
- GitHub Pages is designed for static sites and does **not** sleep like Codespaces. User data is still stored only in the iPhone's browser; export synthetic backups as part of the acceptance test. GitHub Pages does not add cloud synchronization.
- KeepIt platform and LiveIt connections remain disabled. Real iPhone offline cold-start remains a release acceptance gate.
- If user declines to create a GitHub organization, using the existing GitHub Pages hostname is **not an isolated alternative**. Codespaces may still be used temporarily, with its known server-lifetime limitation.

## Official GitHub references

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch
