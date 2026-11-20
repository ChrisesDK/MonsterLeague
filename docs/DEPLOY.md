# Deploying the playtest build (GitHub Pages)

The repo contains a workflow, [.github/workflows/pages.yml](../.github/workflows/pages.yml).
On every push to `main` (or a manual run) it validates content, runs the tests, builds
`apps/client` with the right base path, and publishes it to GitHub Pages. Nothing has been
pushed or created yet: these are the steps for you.

## One-time setup

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
- GitHub Pages, as the web host, keeps ordinary access logs (IP addresses) like any web
  server. Mention it in the tester information if your consent text covers hosting.

## Local alternatives

- Same Wi-Fi: `pnpm dev` and open `http://<your-PC-IP>:5173` on the phone (no offline
  support in dev mode).
- Production build locally: `pnpm build && pnpm --filter @oml/client preview --host`, then
  open `http://<your-PC-IP>:4173`.
