# Decisions

Interpretations of ambiguous rules and other choices made while building. Newest last.

## Repo and tooling

- **D1. Workspace packages are consumed as TypeScript source.** `exports` point to
  `src/index.ts`; Vite, Vitest and tsx compile them. `pnpm build` therefore only builds
  `apps/client`; libraries are checked by `pnpm typecheck`. This avoids a project-references
  build graph while there is only one deployable.
- **D2. Engine purity is enforced by tooling**, not just convention: the engine tsconfig has
  no DOM or Node types, and ESLint forbids Node/React/map imports, browser/Node globals,
  `Math.random`, `Date.now` and `new Date` in `packages/engine/src`.
- **D3. The engine imports the default content from `@oml/data`**, but every public engine
  function takes an optional `dex` argument (default = validated content). Tests inject a
  dex with extra deterministic test moves.
- **D4. Pinned major versions** I know well (TypeScript 5.6, Vitest 2, Vite 5, React 18,
  Zod 3, ESLint 9). Upgrading is a separate task.

## Content

- **D5. i18n keys** are flat: `species.<id>.name`, `move.<id>.name`, `item.<id>.name|desc`,
  `type.<id>.name|icon`, `trainer.<id>.name`, `status.*`, `stat.*`, `ui.*`, `event.*`.
  Species names are Danish proper nouns in both locales (e.g. "Bålkat").
- **D6. Type icons** are short letters from i18n (`type.fire.icon`), colours in
  `types.json`.
- **D7. `pnpm validate` also enforces** base stat totals of 240–400, learnsets sorted with
  a level-1 move and no level above 50, status moves having effects, and identical key sets
  in `en` and `da`.

## Battle rules

- **D8. Stat stages** exist for atk, def and spd only (no accuracy/evasion stages).
- **D9. Turn order:** non-move actions (switch, item, catch, run) go before all moves. Within
  the same bracket: move priority, then effective speed (stages applied, paralysis halves),
  then a seeded coin flip. Run is treated like the other non-move actions.
- **D10. Out of PP:** when every move has 0 PP, the only legal action is `move 0`, which
  resolves to the fallback move `desperate_swing` (power 40, never misses, typeless — no
  type chart, no STAB — 25% recoil).
- **D11. Status moves ignore the type chart** (a storm status move can hit a stone
  creature). Damaging moves with typeMul 0 do nothing, including their secondary effects.
- **D12. Sleep:** on infliction a counter of 1–3 is rolled. Each time the sleeping creature
  tries to use a move it is prevented (`cant_act`); at end of turn the counter counts down
  for creatures that were prevented this turn, and the creature wakes at 0. So sleep always
  costs exactly 1–3 move attempts. A sleeping creature can still switch out or be
  switched; the counter persists.
- **D13. Paralysis** is checked when the creature tries to move (25% skip) and halves
  effective speed for turn order.
- **D14. Burn/poison damage** is `max(1, floor(maxHp × 1/16 or 1/8))`, applied at end of
  turn to active creatures in side order 0 then 1.
- **D15. Damage taken is capped at the target's remaining HP**; the `damage` event reports
  HP actually lost. Recoil is `max(1, floor(dealt × percent))` of that.
- **D16. A move whose target fainted earlier in the same turn is skipped entirely** (no
  PP used, no event), including self-buff moves.
- **D17. Faint order and simultaneous wipe-out:** after a move, the defender's faint is
  checked first, then the attacker's (recoil). The battle ends as soon as one side has no
  usable creatures, so if the last creatures on both sides fall in the same action the
  attacker wins; at end of turn, side 0 is processed first.
- **D18. Replacement:** AI-controlled sides (`ai` set) replace at end of turn automatically
  (deterministic match-up scoring, no RNG). Human sides get `needsReplacement` + a
  `needs_replacement` event; the next `resolveTurn` is a replacement step where that side
  must `switch` and the other side must `pass`. It does not advance the turn counter.
- **D19. Run** always succeeds and is only available to side 0 in wild battles.
- **D20. Catch** is only available to side 0 in wild battles. The charm is consumed even on
  failure. On failure the wild creature still acts that turn.
- **D21. Items**: tonics heal up to max HP (not usable at full HP), clear drops cure any
  status; neither works on fainted creatures (no revive item in M1). Charms are used through
  the `catch` action, not `item`.
- **D22. XP** goes only to sides with `gainsXp` (default: side 0 only). Formula:
  `floor(baseXp × faintedLevel × (1.5 if trainer/leader) / 7 / participants)` — the 1.5 is
  applied before flooring. Participants are non-fainted creatures on the winning side that
  were on the field at the same time as the fainted creature.
- **D23. Level-up** keeps damage taken (`hp += newMax − oldMax`); fainted creatures stay at 0. `evolution_ready` is emitted on every level-up at or above the evolution level, so the
  player can be re-prompted if they decline. Max level 100.
- **D24. Turn cap:** after 300 turns the battle ends and the side with the higher fraction
  of total team HP wins (ties go to side 1). This is a safety valve that guarantees the
  "ends within 500 turns" property even under adversarial play (endless switching).
- **D25. AI randomness** comes from a stream derived (hashed) from the battle RNG state,
  the turn and the side. `chooseAiAction` is therefore deterministic and does not consume
  the battle's random numbers.
- **D26. AI details:** trainer = best expected damage (accuracy and crit chance included;
  status moves count as 0) with a 20% random legal move. Leader = heal the active creature
  below 30% HP with the largest heal item while it has used fewer than 2 items; otherwise
  switch if some opposing type hits the active creature for ≥2× and a teammate resists all
  of the opponent's types (≤½); otherwise best expected damage. "Disadvantage" is judged
  on the opponent's own types, not its moves.
- **D27. Wild battles** require exactly one creature on side 1.
