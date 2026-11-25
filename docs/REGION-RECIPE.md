# Region recipe

How a municipality becomes a playable region, written from how Odense was built (GDD
v1.11–v1.16, decisions D155–D176). Follow it for every new region (Svendborg next), and
record each step's state in [REGIONS.md](REGIONS.md). A region is its own campaign: its own
starters, creatures, arenas, badges, routes and progress (P27). The engine, the type chart,
the battle rules, items and the app are shared.

Each step lists what to make, the tool that makes it, and the check that proves it is done.
"Odense:" notes say how Odense did it, or what went wrong there, so the next region can
skip the detour.

## 0. Before building: the region's design (owner decisions)

Write a backlog item in [GDD-PROPOSALS.md](GDD-PROPOSALS.md) with the proposals below and get
the owner's decisions before building; then move them into the GDD.

- **Character:** what the place is known for (Odense: H.C. Andersen, the river, the castle
  mound; Svendborg: harbour, sound, islands). Themes, names and trainers follow from it.
- **Eight arena sites and themes**, at public landmarks that suit the theme, spread so the
  badge path crosses the whole municipality as a loop from the start town. Arena 1 needs a
  type that is neutral for all three starters.
- **Badge names** (da/en), one per arena.
- **Starters:** three lines of three stages, a type triangle (each beats the next).
- **Roster:** about 20 wild lines of two or three stages, with rarities (common 6,
  uncommon 9, rare 4, very rare 1 in Odense), names from local words and folklore; checked
  against existing monster games and the franchise deny-list.
- **Destinations:** which forests, fields, lakes, beaches or islands get home creatures.
- **Special geography:** places reachable only by ferry or bridge, and how they open.

## 1. Boundary and region settings

- Municipality outline from OSM (administrative boundary), closed over harbours and inlets
  (400 m closing, D162) into `content/boundary.<region>.geojson`; the Fyn map's outline
  stays in `fyn.geojson`.
- Region settings in `tools/region-builder/src/config.ts`: bbox, Overpass tile grid,
  sample resolution.
- **Check:** the boundary includes harbours, canals and inner waters; islands that belong to
  the municipality are separate polygons.
- Odense: the first border cut the harbour out; closing fixed it.

## 2. Map data and region file

- `pnpm --filter @oml/region-builder fetch` (Overpass in cached tiles, mirror rotation,
  refused tiles split; generic User-Agent; never personal data in requests).
- `pnpm region:build` → `region/region.<region>.json`: H3 res-10 cells with district, zone,
  flags (no-spawn, wild, water edge, route, destination) and biome shares; zone, district
  and border outlines.
- No-spawn areas (D170): schools, kindergartens, childcare, hospitals, care homes,
  cemeteries, places of worship, prisons, allotments, golf courses, campsites, military,
  airports, railways, motorways. Playgrounds, open water, zoos and open-air museums stay
  open (owner).
- **Check:** `pnpm validate` (region ok), region-builder tests, about 3–5 % no-spawn cells.

## 3. Zones and districts

- `content/zones.<region>.json`: about 35–40 zones of four kinds (arena, town, wild,
  water), each with a centre, a district (1–8 = level band) and a Town Map icon (forest,
  field, lake, town). One start zone (the arena-1 zone).
- District level bands as in Odense: [3,8], [8,14], [13,20], [19,26], [25,32], [31,38],
  [37,44], [43,50].
- **Check:** validate (one arena zone per arena in its own district), the zone outlines
  look sensible on the Town Map.

## 4. Routes

- Route list in `tools/region-builder/src/route-lib.ts` (from, to, kind main/alt/explore),
  then `pnpm routes:build` (OSM foot network, avoids railways and motorways; may cross
  outside the region for at most 600 m, e.g. a causeway) and `pnpm region:build` again.
- About 50 routes: a badge path linking every arena in order, other ways, and routes out
  to the destinations. 25 m checkpoints; 90 % opens the zones at both ends.
- **Never change a published route's path:** saved progress is checkpoint numbers on it.
  Fix a route by adding a new one or before release.
- **Check:** validate (every zone reachable, route lengths and wild shares match the region),
  content test "the badge path links every arena in order".
- Odense: the Stige Ø causeway needed outside edges with a cost; long routes (13.6 km)
  were split.

## 5. Points of interest

- `content/pois.<region>.json`: arenas (80 m, at the sites), route trainers (about one per
  1.5 km, on their route), rest stops (every arena, town and main destination), markets (at
  real shopping places). Placed by script on valid spots: inside the zone, not in a
  no-spawn cell or blocked spot, 15 m from railways and motorways, circles not overlapping.
- All start `verified: false`; the owner checks each on site (public, step-free, away from
  roads) before testers go.
- **Check:** validate (every POI's own cell is its zone; no blocked spots).

## 6. Creatures

- Species with `rarity`, stats inside 240–400, learnsets of 4–8 moves (a level-1 move),
  evolution levels; da/en names; `pnpm art:build` for placeholder art and `assets.json`.
- Moves, types and items are shared; new moves only when a type lacks something.
- **Check:** validate, the franchise-terms test, art tests.

## 7. Spawn tables

- Per district: commons weight 25, uncommons 9 (one featured ×2), rares 2.5, very rares
  0.8; time of day; field-ability layers.
- Destination creatures (D171): `destinationOnly` with `zones` (1–3 homes, one main home);
  check the real share at the main home in CREATURES.md (common ≈ 30 %, uncommon 9–16 %,
  rare 6–11 %, very rare 3–4 %).
- **Check:** validate, `pnpm spawn:report` (destinations 70–110 m, other wild 100–170 m,
  routes 200–400 m, streets 300–450 m, destination walk 15–22, rares ≥ 2× in
  destinations), the docs test (main home really is where it spawns most).

## 8. Trainers, arenas and balance

- Route trainers: themed by place, levels inside the district band, evolved to fit,
  rewards (items + coins = highest level × 25).
- Arena n: a junior, then the leader (themed, levels at the top of the band), a reward;
  `player-teams.json` preset `arenaN` (one creature more than the leader, evolved like a
  player's).
- Tune with the sim (level offsets, then team changes where one creature decides a
  match-up): `pnpm sim:report`, guarded by `tools/sim/test/balance.test.ts` (neutral 40–60,
  advantage 75–90, disadvantage 15–30, ±5).
- Odense: a starter's third-stage type (Havodder as Water/Stone) broke a whole arena; check
  final-stage types against every leader.
- **Check:** balance test, the arena e2e (all arenas in order).

## 9. Journal, texts and docs

- Journal goals per district (`goals.json`), da/en texts for zones, routes, POIs,
  trainers (name, intro, defeated), badges, arena sites.
- `pnpm docs:content` → CREATURES and TEAMS docs for the region.
- **Check:** validate (same keys in da and en), docs test.

## 10. Basemap and maps

- `pnpm --filter @oml/region-builder basemap` → `apps/client/public/tiles/<region>.pmtiles`
  (every tile in the map frame up to zoom 13, near the border above it; D172).
- `MAP_FRAMES.<region>` = the region's bbox + 2 km (tested). The Fyn map makes the region
  pressable.
- **Check:** the Town Map at full zoom-out and in each corner; the play view near the
  border (fog, sky wall).

## 11. Spawn service and release

- The Worker serves the region (`?region=<id>`); bump `SPAWN_ALGORITHM` only when spawn
  code changes output.
- Full checks: lint, typecheck, validate, tests, spawn report, all e2e.
- Update GDD (version line), DECISIONS, PLAN and REGIONS.md (the region's feature level).

## Definition of done

A region is playable when: its campaign starts on entering the municipality (starter
choice), every arena can be beaten in order (e2e), the spawn report passes, the balance
test passes, every POI has been checked on site, and REGIONS.md shows it at the same
feature level as the reference region (or lists what differs on purpose).
