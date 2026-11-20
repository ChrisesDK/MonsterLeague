# Odense Monster League — project guide

"Odense Monster League" (working title) is a free, walk-to-play, location-based
monster-collecting RPG. Odense, Denmark is the first region: 8 districts, 8 arenas at
real landmarks, wild creatures that spawn from real surroundings (OpenStreetMap biomes)
and turn-based battles in the style of handheld monster RPGs. It ships first as a mobile
web app (PWA). Everything runs on the phone; there is no game server in v1.

Status: milestones M0 (foundations), M1 (battle engine + battle prototype) and M1.5
(balance pass, see docs/BALANCE.md) are done.
M2 (map, GPS, spawning) has not started. See [docs/PLAN.md](docs/PLAN.md) and
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
   against well-known monster games before adding them.
2. **The engine is pure.** `packages/engine` must not import from the browser, React, the
   map or Node APIs. Deterministic: same state + actions + seed → same result. All
   randomness comes from the seeded RNG whose state lives in `BattleState.rngState`.
   (`Math.random`, `Date`, `window`, `process`, … are lint errors in the engine.)
3. **Immutable state.** Engine functions return new state objects and never mutate inputs.
4. **The UI only animates events.** The client never calculates battle results itself; it
   plays back `BattleEvent`s and then shows the state the engine returned.
5. **All content is data.** Species, moves, types, items and trainers live in JSON under
   `packages/data/content`, validated with Zod schemas (`pnpm validate`).
6. **i18n from the start.** User-facing strings are keys in `packages/data/i18n/{da,en}.json`,
   never hard-coded text. Both files must contain the same keys (validated).
7. **Privacy.** Never store or transmit location history. (Applies from M2 on.)

## Architecture

```
packages/data     JSON content + Zod schemas + loader (`content`) + i18n + validate CLI
packages/engine   pure battle engine (rng, stats, damage, battle, ai, catch, xp, moves)
packages/playtest Gate 2 record format, active-time timer, JSON/CSV export, summaries
packages/spawn    (M2) spawn rules — stub
tools/sim         CLI that runs N AI-vs-AI battles and prints stats; sim:report
tools/gate2       merges exported playtest files and prints the Gate 2 report
tools/region-builder (M2) OSM → region data — stub
apps/client       Vite + React PWA: playtest mode (default) and the dev battle page (#/dev)
```

- Workspace packages are consumed **as TypeScript source** (`exports` → `src/index.ts`);
  Vite, Vitest and tsx compile them. There is no library build step.
- The engine imports the validated default content from `@oml/data`, but every public
  engine function takes an optional `dex` argument so tests can inject content.
- Engine API: `createBattle(config, seed)`, `getLegalActions(state, side)`,
  `resolveTurn(state, [a0, a1])` → `{ state, events }`, `chooseAiAction(state, side, tier)`,
  plus `createCreature(speciesId, level, uid)`.
- Side 0 is the player (or sim side A); in wild battles side 1 is the wild creature.
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
```

Sim side specs: a trainer id (`leader_water`), `speciesId:level` (`gnistkat:12`), a
starter alias (`starter_fire`, `starter_water`, `starter_grove`), several joined with `,`,
or a player-team preset `team:<preset>:<starter>`.

Balance: leader targets (neutral 40–60%, advantage 75–90%, disadvantage 15–30%) are guarded
by `tools/sim/test/balance.test.ts`. If a content change breaks them, re-tune with
`pnpm sim:report` and record the change in docs/DECISIONS.md.

## Working conventions

- TypeScript strict, ES modules, Node 20+, pnpm workspaces.
- Write engine code test-first where practical; property tests use fast-check.
- When a rule is ambiguous, choose the simplest reasonable interpretation and record it
  in `docs/DECISIONS.md`. When the GDD itself seems wrong, write a proposal instead.
- Keep `docs/PLAN.md` checkboxes current. Commit in small steps; never push.
