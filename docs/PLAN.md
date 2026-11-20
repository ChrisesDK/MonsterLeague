# Plan

## M0 — Foundations

- [ ] CLAUDE.md, docs/PLAN.md, docs/DECISIONS.md
- [ ] pnpm workspace, tsconfig base, ESLint + Prettier, root scripts
- [ ] Package skeletons: data, engine, spawn (stub), sim, region-builder (stub), client
- [ ] Zod schemas for types, species, moves, items, trainers
- [ ] Placeholder content: 7 types, 15 species, ~30 moves, 6 items, 3 trainers
- [ ] i18n en/da for all content and UI strings
- [ ] `pnpm validate`: schemas + cross-references + complete type matrix + i18n keys
- [ ] GitHub Actions CI: install, lint, typecheck, test, validate, build

## M1 — Battle engine + battle prototype

- [ ] Seeded RNG (state in BattleState)
- [ ] Stats + stat stages
- [ ] Type chart lookup (dual types multiply)
- [ ] Damage formula (STAB, crit, random factor, burn, min 1)
- [ ] Battle creation, legal actions
- [ ] Turn order (non-move actions first, priority, speed, paralysis, RNG ties)
- [ ] Moves: accuracy, damage, status/stat/heal/recoil effects, PP
- [ ] Statuses: burn, poison, sleep, paralysis
- [ ] Items (tonics, clear drops), run, catching
- [ ] Faint, replacement (AI auto / player needs_replacement), battle end
- [ ] XP, level-up, learnset moves, move_learn_choice, evolution_ready
- [ ] AI tiers: wild, trainer, leader
- [ ] Unit tests for each rule
- [ ] Property tests (no throw, HP bounds, ends ≤ 500 turns, determinism, no input mutation)
- [ ] Engine coverage ≥ 90%
- [ ] Sim CLI (win rate, mean/median turns, most used moves)
- [ ] Client battle test page (team picker, HP bars, 2×2 moves, Switch/Bag/Run, log,
      event-driven CSS animations, pause/resume via localStorage, da/en)
