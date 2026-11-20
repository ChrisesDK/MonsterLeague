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
- **D19. Run** _(superseded by D34)_ always succeeds and is only available to side 0 in wild battles.
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
- **D24. Turn cap:** _(300 → 150 in D36)_ after 300 turns the battle ends and the side with the higher fraction
  of total team HP wins (ties go to side 1). This is a safety valve that guarantees the
  "ends within 500 turns" property even under adversarial play (endless switching).
- **D25. AI randomness** comes from a stream derived (hashed) from the battle RNG state,
  the turn and the side. `chooseAiAction` is therefore deterministic and does not consume
  the battle's random numbers.
- **D26. AI details:** _(extended by D33)_ trainer = best expected damage (accuracy and crit chance included;
  status moves count as 0) with a 20% random legal move. Leader = heal the active creature
  below 30% HP with the largest heal item while it has used fewer than 2 items; otherwise
  switch if some opposing type hits the active creature for ≥2× and a teammate resists all
  of the opponent's types (≤½); otherwise best expected damage. "Disadvantage" is judged
  on the opponent's own types, not its moves.
- **D27. Wild battles** require exactly one creature on side 1.

## M1.5 balance pass

Numbers below come from `pnpm sim:report` (docs/BALANCE.md). Before/after summary:

|                                                                    | Before           | After                                          |
| ------------------------------------------------------------------ | ---------------- | ---------------------------------------------- |
| Neutral 1v1 median turns (L10 / L25)                               | 3 / 3            | 5 / 5                                          |
| Hits to KO, neutral STAB (L10 / L25)                               | 4 / 3            | 5 / 5                                          |
| Hits to KO, super-effective STAB                                   | 2 / 2            | 3 / 3                                          |
| Arena 1 folk leader: fire / water / grove (target 40–60%)          | 100 / 100 / 100% | 55 / 54 / 53%                                  |
| Arena 2 water leader: fire (15–30) / water (40–60) / grove (75–90) | 0 / 33 / 100%    | 27 / 47 / 85%                                  |
| 1v1 pairs with median < 4 turns                                    | 158              | 27 (5 without a super-effective type relation) |

- **D28. HP formula** is now `floor(base × 3 × L / 100) + 2L + 10` (was
  `floor(base × 2 × L / 100) + L + 10`): about 1.5× HP at L10 and 1.6× at L25. Damage, stat
  and move-power formulas are unchanged. Result: equal-level neutral 1v1s have a median of
  5 turns and need 5 hits with the best neutral STAB move; a super-effective STAB move needs
  3 hits.
- **D29. storm → stone is ½** (was 0). The only immunities are folk ↔ spirit (tested).
- **D30. Starter coverage moves** (also on the evolved forms): fire line Squall Slap (storm,
  L12), water line Cobble Toss (stone, L11), grove line Cobble Toss (stone, L12). Each
  covers the line's own weakness where it can without breaking the arena 2 targets: giving
  the water line a storm move pushed water vs the water leader from 47% to 95%, and stone
  coverage for the fire line dropped fire to 12%.
- **D31. Auto-learn** (`autoMoveset`): used by `createCreature` and by AI-controlled sides
  levelling up mid-battle (wild, trainers, leaders, sim). Picks up to 4 moves:
  1. the strongest damaging move per type (power × accuracy; ties → later learned);
  2. those, strongest first, up to 4;
  3. free slots → non-damaging moves, newest first;
  4. still free → leftover damaging moves, strongest first (so a creature with only folk
     attacks still knows several moves).
     An AI side that auto-learns mid-battle emits `move_learned` with `replaced`; a human side
     with 4 moves still gets `move_learn_choice`.
- **D32. Arenas and presets.** Trainers have optional `arena` and `theme`; validate
  enforces one leader per arena. `content/player-teams.json` holds one preset per arena:
  the expected player team = chosen starter at `starterLevel` + one creature fewer than
  the leader's team size, at the same levels (so starter + preset = leader + 1). The sim
  plays presets with the **leader AI** as a stand-in for a competent human. Starter vs
  leader is classified by `effectiveness(starter → theme) / effectiveness(theme → starter)`
  (> 1 advantage, < 1 disadvantage). CLI: `pnpm sim --player-team arena2 --starter grove`.
- **D33. Set-up AI rule.** Order for leaders: heal item → defensive switch → set-up →
  best damage. Trainers: 20% random legal move → 50% set-up → best damage.
  - Stat boost: a non-damaging move with a self stat raise, used only if HP > 70%, every
    stat it raises is still at stage ≤ 0 ("not yet boosted"), and the opponent's best
    expected damage (average roll, accuracy and crit chance included) is below our HP.
  - Otherwise a status move (non-damaging, inflicts a status) if the target has no status.
  - Target-lowering moves (Stern Glare, Sea Fog) are **not** treated as boosts: I tried
    it, and fights got longer (up to 56 turns) and every arena moved out of its targets.
  - The AI still never uses heal moves (only leaders' heal items); see the open questions.
- **D34. Running** always succeeds if the runner's effective speed is strictly higher
  (stages and paralysis included). Otherwise the chance is 50% + 25% per failed attempt in
  this battle (`Side.runAttempts`), so the third attempt always works. A failure emits
  `run_failed` and the wild creature still acts.
- **D35. Catching with a full team** (party size 6, `MAX_TEAM_SIZE`): the creature goes to
  storage. The engine emits `caught`, then `sent_to_storage`, and sets
  `state.caught = { creature, destination: 'team' | 'storage' }`. There is no collection or
  storage persistence yet; the client shows the log line.
- **D36. Turn cap 150** (was 300), with the same remaining-HP tiebreak. No sim battle reaches it.
- **D37. Arena content.**
  - Arena 1 leader `leader_folk`: Rendsnude L9 + Loftnisse L10 (folk/spirit ace, immune to
    folk moves), 2 small tonics. Player preset: starter L10, Torvdue L9, Mosbille L10.
  - Arena 2 leader `leader_water`: Grimælling L13, Åodder L14, Strømodder L15 (no
    Søormling), 2 large tonics, explicit moves. Grimælling and Åodder carry Hearth Spark as
    an anti-grove check; Strømodder gets Harbour Wave early (normally L22). Player preset:
    starter L15, Rendsnude L13, Grimælling L14, Kulingmåge L14. The storm creature gives
    every starter an answer to water, so the starter shifts the odds instead of deciding
    them.
  - The student and fisher are arena 1 route trainers. The arena 1 preset beats them 100%
    of the time; they have no target.
- **D38. Species and move tuning** (all inside the 240–400 base-stat-total rule):
  - Gnistkat 70/80/60/90 → 70/75/55/90.
  - Åodder 80/70/75/75 → 85/70/80/75.
  - Bøgling 85/70/85/60 → 80/70/80/70.
  - Bøgevætte 110/95/110/80 → 100/95/95/95.
  - Bark Skin +2 → +1 def. The set-up rule made a +2 def boost decisive, because every
    attack uses def.
  - Bøgling now learns Beech Lash at L1 and Bark Skin at L11. Drowsy Pollen moves from L9
    to L13 for the grove line, matching the other starters, whose status moves come at L13.
- **D39. Poison stays at 1/8.** I tested 1/12 because fights are longer now. It moved no
  flag or target, so the original rule stands.
- **D40. Balance report method.**
  - Deterministic: seed 1.
  - 400 battles per 1v1 pair, half with each species on side 0; both sides use the
    trainer AI.
  - 2000 battles per team match-up.
  - A "neutral pair" means each species' own types hit the other for exactly 1×.
  - Hits to KO is analytic: max HP ÷ expected damage of the best STAB move with that
    multiplier.
  - `tools/sim/test/balance.test.ts` guards the leader targets with ±5 points of slack
    (600 battles), so content changes that break them fail CI.
- **D41. Post-battle modals.** `move_learn_choice` and `evolution_ready` prompts are
  collected during the battle (player side only, deduplicated) and shown after it ends:
  - learn: forget one of the 4 moves, or skip;
  - evolve: evolve or not now.
    They apply `learnMove` / `evolveCreature` (pure engine helpers) to a post-battle copy of
    the team. Nothing persists that team yet: there's no collection until a later milestone.

## M1.6: GDD sync and Gate 2 playtest kit

- **D42. GDD audit.** docs/GDD.md (v1.1) is the design source of truth.
  - Plain mismatches fixed:
    - catch rate range 3–255 (schema);
    - the Revive Leaf item (D43);
    - a spawn-table schema, which the GDD's M0 checklist lists (D45);
    - a validation rule that trainer and preset levels stay ≤ 50 (D44);
    - battle playback holds while the app is in the background (D53).
  - Everything else that differs went to docs/GDD-PROPOSALS.md (P1–P7).
  - Not implemented yet, by plan (M2+): obedience, rest stops, trainer rewards and lines,
    the save game, spawning and field abilities.
- **D43. Revive Leaf** (`kind: revive`, `percent: 50`).
  - Usable in battle on a fainted **bench** creature. A fainted active creature is always
    replaced before anyone acts, so it can't be a target.
  - Restores `max(1, floor(maxHp × 50%))` HP and clears the status.
  - Emits `item_used` + `heal`. AIs don't use it.
  - It is in the developer page's bag, but not in any preset or trainer bag, so the
    balance results are unaffected.
- **D44. Level cap.** The engine supports levels 1–100 (`MAX_LEVEL`). The GDD's "level cap
  50 in Odense" is enforced on content: validate rejects trainer or preset levels above 50,
  and learnsets were already capped at 50.
- **D45. Spawn schema.**
  - Fields: `{species, district 1–8, weight > 0, biomes {water, forest, park, urban,
industrial, farmland, historic}, time any|day|night, requires?}`.
  - `content/spawns.json` is empty until M2.
  - `requires` is a free id: field-ability names are pending (P1), so none are encoded.
- **D46. GDD v1.1 Storm → Grove = 2** applied. All six arena results were identical before
  and after (no storm attacker meets grove in either leader fight), so no retuning was
  needed. Before/after is in the BALANCE.md change log.
- **D47. BALANCE.md change log.** `pnpm sim:report` regenerates the file but keeps a
  hand-written `## Change log` section, placed before the matrices.
- **D48. Playtest mode** (default route; the M1 developer battle page moved to `#/dev`).
  - **Session plan:**
    1. wild 1;
    2. wild 2;
    3. route trainer (`trainer_fisher`, the stronger of the two arena 1 trainers);
    4. arena 1 leader;
    5. arena 2 leader (optional).
  - **Teams:** each battle uses a fresh, full-HP copy of the arena's player-team preset,
    with the tester's starter first. Arena 1's preset is used for the wild battles and the
    route trainer, arena 2's for its leader.
  - **Bag:** preset items + 5 Basic Charms (the GDD rest-stop restock), so catching can be
    tested.
  - **Wild opponents:** a random species with catch rate ≥ 100 (commons and biome
    specials; no starter lines, no rares) at a random level from 8–10, with a random battle
    seed. All randomness is client-side `Math.random`; the engine stays seeded.
  - **Record keeping:**
    - A record is stored when the battle ends (rating null), then updated by the rating
      screen. Ratings are required to continue; length and comment are optional.
    - `switches` counts voluntary switches only (forced replacements are excluded).
    - `attempt` numbers redos of a slot within the session.
  - **Tester codes:** 1–12 of A–Z, 0–9, `-`, `_`, upper-cased. That excludes spaces and
    `@`, so no names or emails. Codes are only an identifier.
  - Export and "Delete my results" cover **all** playtest data on the phone (all testers
    who used it); in Gate 2 each tester normally uses their own phone.
- **D49. Active time** (`packages/playtest` timer):
  - Runs while the battle screen is shown.
  - Pauses on the Pause button, `visibilitychange` → hidden and `pagehide`.
  - If the app is closed mid-battle, only time up to the last save counts (the state is
    saved after every turn and on hide).
  - Wall-clock start and end times are stored as well.
- **D50. Export format v1** (`packages/playtest`, shared by the client and
  `pnpm gate2:report`):
  - JSON: `{format: "oml-gate2", version: 1, exportedAt, records[]}`.
  - CSV: a fixed column order, CRLF line ends, RFC 4180 quoting.
  - Free text that starts with `= + - @` gets a leading `'` so spreadsheets don't run it
    as a formula; the importer strips it again.
  - Both formats are validated with Zod on import, and duplicates merge by `recordId`.
  - There are no location fields; a test checks this.
- **D51. Speed setting.**
  - _Fast_ halves the text and event delays and shortens the CSS animations and HP-bar
    transitions to about half.
  - With `prefers-reduced-motion`, animations are off and non-text events have no delay.
  - Tapping the log still skips the rest of a turn.
- **D52. App version.** `__APP_VERSION__` is the short git hash at build time (CI sets
  `APP_VERSION` from `GITHUB_SHA`), or `dev`.
- **D53. Background.** Battle playback waits while the document is hidden (GDD: battles
  pause when the app is backgrounded); turn state is unaffected.
- **D54. Offline and deploy.**
  - vite-plugin-pwa (`generateSW`, `autoUpdate`) precaches the whole app, so it works
    offline after the first load (verified by reloading offline).
  - The base path comes from `VITE_BASE`; the Pages workflow derives it from the repo name.
  - The manifest uses an SVG icon only. PNG icons, which some Android versions need for an
    install prompt, can come with real art (M3).
