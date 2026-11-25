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

### P8. Spawn example still uses retired names

- **GDD section:** Encounters and spawning → Example spawn table entry
- **Current text:** `{ "species": "cobble_crab", "district": 4, … "requires": "rock_smash" }`
- **Proposed change:**
  `{ "species": "brokrabbe", "district": 4, "weight": 10, "biomes": { "historic": 3.0, "urban": 1.0 }, "time": "any", "requires": "runereader" }`
- **Reason / evidence:** "rock_smash" is one of the Pokémon field-move names that accepted
  proposal P1 removed everywhere ("never used in code, data or text"); "cobble_crab" isn't
  a species id (the cobble-crab is `brokrabbe`). The franchise-term guard doesn't scan
  the GDD, so this slipped through.
- **Status:** accepted (GDD v1.4)

### P9. Add "meadow" to the biome list

- **GDD section:** Encounters and spawning → Build time, step 3; Data model (`region.<id>.json`)
- **Current text:** "the share of each biome by area: Water, Forest, Park, Urban, Industrial, Farmland, Historic"
- **Proposed change:** "… Water, Forest, Park, Meadow (grass, meadow, heath, scrub), Farmland, Urban, Industrial, Historic". Also note that rivers mapped as lines count as water within 15 m (streams 5 m).
- **Reason / evidence:** The M2a brief and the GDD M2a checklist already include
  meadow/field. In Odense it is the third-largest biome (11 km² of 96), mostly grass along
  paths and the river, which would otherwise count as nothing.
- **Status:** accepted (GDD v1.4)

### P10. noSpawn: by share, and never place a spawn inside a no-spawn area

- **GDD section:** Encounters and spawning → Build time, step 3; Safety → Placement
- **Current text:** "Mark the cell `noSpawn` if it overlaps schools, cemeteries, hospitals, military areas, airports, or motorway/trunk roads."
- **Proposed change:** "A cell is `noSpawn` when at least 25% of it lies in a no-spawn area (schools, kindergartens, cemeteries, hospitals, military areas, airports, rail tracks, motorway/trunk roads). In other cells, spawns are never placed at a point inside a no-spawn area."
- **Reason / evidence:** With "any overlap", 1,032 of 7,562 Odense cells (14%) are
  noSpawn. Whole park cells disappear because a kindergarten touches their edge:
  Eventyrhaven is entirely noSpawn (Dronningens Asyl Børnehus next door), and several
  Kongens Have cells are lost to the station tracks. The safety goal (no creatures _in_
  those places) is kept by the per-point rule; spawn positions are already sampled points,
  so this is cheap to implement. Implemented as in the GDD today; awaiting your decision.
- **Status:** accepted (GDD v1.4)

### P11. "Railway tracks" excludes light rail and trams

- **GDD section:** Encounters and spawning → Build time, step 3
- **Current text:** "… or motorway/trunk roads" (rail tracks are in the M2a brief)
- **Proposed change:** add "railway tracks (heavy rail; not light rail or trams that run along streets)".
- **Reason / evidence:** Odense Letbane runs along main streets and squares that people
  walk every day; making those noSpawn would empty the city centre. Implemented this way
  (DECISIONS D63).
- **Status:** accepted (GDD v1.4)

### P12. Save types live in `packages/game`, not the engine

- **GDD section:** Data model (paragraph above the table)
- **Current text:** "… engine and save types in `packages/engine/src/types.ts` (accepted proposals P3 and P4)."
- **Proposed change:** "… battle types in `packages/engine/src/types.ts`; the save
  (`SaveGame`) and progression rules in `packages/game/src/save.ts` and `rules.ts`."
- **Reason / evidence:** The save carries progression (badges, rest-stop restock times,
  onboarding, settings) that the battle engine never uses. Keeping it in a separate pure
  package keeps the engine small, and lets the save import from both the engine and the
  spawn rules. Implemented this way in M2b (DECISIONS D84). The meaning of the Data model
  is unchanged; only the file path differs.
- **Status:** accepted (GDD v1.6)

### P13. Starter level, starting bag and the tutorial creature

- **GDD section:** Core loop → First 15 minutes; Catching, levelling, evolution and items
- **Current text:** "choose one of three starter creatures wherever the player opens the game; a personal tutorial creature … appears 100–200 m away … for a guided first battle and catch"
- **Proposed change:** add "Starters begin at level 5 with 5 Basic Charms and 2 Small
  Tonics. The tutorial creature is a common level-3 creature with an easy catch rate; the
  tutorial ends with the first catch, and if it fails the team is healed and a new one
  appears."
- **Reason / evidence:** The GDD sets neither the starting level nor the starting bag.
  L5 fits district 1: wild L3–8 and route trainers L4–9, and the arena-1 expected team
  (starter L10) is reached by walking the district. The bag equals one rest-stop
  restock, so the first catch needs no rest stop. Without the retry rule, a player who
  makes the tutorial creature faint would be stuck. Implemented this way in M2b
  (DECISIONS D87, D88).
- **Status:** accepted (GDD v1.6)

### P14. Two more placeholder species: Kampetrold and Ellepige

- **GDD section:** Creatures, types and stats → Roster structure for the v1 slice (15 species)
- **Current text:** "Roster structure for the v1 slice (15 species)" with 2 arena-only/rare species
- **Proposed change:** 17 species. Add Kampetrold (Stone, a fieldstone troll; rare in
  the cathedral district and the Zoo district; arena 2 ace) and Ellepige (Grove/Spirit, a
  forest elf-maid from Danish folklore; rare in Fruens Bøge). Both are placeholders with
  A1 art.
- **Reason / evidence:** v1.7 asks for 1–2 rares per district that suit its places, but
  starter lines are not wild (DECISIONS D68). That leaves the cathedral district with no
  Stone rare and Fruens Bøge with no Grove rare. With Kampetrold, the Stone arena also
  has a second Stone species besides Brokrabbe (Søormling is kept off early arenas).
  Implemented in M2c (D106).
- **Status:** accepted (GDD v1.8)

### P15. Arena 2 stands in Klosterhaven, beside the cathedral, not on the square

- **GDD section:** World (arena location table); Arenas → Arena difficulty
- **Current text:** "Skt. Knuds square"
- **Proposed change:** "Klosterhaven by Sankt Knuds Kirke" (the cathedral's public garden).
- **Reason / evidence:** Skt. Knuds Plads, on the north side of the cathedral, is only
  about 50 m from the district 1 border (Vestergade). An arena's 80 m interaction radius
  would reach into district 1, which POI validation rejects. Klosterhaven, just south of
  the cathedral, is 176 m inside district 2. Implemented in M2c (D108); `verified: false`
  until checked on site.
- **Status:** accepted (GDD v1.8)

### P16. The 30-minute park walk and the wild-area density don't quite add up

- **GDD section:** Encounters and spawning → Density targets (v1.9)
- **Current text:** "one battle-able creature per 100–150 m walked, about one every
  1.5–2 minutes at walking pace … A 30-minute park walk should offer about 10–14
  creatures"
- **Proposed change:** "A 30-minute park walk (about 2 km at a stroll) should offer about
  10–16 creatures", or define the walk's pace.
- **Reason / evidence:** at 4–5 km/h a 30-minute walk covers 2–2.5 km. At 1 per 100–150 m
  that is 13–25 creatures, so the two targets only overlap at 143–150 m. M2d tuned wild areas
  to 1 per 136 m. A park walk that turns back at the park's edge (as people do) finds 11.7
  on average, because it passes some spots twice. The report's walk uses 2 km at 4 km/h.
- **Status:** open

### P17. Route 3 passes through the cathedral district

- **GDD section:** Game feel → Wild areas and routes
- **Current text:** routes run "between consecutive arenas"; the M2d brief says routes
  "must stay in the districts they connect".
- **Proposed change:** "A route stays in the two districts it connects where they touch;
  otherwise it may pass through districts the player has already unlocked."
- **Reason / evidence:** districts 3 (H.C. Andersen quarter) and 4 (Munkemose) don't touch.
  Route 3 runs south from H.C. Andersens Hus through Eventyrhaven and along Odense Å in
  district 2, which is unlocked by then. The route file lists it (`via: [2]`) and validation
  checks it. Draft Route 7 (Den Fynske Landsby → harbour) has the same problem at city
  scale: 13.6 km round the east side. It may need a different district shape or arena
  order.
- **Status:** open

### P18. District 2's trainers stand on Routes 2 and 3, not Route 1

- **GDD section:** Game feel → Journal (example "Beat the trainers on Route 1 (1/2)")
- **Current text:** route trainers "stand on" the route.
- **Proposed change:** the Journal step is "Beat the trainers in <district>"; a district's
  trainers stand on any route through it.
- **Reason / evidence:** Route 1's district-2 stretch is about 400 m, and the arena (80 m
  radius), the rest stop and the district border leave no room for a 50 m trainer radius.
  Karen stands by Albani Torv on Route 2 and Mads on the river path on Route 3, both in
  district 2 (D114).
- **Status:** open

### P19. Fainted creatures recover by themselves after 8 hours

- **GDD section:** Catching, levelling, evolution and items / Battle system (losing)
- **Current text:** losing faints the whole team "until a rest stop or items" (v1.5).
- **Proposed change:** add "or until 8 hours have passed: fainted creatures then recover
  fully by themselves".
- **Reason / evidence:** owner request after M2d, so a player far from a rest stop isn't
  stuck. Implemented (D122).
- **Status:** open (implemented at the owner's request; fold into the GDD)

### P20. The play camera orbits the player and never pans

- **GDD section:** Game feel → Map view
- **Current text:** "tilted about 50°, with zoom limited to … 16.5–18.5 … Two-finger rotate
  is allowed; a compass button resets north."
- **Proposed change:** "The camera always looks at the player and never pans; zooming in
  moves the player lower on the screen (look-ahead) so more of the ground ahead shows.
  Dragging rotates the view around the player by exactly the angle the finger sweeps
  around it, near or far, so the view follows the finger; two-finger twist works too. Pinching or the scroll wheel zooms on the player:
  zoomed out the camera looks almost straight down (30°), zooming in tilts it up to 76°. A
  compass button turns north up. When the GPS position changes, the player slides to it.
  The world is a round patch around the player that ends in sky at a fixed distance,
  1,200 m by default (a setting, 800–1,400 m): a tall wall that is the sky itself (haze
  at the foot, the day or night sky above, stars at night fixed on it) hides everything
  behind it, buildings inside stand in front of it, and the last stretch of ground blends
  into the haze. Buildings load and unload at the edge; icons beyond it are not drawn."
- **Reason / evidence:** owner requests after M2d (D120, D124–D126, D131–D142, D152). The
  recentre button and the snap-back from panning are gone.
- **Status:** open (implemented at the owner's request; fold into the GDD)

### P21. A full revive item: Revive Blossom

- **GDD section:** Battle system → Items (v1)
- **Current text:** the item table has Revive Leaf (revive at 50% HP) as the only revive.
- **Proposed change:** add a row: "Revive Blossom | Revive at full HP | (to be decided)".
  The owner calls it a "Full Revive"; that is the name of a Pokémon item, which hard rule 1
  forbids, so it is named Revive Blossom (the leaf revives at half, the blossom fully;
  Danish "Livsblomst" beside "Livsblad"). "Full Revive" and "Max Revive" are now on the
  franchise-term deny-list.
- **Reason / evidence:** owner request (D148). Until the GDD names where it comes from,
  there is no way to find it in the game; for testing, Settings → Test items adds one to
  the bag.
- **Status:** open (built at the owner's request; where it comes from needs a decision)

### P22. Odense Kommune as a region: zones opened by routes, a new arena loop, a Fyn map

- **GDD sections:** World (district table, rules), Game feel → Wild areas and routes, Town Map,
  Journal, Arena difficulty table, Data model.
- **Current text:** "Odense is split into 8 districts … The arena order is a loop … badge
  _n_ opens district _n + 1_." Arenas at Kongens Have, Klosterhaven, H.C. Andersens Hus,
  Munke Mose, Odense Zoo, Fruens Bøge, Den Fynske Landsby and Havnebadet; one route between
  consecutive arenas (Route 7 was 13.6 km).
- **Proposed change:**
  1. **The region is Odense Kommune** (about 26 × 22 km), not the 10.7 × 8.9 km box around
     the centre. Fyn's other nine municipalities become later regions.
  2. **Zones.** The region is split into 39 zones: 8 arena zones, 6 towns (rest stops, no
     arena) and 25 wild or water destinations (big grass areas, lakes, fjord shores). Each
     zone belongs to one of the 8 districts, which keep their level bands and spawn tables.
  3. **Routes open zones.** 50 numbered routes link the zones along real paths, most of them
     through tall grass: 15 make up the badge path, 10 are other ways between the same places
     and 25 lead to a destination. Most arenas have 3–4 routes in. Walking a route fills it
     in like a progress bar (a checkpoint every 25 m, reached within 30 m; finished at 90 %).
     A finished route opens the zones at both ends as soon as one of them is open. The start
     zone (Centrum) is open from the beginning.
  4. **What a closed zone locks:** its rare creatures and field-ability layers ("too wild"),
     its trainers and its arena. Common creatures stay open everywhere (v1.7 rule).
  5. **Arenas** still go in badge order: arena _n_ takes a challenge when its zone is open
     and the player has badge _n − 1_. Level bands still follow badges.
  6. **New arena sites and theme order** (geography first; arenas 1–2 keep their themes):
     1 Kongens Have (Folk), 2 Næsbyhoved Slotsbanke (Stone), 3 Stige Ø (Water),
     4 H.C. Andersen Skoven (Grove), 5 Hollufgård / Sneglehøjen (Spirit), 6 Den Fynske
     Landsby (Fire), 7 Odense Zoo (Mixed), 8 Tusindårsskoven's hill (Storm). Each theme's
     spawn table, side goals and field-guide records move with it. The field abilities stay
     tied to badge numbers (Angler now comes from the Water arena).
  7. **Arena 3 leader:** the tuned Water team moves from arena 4 to arena 3 and keeps four
     creatures (levels 19–22) against a five-creature expected team (levels 21–22), instead
     of the table's three: with three, no level setting met the targets.
  8. **100 %** counts zones opened and badges, not every route (at least 117 km of walking;
     about 38 km reaches all 8 badges). If that is too much, the outer ring could open after
     badge 8 or cycled routes could count: to decide.
  9. **Fyn map:** a button on the Town Map opens a map of Fyn's municipalities; only
     Odense can be opened today (back to the Town Map). It shows each region's badges.
- **Reason / evidence:** owner request after the region sketch (two versions; the owner
  chose the whole municipality). The old layout was one long corridor in the inner city;
  this spreads arenas over the city, gives choices of route and rewards walking to the
  green areas.
- **Status:** open (built at the owner's request; fold into the GDD)

### P23. Route progress is saved as route checkpoints (privacy)

- **GDD section:** Data model / Privacy
- **Current text:** "The save holds no positions and no location history."
- **Proposed change:** add "Route progress is saved as the numbers of the checkpoints
  reached on each of the game's routes (no coordinates, no times, never sent anywhere). It
  shows which parts of the game's routes a player has walked."
- **Reason / evidence:** a route has to keep its progress between walks (P22). The owner
  chose this over losing half-walked routes when the app closes.
- **Status:** open (owner decision; fold into the GDD)
