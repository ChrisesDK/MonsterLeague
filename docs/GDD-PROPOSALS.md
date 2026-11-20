# GDD proposals

Changes Claude Code proposes to the master GDD (docs/GDD.md is a read-only export). The
owner reviews each one; accepted proposals come back in a new GDD export, and then the
status here changes to `accepted` (or `rejected`, with a reason). P1–P7 were accepted in
GDD v1.2 (see its change log and git history).

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

### P8. Spawn example still uses retired names

- **GDD section:** Encounters and spawning → Example spawn table entry
- **Current text:** `{ "species": "cobble_crab", "district": 4, … "requires": "rock_smash" }`
- **Proposed change:**
  `{ "species": "brokrabbe", "district": 4, "weight": 10, "biomes": { "historic": 3.0, "urban": 1.0 }, "time": "any", "requires": "runereader" }`
- **Reason / evidence:** "rock_smash" is one of the Pokémon field-move names that accepted
  proposal P1 removed everywhere ("never used in code, data or text"); "cobble_crab" isn't
  a species id (the cobble-crab is `brokrabbe`). The franchise-term guard doesn't scan
  the GDD, so this slipped through.
- **Status:** open

### P9. Add "meadow" to the biome list

- **GDD section:** Encounters and spawning → Build time, step 3; Data model (`region.<id>.json`)
- **Current text:** "the share of each biome by area: Water, Forest, Park, Urban, Industrial, Farmland, Historic"
- **Proposed change:** "… Water, Forest, Park, Meadow (grass, meadow, heath, scrub), Farmland, Urban, Industrial, Historic". Also note that rivers mapped as lines count as water within 15 m (streams 5 m).
- **Reason / evidence:** The M2a brief and the GDD M2a checklist already include
  meadow/field. In Odense it is the third-largest biome (11 km² of 96), mostly grass along
  paths and the river, which would otherwise count as nothing.
- **Status:** open

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
- **Status:** open

### P11. "Railway tracks" excludes light rail and trams

- **GDD section:** Encounters and spawning → Build time, step 3
- **Current text:** "… or motorway/trunk roads" (rail tracks are in the M2a brief)
- **Proposed change:** add "railway tracks (heavy rail; not light rail or trams that run along streets)".
- **Reason / evidence:** Odense Letbane runs along main streets and squares that people
  walk every day; making those noSpawn would empty the city centre. Implemented this way
  (DECISIONS D63).
- **Status:** open
