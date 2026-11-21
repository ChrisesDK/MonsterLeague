# Plan

## M0 — Foundations ✅

- [x] CLAUDE.md, docs/PLAN.md, docs/DECISIONS.md
- [x] pnpm workspace, tsconfig base, ESLint + Prettier, root scripts
- [x] Package skeletons: data, engine, spawn (stub), sim, region-builder (stub), client
- [x] Zod schemas for types, species, moves, items, trainers
- [x] Placeholder content: 7 types, 15 species, 33 moves, 6 items, 3 trainers
- [x] i18n en/da for all content and UI strings
- [x] `pnpm validate`: schemas + cross-references + complete type matrix + i18n keys
- [x] GitHub Actions CI: install, lint, typecheck, validate, test, coverage, build, sim smoke test

## M1 — Battle engine + battle prototype ✅

- [x] Seeded RNG (state in BattleState)
- [x] Stats + stat stages
- [x] Type chart lookup (dual types multiply)
- [x] Damage formula (STAB, crit, random factor, burn, min 1)
- [x] Battle creation, legal actions
- [x] Turn order (non-move actions first, priority, speed, paralysis, RNG ties)
- [x] Moves: accuracy, damage, status/stat/heal/recoil effects, PP, out-of-PP fallback
- [x] Statuses: burn, poison, sleep, paralysis
- [x] Items (tonics, clear drops), run, catching
- [x] Faint, replacement (AI auto / player needs_replacement), battle end
- [x] XP, level-up, learnset moves, move_learn_choice, evolution_ready
- [x] AI tiers: wild, trainer, leader
- [x] Unit tests for each rule
- [x] Property tests (no throw, HP bounds, ends ≤ 500 turns, determinism, no input mutation)
- [x] Engine coverage ≥ 90% (99.9% lines, 96.4% branches)
- [x] Sim CLI (win rate, mean/median turns, most used moves)
- [x] Client battle test page (team picker, HP bars, 2×2 moves, Switch/Bag/Run, log,
      event-driven CSS animations, pause/resume via localStorage, da/en)

## M1.5 — Balance pass ✅

- [x] `pnpm sim:report` → docs/BALANCE.md (1v1 matrices L10/L25, player team vs trainers, flags)
- [x] HP formula retuned: neutral 1v1 median 5 turns, super-effective KO in 3 hits
- [x] storm → stone ½ (only immunities: folk ↔ spirit)
- [x] Starter coverage moves (L11–12); auto-learn keeps the strongest move per type
- [x] Arena 1 folk leader (2 creatures, L9–10); leader_water = arena 2 (3 creatures, L13–15)
- [x] Player-team presets per arena (`--player-team`); all six leader targets met
- [x] Leader/trainer set-up AI rule
- [x] Run odds (faster = always; else 50% + 25% per failure)
- [x] Full team → storage (`sent_to_storage`)
- [x] Client post-battle modals: learn move / evolve
- [x] Turn cap 150
- [x] Balance regression tests

## M1.6 — GDD sync and Gate 2 playtest kit ✅

- [x] docs/GDD.md as the design source of truth; CLAUDE.md rules; docs/GDD-PROPOSALS.md
- [x] GDD audit: fixes (catch rate 3–255, Revive Leaf, spawn schema, level cap 50, background pause) + proposals P1–P7
- [x] GDD v1.1 Storm → Grove = 2; sim:report before/after (no retuning needed)
- [x] Playtest mode: tester code, session plan, active-time records, rating, export (share/JSON/CSV/copy), delete
- [x] Speed setting (normal / fast, respects reduce-motion)
- [x] PWA offline; GitHub Pages workflow (prepared, not published); docs/DEPLOY.md
- [x] docs/GATE2.md facilitator script; `pnpm gate2:report <folder>`

## M1.7 — GDD v1.2 sync ✅

- [x] GDD v1.2 in the repo; proposals P1–P7 marked accepted and checked against code
- [x] Field abilities as data (`field-abilities.json`: forager, angler, runereader, nightseer, sealbreaker, homing; badge, learner types, da/en names), validated
- [x] Franchise-term guard test (content names, ids, all da/en strings)
- [x] DEPLOY.md: option B, private repo + Cloudflare Pages

## M1.8 — Publish to GitHub Pages ✅

- [x] Public repo github.com/chrisesdk/OdenseMonsterLeague (source available, all rights reserved)
- [x] Build under the sub-path `/OdenseMonsterLeague/` (VITE_BASE in the workflow) + `check:base` guard in CI and deploy
- [x] Public-repo hygiene: no secrets/local paths in files or history; .gitignore for .env* and playtest exports; noreply commit email
- [x] Pages from GitHub Actions; deploy green; live site verified (battle, rating, export, offline, no console errors)

## Gate 2 — Outdoor battle test ✅ (qualitative pass, see GDD v1.3)

## M2a — Map and shared spawns ✅

- [x] Region builder: Overpass + basemap water → H3 res-10 biome shares (water incl. rivers, forest, park, meadow, farmland, urban, industrial, historic), noSpawn; `region.odense.json` (7,562 cells, 316 KB / 47 KB gzip)
- [x] District 1 drafted along streets; districts 2–8 as Voronoi placeholders (draft)
- [x] PMTiles extract for Odense (8.4 MB) + paper MapLibre style + self-hosted fonts; Pages range requests verified
- [x] `spawn` package: pure, deterministic spawns per cell and window; spawn tables for districts 1–2
- [x] `pnpm spawn:report`: green 1 per 238 m, streets 1 per 432 m (targets met)
- [x] Spawn service Worker: HMAC seeds, res-7 requests, current/next window only, CORS, rate limit, no logging; Workers tests
- [x] Spawn service deployed by the owner; repo variable `SPAWN_SERVICE_URL` set
- [x] GDD v1.4 (P10/P11): no-spawn at ≥25% coverage, blocked spawn positions incl. light rail; noSpawn cells 6.6%; density green 1/221 m, streets 1/371 m
- [x] Map screen: GPS with accuracy/speed filters, spawns within 100 m, tap within 40 m to battle, offline spawn cache, hint markers for field abilities
- [x] Dev GPS simulator (GPX replay, teleport, fake speed) and biome debug view
- [x] A1 placeholder sprites generated by code, asset manifest + CI check; used in battles
- [x] Privacy test: the client sends only a res-7 cell
- [x] GitHub Actions off Node 20; CI runs spawn report and Worker dry run

## M2b — District 1 playable ✅

- [x] GDD v1.5 in the repo
- [x] Engine: obedience level per side (50% disobey above it), field ability takes a move slot
- [x] `packages/game` (pure): versioned save with migrations (v0 → v1) and progression rules
- [x] Save in IndexedDB: autosave on every change, active battle resumes, export/delete, corrupt-save backup + "Start over", no-location test
- [x] Onboarding: safety → location → starter → personal tutorial creature (100–200 m, spawnable spot, guided easy catch) → arrows to district 1; dev skip
- [x] District 1 POIs (`pois.odense.json`, validated: district, no-spawn, 15 m from rail/trunk): arena 1, 4 route trainers, 2 rest stops, all `verified: false`
- [x] Map: POI stamps with radius circles; trainers (once, line, reward), locked-district refusals, rest stops (heal + hourly restock with clock guard), losing (stay fainted, nearest rest stop), arena 1 (junior → leader → badge ceremony, obedience 20, district 2 unlocked), "too wild" spawns
- [x] Field abilities: teach (takes a slot), dev toggle, Forager tested end to end
- [x] Catches into the real team/storage; learn/evolve answers saved; items outside battle
- [x] Screens: team, creature detail, storage, bag, field guide, badges, settings (sound, speed, text size, reduce motion, language, export/delete, safety, send test results)
- [x] Gate 3 kit: opt-in walk sessions, JSON/CSV export, `pnpm gate3:report`, [GATE3.md](GATE3.md)
- [x] Playwright end-to-end test in CI (onboarding → badge 1, with reloads)

## Next: Gate 3 — District walk test (owner, with [GATE3.md](GATE3.md))

- [x] GDD v1.6; P12 and P13 accepted
- [x] Districts 1–8 redrawn on real borders (railways, Odense Å, Ring 2, centre streets); every arena in its own district; region rebuilt, density on target

- [ ] Verify the 7 POIs on site (public, step-free, away from road edges) and set `verified: true`
- [ ] Walk sessions (daylight + one after dark), `pnpm gate3:report`, decision

## Open questions (before/during M2)

- The AI never uses heal moves or target-lowering stat moves.
- Leader fights take 30–42 turns (median). Fine for a leader, but too long for wild
  battles outdoors?
- District order jumps from the harbour (5, north) to Fruens Bøge (6, south): 4.8 km walk.
- Arena 8 (Den Fynske Landsby) is 70 m from the Svendborg railway border: place its POI
  ≥ 80 m east of the tracks in M3.
