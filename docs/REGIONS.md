# Regions

Every municipality on Fyn becomes its own region: a separate campaign with its own starters,
creatures, arenas, badges, routes and progress, like separate games in one app (P27). This
file tracks each region's state and the updates that may travel between regions. How to
build a region: [REGION-RECIPE.md](REGION-RECIPE.md).

## Where each region's files live

Nothing of one region is ever stored in another region's place, and the checks below fail
if two regions overlap.

| What             | Shared by every region                                                          | Per region (`<region>` = `odense`, `svendborg`)                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content          | `packages/data/content/shared/` (types, moves, items, field abilities, Fyn map) | `packages/data/content/<region>/` (species, spawns, trainers, player teams, goals, POIs, arenas, routes, zones, boundary, zone/district/border outlines) |
| Texts (da/en)    | `packages/data/i18n/shared/` (the app's UI)                                     | `packages/data/i18n/<region>/` (species, trainers, places, zones, routes, districts, badges, arena sites)                                                |
| Region file      | —                                                                               | `packages/data/region/<region>/` (region.json, version.json, hazards.json)                                                                               |
| Basemap          | —                                                                               | `apps/client/public/tiles/<region>.pmtiles`                                                                                                              |
| Builder settings | `tools/region-builder/src/config.ts`                                            | `tools/region-builder/src/regions/<region>.ts` (box, OSM name, routes, ferries)                                                                          |
| Badges           | —                                                                               | `packages/art/generated/badges/<region>_badge<n>.svg` (designs in `packages/art/src/badges.ts`)                                                          |
| Docs             | this file, the recipe                                                           | `docs/regions/<region>/` (CREATURES.md, TEAMS.md, spawn maps)                                                                                            |

**Rules, checked by `pnpm validate` (`checkSeparation`) and the tests:**

- Every id in a region starts with the region's prefix: Odense none (the first region),
  Svendborg `svb_` (zones, routes, POIs, trainers, species, goals, player teams). No id is
  used by two regions, and Odense ids never start with another region's prefix.
- A region's texts live only in its own text files and name only its own ids; the shared
  texts hold no region texts.
- Each region is validated on its own (`✓ odense …`, `✓ svendborg …`), from its own folders.
- Tools take `--region <id>` (default Odense) and only write into that region's folders:
  `pnpm --filter @oml/region-builder boundary|fetch|basemap --region svendborg`,
  `pnpm region:build --region svendborg`, `pnpm routes:build --region svendborg`.

## Regions

| Region                   | Level | State                                                                                     | GDD   | Region data                         | Basemap                    | Testers                          |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------- | ----- | ----------------------------------- | -------------------------- | -------------------------------- |
| Odense                   | R1.22 | Playable: open region (P28), arenas 1–8 in any order                                      | v1.19 | a38b19ead5ca                        | 24 Nov 2026 build, 16.2 MB | Odense residents (from Nov 2026) |
| Svendborg                | R1.4  | Playable (D181): open region (D195), arenas 1–8 in any order, 55 creatures, ferry islands | v1.19 | see `region/svendborg/version.json` | 24 Nov 2026 build, 12.1 MB | Svendborg residents (after R1)   |
| Other Fyn municipalities | —     | Shown on the Fyn map, not playable                                                        | —     | —                                   | —                          | —                                |

**Region level** `R<major>.<minor>`: the major number goes up when a region reaches a new
playable stage (R0 being built, R1 playable for testers, R2 field-tested); the minor number
counts content updates since. Bump it with every change to a region's content.

## Update pipeline

Not every update made in one region should go to the others at once, so updates queue here
and the owner decides.

1. **When an update is built** in any region (or in the shared app), add a row to the queue
   below: what it is (with its decision number), the region it was built in, the date, and a
   status for every region. The region it was built in is `done`; shared updates that every
   region gets automatically are `done` everywhere.
2. **Other regions start as `pending`**, unless the update can't apply there (`n/a`, with a
   reason).
3. **`pnpm regions:status`** counts each region's pending updates. When a region has **3 or
   more** pending, it prints the question for the owner: should these also come to that
   region, as they are, adapted, or not at all? Claude runs it after adding to the queue and
   asks the owner then; never decides on its own.
4. The owner's answer sets each status: `apply` (build it as it is), `adapt` (build a
   version that fits the region, with a note), `skip` (with a reason). Built ones become
   `done`.

Statuses: `pending` · `apply` · `adapt` · `done` · `skip` · `n/a` (a note may follow a colon).

## Update queue

| Update                                                                                      | From      | Date       | Odense                                                        | Svendborg                     |
| ------------------------------------------------------------------------------------------- | --------- | ---------- | ------------------------------------------------------------- | ----------------------------- |
| D177 One folder per region, id prefixes, separation checks, per-region tools and docs       | shared    | 2026-11-25 | done                                                          | done                          |
| D178 Every badge its own design (outline, emblem, colour)                                   | shared    | 2026-11-25 | done                                                          | done                          |
| D179 Ferry crossings (dotted, over water) to islands that open on arrival                   | svendborg | 2026-11-25 | n/a: Odense has no ferry islands                              | done                          |
| D170 More no-spawn areas (golf, allotments, care homes, worship, prisons, campsites)        | odense    | 2026-11-25 | done                                                          | done: built in from the start |
| D180 Campaigns per region (save v11, region from position, island arrival)                  | shared    | 2026-11-26 | done                                                          | done                          |
| D181 Svendborg playable: roster, spawns, trainers, balance; sim and spawn report per region | svendborg | 2026-11-26 | n/a: Svendborg content; the per-region tools cover Odense too | done                          |
| D182 Field guide by region (numbered list, tabs); arena stamps on the Town Map              | shared    | 2026-11-26 | done                                                          | done                          |
| D183 The Fyn map opens other regions' Town Maps to look at                                  | shared    | 2026-11-26 | done                                                          | done                          |
| D184 Town Map icons at every zoom; route labels filter                                      | shared    | 2026-11-26 | done                                                          | done                          |
| D185 Badges per region (tabs, Town Map button); field guide entry pages                     | shared    | 2026-11-26 | done                                                          | done                          |
| D186 AI heal and stat-lowering moves; leaders re-tuned                                      | shared    | 2026-11-26 | done                                                          | done                          |
| D187 Individual values; D188 Glimmer creatures                                              | shared    | 2026-11-26 | done                                                          | done                          |
| D189 Glimmer forms in the field guide, previous/next; save v12                              | shared    | 2026-11-26 | done                                                          | done                          |
| D190 Leaders heal and lower stats by chance; leaders re-tuned                               | shared    | 2026-11-26 | done                                                          | done                          |
| D191–D194 Open region (P28): no locks, scaled leaders and trainers, route finds and bonus   | odense    | 2026-11-26 | done                                                          | done (D195)                   |
| D196 UI round: Town Map tools, Goals by distance, bag, detail, camera, too-fast, install    | shared    | 2026-11-27 | done                                                          | done                          |
| D197 The coast: unclaimed coastal land and 200 m of sea in the outline                      | shared    | 2026-11-27 | done                                                          | done                          |

## Features

✅ done · 🟡 partly · ⬜ not yet · — not applicable

| Feature                                                                        | Kind                       | Decision         | Odense                | Svendborg                         |
| ------------------------------------------------------------------------------ | -------------------------- | ---------------- | --------------------- | --------------------------------- |
| Multi-region campaigns (separate saves, start a campaign on entering a region) | shared                     | P27, D180        | ✅                    | ✅                                |
| Region folders, id prefixes, separation checks                                 | shared                     | D177             | ✅                    | ✅                                |
| Boundary from OSM (`boundary` tool)                                            | per region                 | D177             | ✅                    | ✅ (12 pieces, 415 km²)           |
| Region file: biomes, no-spawn areas                                            | per region                 | D170             | ✅                    | ✅ (34,555 cells, 1.3 % no-spawn) |
| Zones in 8 districts, Town Map icons                                           | per region                 | P22              | ✅ (39)               | ✅ (44)                           |
| Routes that open zones when walked; checkpoints in the save                    | per region + shared        | P22, P23         | ✅ (50)               | ✅ (45)                           |
| Ferry crossings; islands open on arrival                                       | per region + shared        | D179, D180       | —                     | ✅ (3)                            |
| Region border, district and zone edges                                         | per region                 | D162             | ✅                    | ✅                                |
| Map frame (even 2 km edge) and basemap                                         | per region                 | D172             | ✅                    | ✅                                |
| Fyn map: the region can be opened                                              | per region                 | P22, D180        | ✅                    | ✅                                |
| Badges, each its own design                                                    | per region                 | D178             | ✅                    | ✅                                |
| Starters: 3 lines × 3 stages, a type triangle                                  | per region                 | D167, D181       | ✅ (Fire/Water/Grove) | ✅ (Water → Stone → Storm)        |
| Roster: ≈ 20 wild lines with rarities                                          | per region                 | D167, D181       | ✅ (20)               | ✅ (20)                           |
| Destinations: denser, rarer spawns                                             | per region (flag) + shared | D167             | ✅                    | ✅ (20,499 cells)                 |
| Destination creatures at 1–3 homes, one main home                              | per region                 | D171, D181       | ✅ (7)                | ✅ (7)                            |
| Field guide names the homes                                                    | shared                     | D173             | ✅                    | automatic with content            |
| Route trainers on every route (≈ 1 per 1.5 km)                                 | per region                 | D163, D168, D181 | ✅ (105)              | ✅ (102)                          |
| Arenas 1–8: junior + leader, POIs, badges, presets                             | per region                 | D168, D181       | ✅                    | ✅                                |
| Balance inside the leader targets (sim guard)                                  | per region                 | D168, D181       | ✅                    | ✅                                |
| Rest stops at arenas, towns and destinations                                   | per region                 | P22              | ✅ (24)               | ✅ (24, incl. the three islands)  |
| Markets at real shopping places, skilling                                      | per region + shared        | D165             | ✅ (9)                | ✅ (6)                            |
| Journal goals per district                                                     | per region                 | P18              | ✅                    | ✅                                |
| Field abilities Forager, Angler, Runereader (spawn layers)                     | per region                 | P1               | ✅                    | ✅                                |
| Field abilities Nightseer, Sealbreaker, Homing                                 | shared + per region        | —                | ⬜ (waiting for uses) | ⬜                                |
| POIs checked on site (`verified: true`)                                        | per region                 | —                | ⬜                    | ⬜                                |
| Region README with map, CREATURES and TEAMS docs                               | per region                 | D169, D179       | ✅                    | ✅ (and BALANCE.md)               |
| E2E: all arenas in order                                                       | per region                 | D168             | ✅                    | ✅ (svendborg.e2e.ts)             |
| Press-based POIs, Town Map stamps and filter                                   | shared                     | D165, D166       | ✅                    | automatic                         |
| Tester welcome, feedback, save import, version                                 | shared                     | D174–D176        | ✅                    | automatic                         |
| Championship after 8 badges, rematches                                         | per region                 | —                | ⬜                    | ⬜                                |
