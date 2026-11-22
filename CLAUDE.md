# Odense Monster League — project guide

"Odense Monster League" (working title) is a free, walk-to-play, location-based
monster-collecting RPG. Odense, Denmark is the first region: 8 districts, 8 arenas at
real landmarks, wild creatures that spawn from real surroundings (OpenStreetMap biomes)
and turn-based battles in the style of handheld monster RPGs. It ships first as a mobile
web app (PWA). Everything runs on the phone; there is no game server in v1.

Status: M0–M1.8, Gate 2 (qualitative pass), M2a (map and shared spawns), M2b (district 1
playable: save, onboarding, trainers, rest stops, arena 1, badge), M2c (GDD v1.7: new
arena order, open common wildlife with per-player levels, arena 2 and district 2) and
**M2d** (GDD v1.9 game feel: tilted follow camera, wild areas, routes, Town Map, Journal,
design system) are done.
**Live:** https://www.christianrasmussen.dk/OdenseMonsterLeague/ (deployed from `main` by
`.github/workflows/pages.yml`; Vite base `/OdenseMonsterLeague/`, see docs/DEPLOY.md). The
spawn-service Worker is redeployed by CI (docs/DEPLOY.md). **Next: Gate 3**, the district
walk test the owner runs with docs/GATE3.md (verify the POIs on site first). Multiplayer
is M5; don't build any of it before then. See [docs/PLAN.md](docs/PLAN.md) and
[docs/DECISIONS.md](docs/DECISIONS.md).

## Design source of truth

- **[docs/GDD.md](docs/GDD.md) decides game design**: rules, formulas, type chart, content
  structure, targets and scope. It is an exported copy of the master GDD that the owner
  maintains outside the repo. **Never edit docs/GDD.md.** The owner replaces the file
  when the master changes and says so.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** records implementation detail and
  interpretations (how a GDD rule was implemented, edge cases the GDD doesn't cover).
- If code or content disagrees with the GDD, either fix the code to match, or, if the GDD
  looks wrong or unclear, add an entry to
  [docs/GDD-PROPOSALS.md](docs/GDD-PROPOSALS.md). Don't change the design yourself.
  Accepted proposals come back in a new GDD export.

## Hard rules

1. **No Pokémon content of any kind.** No Pokémon names, species, moves, items, terms
   ("Pokéball", "HM", "Pokédex", "Gym"), sprites, sounds or data files. Never install or
   copy from `pokemon-showdown`, `@pkmn/*` or any Pokémon dataset. General genre knowledge
   (turn-based, types, levels) is fine. Use our vocabulary: **creature, arena, leader,
   charm** (catch item), **field guide, field ability**. Check new move/species names
   against well-known monster games before adding them. Field abilities have original
   names (forager, angler, runereader, nightseer, sealbreaker, homing). The test
   `packages/data/test/franchise-terms.test.ts` fails CI if a content name or any da/en
   string uses a denied term; its list lives in `packages/data/test/franchise-terms.ts`.
2. **The engine, the spawn rules and the game rules are pure.** `packages/engine`,
   `packages/spawn` and `packages/game` (the latter two may use h3-js) must not import
   from the browser, React, the map or Node APIs. Deterministic: same state + actions + seed → same result. All
   randomness comes from the seeded RNG whose state lives in `BattleState.rngState`.
   (`Math.random`, `Date`, `window`, `process`, … are lint errors in the engine.)
3. **Immutable state.** Engine functions return new state objects and never mutate inputs.
4. **The UI only animates events.** The client never calculates battle results itself; it
   plays back `BattleEvent`s and then shows the state the engine returned.
5. **All content is data.** Species, moves, types, items and trainers live in JSON under
   `packages/data/content`, validated with Zod schemas (`pnpm validate`).
6. **i18n from the start.** User-facing strings are keys in `packages/data/i18n/{da,en}.json`,
   never hard-coded text. Both files must contain the same keys (validated).
7. **Privacy.** Never store or transmit location history. The save holds no positions
   (tested in `packages/game` and `apps/client/test/privacy.test.ts`). Precise positions stay on the
   phone: the only thing sent to a server is the coarse H3 **res-7** cell (enforced by
   `apps/client/test/privacy.test.ts`); the spawn service never logs requests.
8. **Art.** Every sprite needs an `assets.json` entry with source and an allowed licence
   (CC0-1.0, CC-BY-4.0, own, artist-licence); CI fails otherwise. Never prompt AI tools
   with franchise names or "in the style of".

## Architecture

```
packages/data     JSON content (types, species, moves, items, trainers, player-teams,
                  spawns, field-abilities) + Zod schemas + loader + i18n + validate CLI
packages/engine   pure battle engine (rng, stats, damage, battle, ai, catch, xp, moves)
packages/game     pure save (SaveGame, versions + migrations) and progression rules:
                  obedience, districts, trainers/arena, rest stops, items, storage,
                  field abilities, tutorial placement, field-guide hints, Journal goals
packages/playtest Gate 2 record format, Gate 3 walk sessions, active-time timer, exports
packages/spawn    pure spawn rules: windows, HMAC-seeded rolls per cell, biome-weighted
                  species, day/night (NOAA sun times), district levels
packages/art      A1 placeholder sprites/markers generated by code + assets.json manifest
tools/sim         CLI that runs N AI-vs-AI battles and prints stats; sim:report
tools/gate2       merges exported playtest files and prints the Gate 2 report
tools/gate3       merges exported walk sessions and prints the Gate 3 report
tools/region-builder OSM (Overpass) + basemap water → region.odense.json (H3 res-10 biome
                  shares, flags: noSpawn/wild/water edge/route, districts); routes.ts builds
                  routes.odense.json from the OSM foot network
apps/spawn-service Cloudflare Worker: GET /v1/spawns for one res-7 cell (secret from
                  Worker settings; never logs)
apps/client       Vite + React PWA: map game (#/; src/game = save store, onboarding,
                  screens, Journal; src/map = play view, Town Map; src/ui = design system), playtest (#/playtest), dev battle page (#/dev), GPS simulator
                  + dev hooks (#/dev/map), biome debug (#/dev/biomes); e2e/ = Playwright
```

- Workspace packages are consumed **as TypeScript source** (`exports` → `src/index.ts`);
  Vite, Vitest and tsx compile them. There is no library build step.
- The engine imports the validated default content from `@oml/data`, but every public
  engine function takes an optional `dex` argument so tests can inject content.
- Engine API: `createBattle(config, seed)`, `getLegalActions(state, side)`,
  `resolveTurn(state, [a0, a1])` → `{ state, events }`, `chooseAiAction(state, side, tier)`,
  plus `createCreature(speciesId, level, uid)`.
- Side 0 is the player (or sim side A); in wild battles side 1 is the wild creature.
- Spawns carry `rarity` and a `levelRoll`; the phone turns the roll into a level with
  `spawnLevel` (commons: the player's band, rares: the district's band). Commons can be
  battled in every district; rares, field-ability layers, trainers and arenas lock with
  their district (GDD v1.7).
- The map game drives battles through `packages/game` (`startWildBattle`,
  `startTrainerBattle`, `finishBattle`, …) and saves after every turn; dev hooks
  (`window.__omlDev`, dev tools only) let the E2E test set levels and inject spawns.
- Map markers: MapLibre owns the marker root's `transform` and its `maplibregl-marker`
  classes. Animate only the inner `.marker-body`, and toggle state classes with
  `classList` (tests: `test/marker-css.test.ts`, `e2e/map.e2e.ts`).
- Play camera (`src/map/orbit.ts`): always looks at the player (lower on screen when zoomed
  in: look-ahead padding); drag rotates, zoom tilts. Don't re-enable panning. The play map
  overrides MapLibre's `transform.getHorizon` so the ground reaches the fog wall (D136); the
  fog wall is a custom 3D layer on top (`fogWall.ts`, D138). Never `jumpTo` while a finger
  is down (`fingersDown`): it resets MapLibre's gestures and loses a starting pinch (D139).
- UI: use the tokens and components in `apps/client/src/ui/` (day and night palettes);
  map labels may only use glyphs U+0000–01FF (`glyphSafe`).
- A player side with a fainted active creature gets `needsReplacement`; the next
  `resolveTurn` call is a replacement step where that side must send `switch` and the
  other side sends `pass`. AI-controlled sides replace automatically.

## Commands

```
pnpm install
pnpm lint          # ESLint (typescript-eslint) + Prettier check
pnpm format        # Prettier write
pnpm typecheck     # tsc --noEmit in every package
pnpm test          # Vitest in every package
pnpm coverage      # engine coverage (threshold 90%)
pnpm build         # builds apps/client
pnpm validate      # content JSON vs Zod schemas + cross-references + i18n keys
pnpm sim --a starter_fire:12 --b leader_water --n 10000
pnpm sim --player-team arena2 --starter grove --b leader_water   # expected player team
pnpm sim:report    # regenerates docs/BALANCE.md (~15 s); run after any content/rule change
pnpm dev           # client dev server (http://localhost:5173; #/dev = developer battle page)
pnpm gate2:report <folder>   # Gate 2 summary from exported playtest .json/.csv files
pnpm gate3:report <folder>   # Gate 3 summary from exported walk sessions
pnpm e2e           # Playwright district-1 test on a production build (PW_CHANNEL=msedge locally)
pnpm routes:build  # rebuild routes.odense.json from the OSM foot network (then pnpm region:build)
pnpm region:build  # rebuild region.odense.json + its version file (Overpass cache in tools/region-builder/cache)
pnpm spawn:report  # spawn density per km walked vs GDD targets (CI gate)
pnpm art:build     # regenerate A1 sprites + assets.json after adding species
pnpm --filter @oml/spawn-service dev    # Worker on :8787 (needs apps/spawn-service/.dev.vars)
```

Sim side specs: a trainer id (`leader_water`), `speciesId:level` (`gnistkat:12`), a
starter alias (`starter_fire`, `starter_water`, `starter_grove`), several joined with `,`,
or a player-team preset `team:<preset>:<starter>`.

Worker/client drift: the Worker is redeployed by `.github/workflows/spawn-service.yml`
whenever spawn code, data or the region file change on main. When spawn _code_ changes
its output, bump `SPAWN_ALGORITHM` in `packages/spawn/src/version.ts` (the golden test
says so).

Balance: leader targets (neutral 40–60%, advantage 75–90%, disadvantage 15–30%) are guarded
by `tools/sim/test/balance.test.ts`. If a content change breaks them, re-tune with
`pnpm sim:report` and record the change in docs/DECISIONS.md.

## Working conventions

- TypeScript strict, ES modules, Node 20+, pnpm workspaces.
- Write engine code test-first where practical; property tests use fast-check.
- When a rule is ambiguous, choose the simplest reasonable interpretation and record it
  in `docs/DECISIONS.md`. When the GDD itself seems wrong, write a proposal instead.
- Keep `docs/PLAN.md` checkboxes current. Commit in small steps. Never push unless the
  owner asks in that milestone; the only remote is `origin` =
  github.com/chrisesdk/OdenseMonsterLeague (public). Never touch the owner's other repos.
