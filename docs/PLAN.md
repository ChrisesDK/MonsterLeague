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

## Open questions (before/during M2)

- Balance: a lone level-12 starter cannot beat the water leader (see sim output); decide
  intended team size/levels per arena.
- Move-learn choice and evolution UI live outside battle — design them with the
  collection screens.
- Should run ever fail? Should the player be able to catch with a full team?

## M2 — Map, GPS, spawning (not started)
