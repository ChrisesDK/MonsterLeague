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

## Option A: public repo + GitHub Pages

The workflow validates content, runs the tests, builds `apps/client` with the right base
path and publishes it on every push to `main` (or a manual run). In a private repo it skips
pushes automatically, so it stays harmless if you choose option B.

1. **Create the GitHub repository** (empty: no README, licence or .gitignore), e.g.
   `odense-monster-league`.
   - GitHub Pages on a **private** repo needs a paid plan (Pro/Team). On a free account the
     repo must be **public**, which makes the code public. Decide before pushing.
2. **Push the local repo** from the project folder:
   ```sh
   git remote add origin https://github.com/<you>/odense-monster-league.git
   git push -u origin main
   ```
3. **Enable Pages:** repo → _Settings_ → _Pages_ → _Build and deployment_ → _Source_:
   **GitHub Actions**.
4. **Run the deploy:** the push in step 2 already started _Deploy client to GitHub Pages_
   (_Actions_ tab). It fails at "configure-pages" if step 3 wasn't done yet; in that case
   open the run and click _Re-run all jobs_ (or _Actions_ → the workflow → _Run workflow_).
5. When it's green, the URL appears on the run and under _Settings → Pages_:
   `https://<you>.github.io/odense-monster-league/`

The base path comes from the repo name. A repo named `<you>.github.io` is served at `/`, and
the workflow handles that too.

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
