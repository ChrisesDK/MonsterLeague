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

- [x] Public repo github.com/chrisesdk/MonsterLeague (source available, all rights reserved)
- [x] Build under the sub-path `/MonsterLeague/` (VITE_BASE in the workflow) + `check:base` guard in CI and deploy
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

## M2c — GDD v1.7: arena order and open wildlife ✅

- [x] GDD v1.7 in the repo
- [x] Districts renumbered to the new arena loop (polygons unchanged); badge and district names; save v2 migration
- [x] Spawn tables for all 8 districts with common/rare entries; two new placeholder species (Kampetrold, Ellepige)
- [x] Spawns carry rarity + level roll (SPAWN_ALGORITHM 3); common levels follow the player's badges, rare levels their district
- [x] Locks: commons everywhere; rares and ability layers in locked districts are "too wild"; trainers and arenas refuse
- [x] Arena 2 (Stone, Klosterhaven) with junior; district 2: 2 route trainers + rest stop; arena 4 Water leader scaled (data only)
- [x] Balance: arenas 2 and 4 on target in sim:report and the CI test
- [x] POI fixes: a POI's cell carries its district; radius must stay inside the district; trainer_freja moved
- [x] E2E: onboarding → badge 1 → district 2 → badge 2, plus a band-1 common and a too-wild rare in district 8 with 0 badges

## M2d — GDD v1.9: game feel ✅

- [x] GDD v1.9 in the repo; P14 and P15 accepted
- [x] Drifting creature marker fixed (animations on an inner element; MapLibre classes kept); CSS guard + e2e position test
- [x] Play view: 50° follow camera, zoom 16.5–18.5, rotate + compass, snap back + recentre, player figure with heading cone and accuracy ring, creatures to 200 m, Nearby strip, night style
- [x] Wild areas (region v3 flags) drawn as grass and ripples; routes 1–3 (drafts 4–7) from the OSM foot network, validated, drawn dotted; Freja, Karen and Mads on routes
- [x] Density v1.9 (SPAWN_ALGORITHM 4): wild 1/136 m, streets 1/331 m, 30-minute park walk 11.7
- [x] Town Map with district, arena, route and rest-stop cards
- [x] Journal: pure goal chain + side goals in packages/game, save v3, map card with arrow, Journal screen
- [x] Design system (tokens, components, original icons, OFL fonts), applied to every screen; catch/level-up/evolution/badge feedback; before/after screenshots in docs/screenshots/m2d
- [x] E2E: camera bounds, Town Map, Journal goal after onboarding, Route 1 walk, marker positions

### After M2d (owner feedback) ✅

- [x] Orbit camera: drag rotates around the player (circles anywhere and swipes, with fling; no jerk), zoom on the player tilts the view (30–76°, with distance fog and a sky), no panning or recentre; always centred, GPS corrections glide; icons behind the camera hidden
- [x] Natural recovery: fainted creatures heal by themselves after 8 hours (save v4)
- [x] GPS dips: the last accurate fix stays in play for 90 s
- [x] Species colours for the placeholder art (district 1 commons were all grey)
- [x] 3D buildings in the play view (storybook scale, opt-in setting) and a loading screen (position + town)
- [x] HUD on demand: folded goal card, Nearby button, GPS signal icon; simpler rotation (motion around the player)
- [x] Exact drag rotation; look-ahead zoom; a fog wall in the 3D scene (1,200 m, setting 800–1,400 m, save v6–v7) with the sky behind the map; buildings load 100 m behind the wall; menu over the live map; pinch never lost while the player glides
- [x] New logo (the arena badge), colours without green and yellow, phone bars follow the theme; switch between the map game and the battle playtest
- [x] A back gesture asks before leaving (site and installed app); stars on the night sky
- [x] The fog wall painted like the sky (the round world ends in sky, with a haze at the edge); buildings load at the edge

## Region rework: Odense Kommune (P22, owner request) ✅

- [x] Region v4: the whole municipality (OSM border), Overpass in cached tiles, basemap re-extracted (15 MB)
- [x] 39 zones in 8 districts; 50 routes between zones (15 badge path, 10 other ways, 25 to destinations)
- [x] Routes fill in as they are walked (25 m checkpoints, finished at 90 %) and open the zones they lead to; zones lock rares, trainers and arenas
- [x] New arena loop (Næsbyhoved, Stige Ø, H.C. Andersen Skoven, Hollufgård, Den Fynske Landsby, Odense Zoo, Tusindårsskoven); themes, spawn tables and goals moved with them; arena-3 Water leader re-tuned
- [x] POIs: arena 2 at the castle mound, route trainers on routes, 24 rest stops; save v9
- [x] Town Map for the municipality (zones, route progress) with a Fyn map (only Odense opens; badges; held on Fyn)
- [x] GDD v1.11: P22 and P23 folded in; Claude manages the GDD, GDD-PROPOSALS is the backlog (D164)
- [x] Clean borders: solid region border incl. the harbour, dotted district and zone edges drawn once (D162)
- [x] Route trainers on every route, about one per 1.5 km: 110 in all (D163)
- [x] Skilling, 9 markets (buy and sell), Medium Tonic; Town Map stamps for trainers, rest stops, markets and destinations, with a filter (D165, GDD v1.12)
- [x] Press-based POIs: tap a stamp within reach (+15 m GPS slack) to rest, battle or shop; no pop-up (D166)
- [x] Arenas 3–8 built (owner request before tester e2e): leaders, juniors, POIs at the sites, presets; all inside the CI win-rate guard (D168, GDD v1.13)

## Roster v2 and destinations (owner request, GDD v1.13) ✅

- [x] 55 creatures: 20 wild lines of 2–3 stages, starters get a third stage; rarity per species; 14 new moves (D167)
- [x] Destinations (nature in forest, field and lake zones): denser spawns, triple rare odds, 7 destination-only lines; routes and streets calmer; SPAWN_ALGORITHM 5 (D167)
- [x] Route trainer teams from the new roster, evolved to fit their levels (D168)
- [x] docs/CREATURES.md (with spawn maps) and docs/TEAMS.md, generated by `pnpm docs:content` and checked in CI (D169)
- [x] E2E: arenas 3–8 in order, a far route trainer and a market (`e2e/arenas.e2e.ts`)
- [x] Tester features: welcome at first launch, Feedback in the menu, save import, version in Settings, homes in the field guide; no battle-test link in onboarding (D173–D176)
- [ ] Testers walk the whole campaign; feedback for fixes and balance (arenas 4, 5, 6 and 8 sit 1–4 points outside their bands, inside the guard)

## Next: Gate 3 — District walk test (owner, with [GATE3.md](GATE3.md))

- [x] GDD v1.6; P12 and P13 accepted
- [x] Districts 1–8 redrawn on real borders (railways, Odense Å, Ring 2, centre streets); every arena in its own district; region rebuilt, density on target

- [ ] Verify the POIs in districts 1–2 on site (arena 2, Ole, Freja, Niels, Karen and Mads moved in P22; rest stop Næsbyhoved is new) (public, step-free, away from road edges) and set `verified: true`
- [ ] Walk sessions (daylight + one after dark), `pnpm gate3:report`, decision

## Open questions (before/during M2)

- ~~The AI never uses heal moves or target-lowering stat moves.~~ Done (D186, GDD v1.23):
  trainers, leaders and wild creatures use them; leaders re-tuned.
- Leader fights take 30–42 turns (median). Fine for a leader, but too long for wild
  battles outdoors?
- District order jumps from the harbour (5, north) to Fruens Bøge (6, south): 4.8 km walk.
- Arena 8 (Den Fynske Landsby) is 70 m from the Svendborg railway border: place its POI
  ≥ 80 m east of the tracks in M3.

## To do after the first tester round (owner, 2026-11-25)

- [ ] Levelling pace: estimate the walking (km, days) needed per arena from spawn rates and the XP rules; compare with testers' levels at each arena
- [ ] Long battles: some leader fights take 30–50 turns in the sim (arena 4 grove ~95); tune teams or battle length
- [ ] Field abilities Nightseer, Sealbreaker and Homing: wait until there are proper uses for them (owner)

## Regions: Svendborg (P27, GDD v1.17)

- [x] One folder per region, id prefixes, separation checks, per-region tools and docs (D177)
- [x] Update pipeline: queue in REGIONS.md, `pnpm regions:status` asks the owner after 3 pending updates (D177)
- [x] Every badge its own design, Odense redesigned, Svendborg's eight (D178)
- [x] Svendborg map: boundary, region file, 44 zones, 45 routes, 3 ferry crossings, 24 rest stops, 6 markets, basemap, map frame, README with map (D179)
- [x] Campaigns per region (save v11, region from the phone's position, starter choice on entering a region, Town Map and Fyn map per region, islands open on arrival) (D180)
- [x] Svendborg creatures: Water/Stone/Storm starters and 20 wild lines, spawns, destination homes (D181)
- [x] Svendborg trainers, arena leaders and juniors, balance, Journal goals, e2e; Svendborg playable (D181)
- [ ] Owner checks Svendborg's places on site; Svendborg testers
