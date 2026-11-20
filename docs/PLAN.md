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

## Open questions (before/during M2)

- Grove is the strongest defensive type (resists water, grove, stone, storm; weak only to
  fire), so grove creatures top the 1v1 matrix. Add a second grove weakness?
- The AI never uses heal moves or target-lowering stat moves.
- Leader fights take 30–42 turns (median). Fine for a leader, but too long for wild
  battles outdoors?
- Collection/storage persistence for caught creatures and post-battle learn/evolve results.

## M2 — Map, GPS, spawning (not started)
