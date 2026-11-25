# Deploying the playtest build

Two options, depending on whether the code may be public. Nothing has been pushed or
created yet: these are the steps for you. Either way, testers get a public URL; only the
**code** differs in visibility.

|           | A: GitHub Pages                                              | B: Cloudflare Pages            |
| --------- | ------------------------------------------------------------ | ------------------------------ |
| Repo      | Public (free plan)                                           | **Private**                    |
| Built by  | GitHub Actions ([pages.yml](../.github/workflows/pages.yml)) | Cloudflare's build servers     |
| URL       | `https://<you>.github.io/<repo>/`                            | `https://<project>.pages.dev/` |
| Vite base | `/<repo>/` (set by the workflow)                             | `/` (the default)              |
| Cost      | Free                                                         | Free (500 builds/month)        |

## Option A: public repo + GitHub Pages (**live since M1.8**)

**Live:**

- **Link for testers:** <https://www.christianrasmussen.dk/MonsterLeague/>
- Repo: <https://github.com/chrisesdk/MonsterLeague> (public, source available,
  all rights reserved).
- `https://chrisesdk.github.io/MonsterLeague/` also works, but redirects: the
  user site `chrisesdk.github.io` (the portfolio repo) has the custom domain
  `www.christianrasmussen.dk`, and GitHub serves every project site under it.

> **Use the https:// link.** GitHub's redirect from github.io goes to **http://**,
> because "Enforce HTTPS" is off in the portfolio repo's Pages settings. Most current
> browsers upgrade to HTTPS automatically, but not all do. On plain HTTP the app still
> runs, but offline mode (service worker) and the Share button don't work. To fix it for
> every link, tick _Enforce HTTPS_ in the **portfolio** repo → _Settings_ → _Pages_
> (the owner's call; this project never changes that repo).

**How it's set up:**

- **Workflow:** [.github/workflows/pages.yml](../.github/workflows/pages.yml) runs on
  every push to `main` (and manually via _Actions → Deploy client to GitHub Pages → Run
  workflow_). It validates content, runs all tests, builds the client, checks the base
  path, and deploys. In a private repo it skips pushes (see option B).
- **Base path:** the workflow sets `VITE_BASE=/<repo name>/` = `/MonsterLeague/`.
  The repo name's casing matters: the URL path is case-sensitive. Locally `VITE_BASE` is
  unset, so `pnpm dev` and `pnpm --filter @oml/client preview` keep serving at `/`.
- **Everything follows the base:**
  - built asset, icon, manifest and service-worker URLs;
  - the manifest's `start_url`/`scope` are relative (`.`);
  - the service worker registers at `<base>sw.js` with scope `<base>`;
  - hash routing (`#/dev`) needs no 404 fallback.
- **Guard:** `pnpm --filter @oml/client check:base` (`apps/client/scripts/check-base.ts`)
  fails if the built `dist/` references a root-absolute URL outside the base. It runs in
  the deploy job and in CI (a build with `VITE_BASE=/MonsterLeague/`).
- **Pages settings:** _Source: GitHub Actions_ (set via
  `gh api -X POST repos/chrisesdk/MonsterLeague/pages -f build_type=workflow`).
  No CNAME file and no account-level changes.

**Redeploying:** push to `main`, or re-run the workflow. Phones pick up the new version on
their next launch (service-worker auto-update). Each result's `appVersion` is the deployed
commit.

**Setting this up again from scratch** (e.g. under another name):

1. `gh repo create <owner>/<Repo> --public --source . --remote origin`
2. `git push -u origin main`
3. `gh api -X POST repos/<owner>/<Repo>/pages -f build_type=workflow` (use `-X PUT` if
   Pages already exists)
4. Re-run the deploy workflow if it ran before Pages was enabled.

## Option B: private repo + Cloudflare Pages

1. **Create a private GitHub repository** (empty), e.g. `odense-monster-league`, and push:
   ```sh
   git remote add origin https://github.com/<you>/odense-monster-league.git
   git push -u origin main
   ```
   The GitHub Pages workflow sees a private repo and does nothing on pushes.
2. **Create a Cloudflare account** (free) → _Workers & Pages_ → _Create_ → _Pages_ →
   _Connect to Git_. Install the Cloudflare GitHub app and give it access to **only this
   repository**.
3. **Build settings:**

   | Setting                | Value                                                                                                   |
   | ---------------------- | ------------------------------------------------------------------------------------------------------- |
   | Project name           | e.g. `oml-playtest` (becomes `oml-playtest.pages.dev`)                                                  |
   | Production branch      | `main`                                                                                                  |
   | Framework preset       | None                                                                                                    |
   | Root directory         | _(leave empty: repo root)_                                                                              |
   | Build command          | `corepack enable && pnpm install --frozen-lockfile && pnpm validate && pnpm --filter @oml/client build` |
   | Build output directory | `apps/client/dist`                                                                                      |
   | Environment variable   | `NODE_VERSION` = `20`                                                                                   |
   | Environment variable   | `VITE_BASE` = `/` (optional: `/` is already the default)                                                |

   `corepack` picks up pnpm 9 from `packageManager` in package.json. The build reads the
   git commit for the app version shown in playtest results.

4. **Save and Deploy.** The first build takes a few minutes, then the URL is
   `https://oml-playtest.pages.dev/`. Every push to `main` redeploys. Other branches get
   their own preview URLs, which are handy for trying a change before the test day.
5. **Keep Web Analytics off** (the default for Pages) so no tracking script is added.

**Without connecting GitHub at all** (manual upload from your PC):

```sh
pnpm build
npx wrangler pages deploy apps/client/dist --project-name oml-playtest
```

Wrangler asks you to log in to Cloudflare the first time. Repeat both commands for each
new version.

**Restricting who can open the site** (optional): the `pages.dev` URL is public. If you
want only testers to reach it, Cloudflare Zero Trust _Access_ (free for small teams) can
require an email one-time code. That adds a login step outdoors, so for a short Gate 2 an
unlisted URL is usually enough.

## Spawn service (Cloudflare Worker, M2a)

The map gets its wild creatures from a small Worker in `apps/spawn-service` (GDD
"Encounters and spawning"). Everything is prepared; deploying needs **your** Cloudflare
account. Until the Worker URL is configured, the live map shows "spawn service not
configured" and the playtest at `#/playtest` keeps working.

**What it does:** `GET /v1/spawns?region=odense&cell=<H3 res-7>&window=current|next`
returns the spawns for that coarse cell.

- **Seed:** `HMAC-SHA256(SPAWN_SECRET, "odense|<window>")`, so nobody can predict future
  spawns.
- **Windows:** only the current and the next window are served.
- **CORS:** only `https://www.christianrasmussen.dk` and localhost.
- **Rate limit:** 60 requests per minute per client.
- **No logs:** request logging, observability and Logpush are off in `wrangler.toml`.

### One-time setup (run these yourself)

From the project folder, in a terminal:

1. **Log in** (opens the browser; free account is enough):
   ```sh
   cd apps/spawn-service
   pnpm exec wrangler login
   ```
2. **Deploy:**
   ```sh
   pnpm exec wrangler deploy
   ```
   The first time, Wrangler asks you to pick a `workers.dev` subdomain. It prints the
   URL, e.g. `https://oml-spawn-service.<your-subdomain>.workers.dev`.
3. **Set the secret.** Make a random value and paste it when asked. Keep no copy in the
   repo; you can generate a new one any time. Changing it reshuffles all future spawns.
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   pnpm exec wrangler secret put SPAWN_SECRET
   ```
4. **Check it** (the res-7 cell around Kongens Have):
   ```sh
   curl "https://oml-spawn-service.<your-subdomain>.workers.dev/v1/spawns?region=odense&cell=871f04d71ffffff&window=current"
   ```
   You should get JSON with a `spawns` list. Before step 3 it answers
   `500 spawn service not configured`.
5. **Tell the client where it is.** This is a repository variable, not a secret, because
   the URL is public anyway:
   ```sh
   gh variable set SPAWN_SERVICE_URL --repo chrisesdk/MonsterLeague --body "https://oml-spawn-service.<your-subdomain>.workers.dev"
   ```
   The Pages workflow passes it to the build as `VITE_SPAWN_SERVICE_URL`. Then push (or
   re-run the Pages workflow) and the live map shows creatures.

**If `wrangler deploy` rejects the `[[ratelimits]]` block** (it should be available on all
plans), delete that block from `wrangler.toml`, deploy again, and tell me. The service
still works; rate limiting then relies on Cloudflare's default DDoS protection.

**Privacy check in the dashboard:** _Workers & Pages → oml-spawn-service → Settings →
Observability_ should show logs **disabled**. Don't enable Logpush or Tail for this
Worker.

**Local development:** `pnpm --filter @oml/spawn-service dev` runs the Worker on
`http://localhost:8787` with the secret from `apps/spawn-service/.dev.vars` (gitignored;
copy `.dev.vars.example`). `pnpm dev` (the client) uses that URL automatically in dev
builds.

### Automatic Worker deploys (keeps Worker and client in step)

`.github/workflows/spawn-service.yml` redeploys the Worker on every push to `main` that
touches anything deciding spawns:

- `apps/spawn-service`, `packages/spawn`, `packages/data` (incl. the region file);
- `packages/engine/src/rng.ts`, `pnpm-lock.yaml`.

It runs validate and the data/spawn/Worker tests first. After deploying, it checks that the
live Worker reports this commit's versions. You can also run it by hand: _Actions → Deploy
spawn service → Run workflow_.

**One-time setup: a Cloudflare API token that can only edit Workers scripts.**

1. Open dash.cloudflare.com → your profile icon (top right) → **My Profile → API Tokens →
   Create Token**. At the bottom, next to **Create Custom Token**, click **Get started**.
   Don't use the "Edit Cloudflare Workers" template: it grants more than needed.
2. **Token name:** `oml-spawn-service GitHub deploy`.
3. **Permissions:** one row only: **Account · Workers Scripts · Edit**.
4. **Account Resources:** **Include · \<your account\>** (only this account).
5. **Zone Resources:** none. **Client IP Address Filtering:** leave empty (GitHub's runners
   change IP). **TTL:** optional, e.g. an end date a year ahead.
6. **Continue to summary → Create Token**, and copy the token (it's shown once).
7. Store it as a GitHub **secret** named `CLOUDFLARE_API_TOKEN`. Paste it when prompted, so
   it never lands in your shell history:
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN --repo chrisesdk/MonsterLeague
   ```
8. Store your account ID as a GitHub **variable** (it isn't secret). Find it in the
   dashboard under _Workers & Pages_ (right-hand side, "Account ID"), or with
   `pnpm --filter @oml/spawn-service exec wrangler whoami`:
   ```sh
   gh variable set CLOUDFLARE_ACCOUNT_ID --repo chrisesdk/MonsterLeague --body "<account id>"
   ```

`SPAWN_SECRET` stays a Worker secret in Cloudflare; deploys keep it, and it is never in
GitHub. If the token or account ID is missing, the job **fails** instead of skipping
silently, because a skipped deploy is exactly how the two would drift apart. If Wrangler
ever reports a missing permission, the error names it; add only that permission.

**How drift shows up:**

- **What's compared:** every spawn response carries
  `versions: { regionData, spawnRules }`.
  - `regionData` is a hash of the region cells and districts, written by `pnpm
region:build`.
  - `spawnRules` is the spawn algorithm number plus a hash of the density numbers and
    spawn tables.
- **On a mismatch,** the client logs a `console.error`. With dev tools on (`#/dev/map` or
  dev builds) it also shows a small red "Dev: spawn service out of date" note. Players see
  nothing.

## Map tiles

`apps/client/public/tiles/odense.pmtiles` (15 MB, zoom 0–15) is an extract of the
Protomaps basemap build of 2026-11-24 for Odense Kommune plus 1.6 km around it (the fog
wall's reach; P22). It is served from GitHub Pages like any other file. Pages answers HTTP
range requests (verified: `206 Partial Content`), which is all PMTiles needs. Label
fonts (Noto Sans, OFL) are self-hosted in `apps/client/public/fonts/`.

To refresh the extract (e.g. after big OSM changes), run the region builder's extractor
(it reads the tiles it needs from the build over HTTP and writes a PMTiles v3 file; no
CLI to install):

```sh
pnpm --filter @oml/region-builder basemap <YYYYMMDD>   # default: yesterday's build
pnpm region:build   # the region builder reads basemap water from the same file
```

## Before the test day

- Open the URL on your own phone (Android Chrome and iOS Safari), play one wild battle, and
  check that _Send results_ works.
- **Offline:** after the first full load the app works without a connection (service
  worker). Tell testers to open the link once on Wi-Fi before going outside.
- **Updates:** a new push redeploys. Phones pick up the new version on their next launch
  (the service worker updates automatically). The `appVersion` field in each result shows
  which build was used.
- **Optional:** "Add to Home screen" gives a full-screen app icon (Android: browser menu;
  iOS Safari: Share → Add to Home Screen).

## Privacy notes

- The app sends nothing anywhere. Results stay on the phone until the tester shares or
  downloads them. There is no location data in the app at this stage.
- The web host (GitHub Pages or Cloudflare) keeps ordinary access logs (IP addresses) like
  any web server. Mention it in the tester information if your consent text covers
  hosting.

## Local alternatives

- Same Wi-Fi: `pnpm dev` and open `http://<your-PC-IP>:5173` on the phone (no offline
  support in dev mode).
- Production build locally: `pnpm build && pnpm --filter @oml/client preview --host`, then
  open `http://<your-PC-IP>:4173`.
