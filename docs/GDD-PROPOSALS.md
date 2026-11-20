# GDD proposals

Changes Claude Code proposes to the master GDD (docs/GDD.md is a read-only export). The
owner reviews each one; accepted proposals come back in a new GDD export, and then the
status here changes to `accepted` (or `rejected`, with a reason).

## Template

```
### P<n>. <short title>
- **GDD section:** <section name>
- **Current text:** "<quote>"
- **Proposed change:** <new text or table>
- **Reason / evidence:** <why; sim numbers, code references, playtest data>
- **Status:** open | accepted | rejected
```

## Proposals

### P1. Rename the field abilities (hard rule: no Pokémon terms)

- **GDD section:** World (district table, "Field ability earned"); Arenas → Field abilities; Encounters (spawn example `"requires": "rock_smash"`)
- **Current text:** "Cut", "Fish", "Rock Smash", "Night Sight", "Strength", "Fly"
- **Proposed change:** "Cut", "Rock Smash", "Strength" and "Fly" are the names of the HM
  field moves in the Pokémon games, and the set as a whole mirrors the HM system. Rename all
  six with our own vocabulary and folklore flavour. Suggestions:

  | Now         | Proposed (en / da)        |
  | ----------- | ------------------------- |
  | Cut         | Hedgewalk / Hækkegang     |
  | Fish        | Angling / Medefiskeri     |
  | Rock Smash  | Stonecraft / Stenkløver   |
  | Night Sight | Owl Eyes / Ugleøje        |
  | Strength    | Heave / Kæmpekraft        |
  | Fly         | Homeward Wing / Hjemvinge |

  Optionally loosen the "taught into a move slot" mechanic so it doesn't map 1:1 onto HMs.

- **Reason / evidence:** CLAUDE.md hard rule 1. Until this is settled, the code uses no
  field-ability names: the spawn schema's `requires` is a free id (D45).
- **Status:** accepted (GDD v1.2)

### P2. Turn order: catch and run also go first

- **GDD section:** Battle system → Each turn, steps 1–2
- **Current text:** "Both sides choose an action: Move, Switch, Item, or Run" … "Order: Switch and Item go first, then moves …"
- **Proposed change:** "Both sides choose an action: Move, Switch, Item, Catch (wild only) or
  Run (wild only)." … "Order: Switch, Item, Catch and Run go first (ties by Speed, then the
  seeded RNG), then moves by priority, then Speed."
- **Reason / evidence:** That's how the engine has worked since M1 (D9). Catching is a
  separate action because charms aren't used on your own creatures.
- **Status:** accepted (GDD v1.2)

### P3. Data model table: match the real content schemas

- **GDD section:** Data model
- **Current text:** `types.json` "matrix"; moves "effect? {kind, …}"; items "kind (heal, cure, catch, revive), value"; trainers "id, name, poiId, aiTier, team [{species, level, moves}], reward, lines"; species "name (i18n key) … sprite"
- **Proposed change:**

  | File                | Key fields (as built)                                                                                                                                                                     |
  | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `types.json`        | `types[{id, color}]`, `chart[attacker][defender]`                                                                                                                                         |
  | `species.json`      | id, types, baseStats {hp, atk, def, spd}, catchRate, baseXp, learnset [{level, moveId}], evolution? {into, level}; name = i18n key `species.<id>.name`; sprite and biome weights from M2  |
  | `moves.json`        | id, type, power, accuracy (null = never misses), pp, priority, `effects[]` (status {status, chance} · stat {target, stat, stages, chance} · heal {percent} · recoil {percent}), typeless? |
  | `items.json`        | id, kind: `heal` {amount} · `cure` · `charm` {catchBonus} · `revive` {percent}                                                                                                            |
  | `trainers.json`     | id, tier (trainer/leader), team [{speciesId, level, moves?}], items, arena?, theme?; name = i18n key; poiId, reward, lines from M2                                                        |
  | `player-teams.json` | id, arena, starterLevel, team [{speciesId, level}], items: the expected player team per arena (balance tooling)                                                                           |
  | `spawns.json`       | species, district, weight, biomes {water…historic}, time (any/day/night), requires?                                                                                                       |

- **Reason / evidence:** The schemas in `packages/data/src/schemas.ts` are validated in CI.
  `effects[]` is needed because Hunker Down has two effects (def +1 and heal), and catch
  items are called charms throughout.
- **Status:** accepted (GDD v1.2)

### P4. Runtime types: match the engine

- **GDD section:** Data model → Runtime types; Battle system → Battle log
- **Current text:** `BattleState { turn; rngState: number; sides; kind; log: BattleEvent[]; result }`; CreatureInstance without a sleep counter; event `status`
- **Proposed change:**
  - `CreatureInstance` adds `statusTurns: number` (sleep counter).
  - `BattleState`:
    - `rngState: number[]` (four 32-bit words of sfc32);
    - no stored `log`: `resolveTurn` returns `{ state, events }` per turn and the client
      animates them;
    - adds `participation` (who faced whom, for the XP split) and
      `caught?: { creature, destination: 'team' | 'storage' }`.
  - `Side`: team, active, stages, items, ai, gainsXp, needsReplacement, itemsUsed,
    runAttempts.
  - Status events are `status_applied`, `status_cured` and `status_damage`; new events
    `run_failed`, `sent_to_storage`, `needs_replacement`.
- **Reason / evidence:** The GDD block was a suggestion; these fields carry the M1/M1.5 rules
  (sleep counting, XP split, run odds, storage). Keeping a log in the state would grow
  every save without being needed for replay (seed + actions reproduce it).
- **Status:** accepted (GDD v1.2)

### P5. Arena leader team size: "2–6", not "3–6"

- **GDD section:** Arenas → Arena leaders
- **Current text:** "a 3–6 creature team on its type theme"
- **Proposed change:** "a 2–6 creature team on its type theme (growing as in the difficulty table)"
- **Reason / evidence:** The difficulty table gives arena 1 two creatures (Rendsnude,
  Loftnisse), and that is what was balanced and is on target.
- **Status:** accepted (GDD v1.2)

### P6. "Grove is no longer the best defensive type": evidence is mixed

- **GDD section:** Creatures, types and stats (note under the type chart)
- **Current text:** "so Grove has two weaknesses (Fire, Storm) and is no longer the best defensive type."
- **Proposed change:** "… Grove now has two weaknesses (Fire, Storm). It still resists four
  types (Water, Grove, Stone, Storm), so Grove species remain strong in 1v1s; evolved and
  rare species win most equal-level 1v1s by design (higher base stat totals)."
  Optionally the balance flag "> 70% of 1v1s" could compare species within the same tier
  (common / special / starter stage 1 / stage 2 / rare).
- **Reason / evidence:** `pnpm sim:report` after v1.1 (docs/BALANCE.md change log):
  - Bøgevætte's average 1v1 win rate went 84→80% (L10) and 88→85% (L25), still the
    highest of all species;
  - Bøgling 64→56%, Mosbille 57→45%.
  - All 6 remaining > 70% flags are evolved or rare species (base stat total 370–390)
    against mostly unevolved commons.
- **Status:** accepted (GDD v1.2)

### P7. One name for the item button: "Bag"

- **GDD section:** Screens and UX → Battle screen; Battle system → Each turn
- **Current text:** "Switch / Item / Run row"
- **Proposed change:** "Switch / Bag / Run row" (da: Skift / Taske / Flygt), matching the
  Bag screen that the button opens.
- **Reason / evidence:** The battle button opens the bag list (tonics, drops, charms); the
  client has used "Bag" / "Taske" since M1.
- **Status:** accepted (GDD v1.2)
