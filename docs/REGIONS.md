# Regions

Every municipality on Fyn becomes its own region: a separate campaign with its own starters,
creatures, arenas, badges, routes and progress, like separate games in one app (P27). This
file tracks each region's state, so that what is built in one region is brought to the
others (or replaced by something similar on purpose). How to build a region:
[REGION-RECIPE.md](REGION-RECIPE.md).

## How to keep this current

- **Region level** `R<major>.<minor>`: the major number goes up when a region reaches a new
  playable stage (R0 planned, R1 playable for testers, R2 field-tested); the minor number
  counts content updates since. Bump it with every change to a region's content.
- **When a feature is built** (in any region), add a row below. Mark it **shared** when it
  lives in the app or the rules (every region gets it automatically) or **per region**
  when each region needs its own content for it; then tick it per region as it lands.
- When a region update changes generated data, note the new region data version
  (`region/region.<id>.version.json`).

## Regions

| Region                   | Level | State                                | GDD   | Region data  | Basemap                    | Testers                          |
| ------------------------ | ----- | ------------------------------------ | ----- | ------------ | -------------------------- | -------------------------------- |
| Odense                   | R1.16 | Playable: whole campaign, arenas 1–8 | v1.16 | d67730978603 | 24 Nov 2026 build, 16.2 MB | Odense residents (from Nov 2026) |
| Svendborg                | R0    | Planned (P27)                        | —     | —            | —                          | Svendborg residents (after R1)   |
| Other Fyn municipalities | —     | Shown on the Fyn map, not playable   | —     | —            | —                          | —                                |

## Features

✅ done · 🟡 partly · ⬜ not yet · — not applicable

| Feature                                                                                               | Kind                       | Decision   | Odense                | Svendborg                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------- | ---------- | --------------------- | --------------------------- |
| Multi-region campaigns (separate saves, start a campaign on entering a region)                        | shared                     | P27        | ⬜                    | ⬜                          |
| Region file: biomes, no-spawn areas (incl. golf, allotments, care homes, worship, prisons, campsites) | per region                 | D170       | ✅                    | ⬜                          |
| Zones (≈ 39) in 8 districts, Town Map icons                                                           | per region                 | P22        | ✅                    | ⬜                          |
| Routes (≈ 50) that open zones when walked; checkpoints in the save                                    | per region + shared        | P22, P23   | ✅                    | ⬜                          |
| Region border, district and zone edges                                                                | per region                 | D162       | ✅                    | ⬜                          |
| Map frame (even 2 km edge) and basemap                                                                | per region                 | D172       | ✅                    | ⬜                          |
| Fyn map: the region can be opened                                                                     | per region                 | P22        | ✅                    | ⬜                          |
| Starters: 3 lines × 3 stages, a type triangle                                                         | per region                 | D167       | ✅                    | ⬜                          |
| Roster: ≈ 20 wild lines with rarities                                                                 | per region                 | D167       | ✅ (20)               | ⬜                          |
| Destinations: denser, rarer spawns                                                                    | per region (flag) + shared | D167       | ✅                    | ⬜                          |
| Destination creatures at 1–3 homes, one main home                                                     | per region                 | D171       | ✅ (7)                | ⬜                          |
| Field guide names the homes                                                                           | shared                     | D173       | ✅                    | ⬜ (automatic with content) |
| Route trainers on every route (≈ 1 per 1.5 km)                                                        | per region                 | D163, D168 | ✅ (105)              | ⬜                          |
| Arenas 1–8: junior + leader, POIs, badges, presets                                                    | per region                 | D168       | ✅                    | ⬜                          |
| Balance inside the leader targets (sim guard)                                                         | per region                 | D168       | ✅                    | ⬜                          |
| Rest stops at arenas, towns and destinations                                                          | per region                 | P22        | ✅ (24)               | ⬜                          |
| Markets at real shopping places, skilling                                                             | per region + shared        | D165       | ✅ (9)                | ⬜                          |
| Journal goals per district                                                                            | per region                 | P18        | ✅                    | ⬜                          |
| Field abilities Forager, Angler, Runereader (spawn layers)                                            | per region                 | P1         | ✅                    | ⬜                          |
| Field abilities Nightseer, Sealbreaker, Homing                                                        | shared + per region        | —          | ⬜ (waiting for uses) | ⬜                          |
| POIs checked on site (`verified: true`)                                                               | per region                 | —          | ⬜                    | ⬜                          |
| CREATURES and TEAMS docs                                                                              | per region                 | D169       | ✅                    | ⬜                          |
| E2E: all arenas in order                                                                              | per region                 | D168       | ✅                    | ⬜                          |
| Press-based POIs, Town Map stamps and filter                                                          | shared                     | D165, D166 | ✅                    | automatic                   |
| Tester welcome, feedback, save import, version                                                        | shared                     | D174–D176  | ✅                    | automatic                   |
| Championship after 8 badges, rematches                                                                | per region                 | —          | ⬜                    | ⬜                          |
