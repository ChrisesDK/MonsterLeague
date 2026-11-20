# Odense Monster League — Game Design Document

Version 1.2 · 2026-11-20 · Christian. Mirror of the Claude doc; do not edit here, propose changes in docs/GDD-PROPOSALS.md.

## Overview

**Odense Monster League (working title) is a free, walk-to-play monster-collecting RPG: the city of Odense is the first region, with 8 arenas at its landmarks and real turn-based battles.** It is an original IP in the genre of the mainline monster RPGs, with no Pokémon content. The feasibility study and fun-test plan are in a separate design-and-plan doc (not mirrored in the repo).

| Item | Decision |
| --- | --- |
| Genre | Location-based, single-player monster RPG with turn-based battles |
| Platform v1 | Mobile web app (PWA), Android and iOS browsers; native app later |
| Price | Free; no ads, no paid items |
| Audience | 12+; players who grew up with handheld monster RPGs and like walking or cycling around their city |
| Session | 20–60 minute walks; battles of 1–3 minutes |
| v1 scope | One Odense district, 15 creatures, 4 trainers, 1 arena, 1 field ability (the "vertical slice") |
| Full Odense scope | 8 districts, \~35 creatures, \~30 trainers, 8 arenas, Odense Championship |
| Later tiers | Fyn (8 arenas), Denmark (8 arenas) as post-game expansions |

**Design pillars** — every feature must serve at least one:

1. **The city is the map.** Real places shape what you find and where you fight. Walking somewhere new should always pay off.
2. **Every turn is a decision.** Battles are short but never mindless: type match-ups, switching and items matter.
3. **A campaign, not a grind.** A clear path of 8 arenas with a story arc, not endless dailies.
4. **Play outdoors comfortably.** One thumb, pause any time, fights from a safe spot, works in the cold and dark.
5. **Local and original.** Danish folklore and fairy tales give the creatures and arenas their identity.

## Core loop and player experience

**Walk a district → meet creatures and trainers → battle → catch and level → heal at a rest stop → challenge the arena → earn a badge and field ability → the next district opens.**

1. **Explore.** The map shows the player, the current district boundary, rest stops, trainer markers and the arena. Wild encounters trigger as the player moves through biome cells (see Encounters).
2. **Battle.** A wild encounter or trainer opens the battle screen. Battles pause automatically if the app is backgrounded.
3. **Grow.** Winning gives XP; wild creatures can be caught. The team is up to 6 creatures; extras go to storage.
4. **Recover.** Rest stops fully heal the team and restock a few basic items once per hour.
5. **Challenge.** The arena is a fixed leader team with a type theme. Losing sends the player back with a clear lesson ("her creatures resist Fire").
6. **Unlock.** A badge raises the level cap for obedience, unlocks one field ability and opens the next district.

**First 15 minutes (onboarding):** choose one of three starter creatures at the first rest stop, walk \~200 m to a guaranteed first wild encounter, a tutorial catch, then a first trainer battle within 500 m. The player should have fought three battles and seen the arena marker before minute 15.

## World: Odense districts and progression

**Odense is split into 8 hand-drawn districts, each with one arena, opened in a fixed order that spirals out from the centre.** District boundaries are polygons drawn in a GeoJSON file. Wild creature levels and trainer strength rise with each district.

| # | District (draft) | Arena location | Arena theme | Wild levels | Field ability earned |
| --- | --- | --- | --- | --- | --- |
| 1 | Centrum / station | Kongens Have | Folk | 3–8 | — |
| 2 | Munkemose and the river | Munkemose | Water | 8–14 | Forager |
| 3 | H.C. Andersen quarter | H.C. Andersens Hus | Spirit | 13–20 | Angler |
| 4 | Old town and cathedral square | Skt. Knuds square | Stone | 19–26 | Runereader |
| 5 | Harbour | Havnebadet | Storm | 25–32 | Nightseer |
| 6 | Fruens Bøge | Fruens Bøge forest | Grove | 31–38 | Sealbreaker |
| 7 | Zoo and river south | Odense Zoo (outside) | Mixed | 37–44 | Homing (heal only) |
| 8 | Den Fynske Landsby | Den Fynske Landsby | Fire | 43–50 | — |

Rules:

- **No hard walls.** Every district is visible and walkable from day one. Before you unlock a district, its wild creatures are shown as "too wild to catch" and trainers refuse to battle ("come back with the Munkemose badge").
- **Home district.** v1 always starts in district 1. Later, a player may start anywhere and get a "home" starter route.
- **Championship.** After 8 badges, the Odense Championship is a 4-battle gauntlet at a central landmark (for example Rådhuset's square).

## Creatures, types and stats

**Seven types and four stats keep the system readable on a phone while leaving real match-up decisions.** Each creature has one or two types.

Type chart (attacker down, defender across; 2 = super effective, ½ = not very effective, 0 = no effect, blank = 1):

| Attack ↓ / Defend → | Folk | Fire | Water | Grove | Stone | Storm | Spirit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Folk |  |  |  |  | ½ |  | 0 |
| Fire |  | ½ | ½ | 2 | ½ |  |  |
| Water |  | 2 | ½ | ½ | 2 |  |  |
| Grove |  | ½ | 2 | ½ | 2 | ½ |  |
| Stone |  | 2 |  | ½ |  | 2 |  |
| Storm |  |  | 2 | 2 | ½ | ½ |  |
| Spirit | 0 |  |  |  |  |  | 2 |

The only immunities are Folk ↔ Spirit. Changes since v1.0: Storm → Stone went from 0 to ½ (M1.5), and Storm → Grove went from ½ to 2 (v1.1), so Grove has two weaknesses (Fire, Storm). Whether Grove is still the strongest defensive type is tracked in docs/BALANCE.md; as of M1.6, Bøgevætte still wins the most 1v1s (accepted proposal P6).

**Stats:** HP, Attack, Defence, Speed. Each species has base stats with a total of 240–400. Stat at level L = floor(base × 2 × L / 100) + 5. HP = floor(base × 3 × L / 100) + 2L + 10 (raised in M1.5 so battles last long enough to make decisions). There are no individual values or natures in v1. Stat stages run from −6 to +6, ×1.5 per stage up and ÷1.5 per stage down.

**Roster structure for the v1 slice (15 species):**

| Role | Count | Example concepts (original, folklore-inspired) |
| --- | --- | --- |
| Starters, 2-stage lines | 3 lines = 6 | Fire ember-cat, Water river-otter, Grove beech-sprite |
| Common early creatures | 4 | Folk pigeon, Folk rat, Grove beetle, Water duckling |
| Biome specials | 3 | Stone cobble-crab (historic), Storm gull (harbour), Spirit will-o'-wisp *lygtemand* (night) |
| Arena-only / rare | 2 | A *nisse* (Folk/Spirit), a young *lindorm* (Stone/Water) |

Every species needs: an ID, name, types, base stats, a learnset by level, catch rate, base XP, evolution rule, biome weights, and a sprite plus 3 animations (idle, attack, faint). Names must be original and checked against existing monster-game names before use.

**Current placeholder roster** (Danish names, all marked `placeholder: true` in `packages/data/content/species.json`, which is the source of truth for species data): starter lines Gnistkat → Bålkat (Fire), Åodder → Strømodder (Water), Bøgling → Bøgevætte (Grove), plus Grimælling, Rendsnude, Lygtling, Loftnisse, Søormling and others; 33 moves and 6 items.

**Coverage moves:** each starter line learns one move of another type early so it is never stuck with a single type: Fire learns Squall Slap (Storm, L12); Water and Grove learn Cobble Toss (Stone, L11 and L12). Søormling (Stone/Water) is a rare creature, kept off early arena teams.

## Battle system

**Singles, one creature out per side, four moves each, simultaneous action choice, resolved by priority then Speed.** The engine is deterministic: the same state, actions and seed always give the same result.

**Each turn:**

1. Both sides choose an action: *Move* (one of up to 4), *Switch*, *Item*, or *Run* (wild battles only), or Catch (throw a charm, wild battles only). The AI chooses at the same time.
2. Order: Switch, Item, Catch and Run go first, then moves by move priority, then by Speed; ties are broken by the seeded RNG.
3. Each move: accuracy roll → damage or effect → faint check. A fainted creature's pending move is cancelled.
4. End of turn: status damage (Burn, Poison) and status countdowns.
5. If a creature fainted, its owner picks a replacement (the AI picks immediately). A side with no usable creatures loses.

**Damage formula:**

```latex
\text{damage} = \left\lfloor \left( \frac{(2L/5 + 2) \cdot P \cdot A / D}{50} + 2 \right) \cdot \text{STAB} \cdot \text{type} \cdot \text{crit} \cdot r \right\rfloor
```

L = attacker level, P = move power, A = attacker Attack, D = defender Defence, STAB = 1.5 if the move's type matches the attacker, type = product of the chart values, crit = 1.5 with a 1/16 chance, r = random in \[0.85, 1.0\]. Minimum 1 damage unless the type value is 0.

**Moves:** id, name, type, power (0 for status moves), accuracy, PP, priority (−1 to +1), and an optional effect from a small fixed set: inflict status, raise or lower a stat by one stage (±1 to ±6 stages, ×1.5 per stage, ÷1.5 down), heal a % of max HP, recoil. Statuses in v1: Burn (½ Attack, 1/16 HP per turn), Poison (1/8 HP per turn), Sleep (1–3 turns), Paralysis (½ Speed, 25% skip).

**Length targets (sim, measured in M1.5):** equal-level neutral 1v1 median 4–6 turns (now 5); a neutral attack needs 4–6 hits to KO (now 5), a super-effective one 2–3 (now 3); leader fights currently take a median of 29–42 turns. Real-time targets outdoors: wild 1–2 min, trainer 2–3 min, arena at most 8 min. Gate 2 measures real time; if arenas run long, shorten animations and text first, then numbers.

**AI tiers:**

| Tier | Used by | Behaviour |
| --- | --- | --- |
| Wild | Wild creatures | Random legal move |
| Trainer | Route trainers | Highest expected damage, 20% random move; applies the set-up rule 50% of the time |
| Leader | Arena leaders | Expected damage, type-aware switching, up to 2 healing items below 30% HP, and always the set-up rule |

**Set-up rule:** use a stat-boost move if own HP > 70%, the stat is not boosted yet, and the opponent cannot KO next turn; use a status move if the target has no status. The AI does not use heal moves or opponent-stat-lowering moves in v1 (tested in M1.5: it made fights longer and pushed arenas off target). Individual leaders may get one of these as a signature tactic later. AI randomness uses a separate stream derived from the battle state, so AI choices are repeatable and do not consume the battle's random numbers.

**Battle log:** the engine emits a list of events (`move_used`, `damage`, `effectiveness`, `status`, `faint`, `switch`, `catch_attempt`...). The UI only animates events and never calculates results itself.

**Rule details:**

- **Running** (wild only): always succeeds if your active creature is faster; otherwise 50%, +25% per earlier failed attempt in the same battle.
- **Out of PP:** the creature uses Desperate Swing, a typeless attack with 25% recoil.
- **Sleep** lasts 1–3 blocked move attempts; the counter only drops on turns the creature tried to move.
- **Status moves ignore the type chart.** A damaging move with a 0× multiplier also skips its side effects.
- **Turn cap:** at turn 150 the side with more remaining HP (as a share of max) wins. No simulated battle reaches it.

**Balance targets and tooling:** `pnpm sim:report` writes `docs/BALANCE.md` (1v1 matrix at L10 and L25, every arena vs. its expected player team, and flags). The arena win-rate targets in the Arenas section are enforced by a test, so content changes that break them fail CI.

## Catching, levelling, evolution and items

**Catching rewards weakening a creature first; levelling follows a cubic curve; evolution is by level.**

**Catch chance** (one roll per throw):

```latex
p = \min\left(1,\; \frac{c}{255} \cdot \left(1 - \frac{2}{3} \cdot \frac{HP}{HP_{max}}\right) \cdot b_{\text{item}} \cdot b_{\text{status}}\right)
```

c = species catch rate (3–255), b\_item = 1 / 1.5 / 2 for the three catch items, b\_status = 1.5 if asleep or paralysed.

A charm is used up even when the catch fails. Catching is only possible in wild battles. If the team already has 6 creatures, the caught creature goes to storage (event `sent_to_storage` plus a log line).

**XP:** only the player's side gains XP. The creatures that took part split XP = floor(baseXP × L\_fainted / 7), ×1.5 for trainer and leader battles. XP needed to reach level n is n³ ("medium" curve). Level cap 50 in Odense.

**Obedience:** each badge raises the level a creature will obey to (badge 0: 15, then +5 per badge). A disobedient creature ignores orders 50% of the time. This stops over-levelling from one district trivialising the arenas.

**Moves and evolution:** moves are learned on level-up. With 4 moves already known, the player chooses which to forget (or skips) in a modal after the battle. AI, wild and simulated creatures auto-learn: keep the strongest attack of each type, fill free slots with support moves (newest first), then leftover attacks. Evolution happens at a fixed level, offered after the battle ("Evolve" / "Not now"). Learned moves, evolutions and stored creatures are saved from M2 on, when the save system exists.

**Items (v1):**

| Item | Effect | Where from |
| --- | --- | --- |
| Small / Large Tonic | Heal 20 / 60 HP | Rest stops, trainer rewards |
| Clear Drops | Cure status | Rest stops |
| Basic / Good / Great Charm | Catch item, ×1 / ×1.5 / ×2 | Rest stops; Good after badge 2, Great after badge 5 |
| Revive Leaf | Revive at 50% HP | Hidden items, arena rewards |

There is no shop and no currency in v1: rest stops give a free restock once per hour (for example 5 Basic Charms, 2 Small Tonics). This keeps walking as the only resource loop.

## Encounters and spawning

**Spawns are deterministic per H3 cell and 15-minute time window, computed on the device from a precomputed region file, so every player at the same place and time sees the same creatures without a server.**

**Build time (region builder):**

1. Fetch OSM features for the region (land use, natural, water, leisure, historic, amenity, highways).
2. Cover the region with H3 cells at resolution 10 (about 65 m edge, \~15,000 m² per cell).
3. For each cell, compute the share of each biome by area: Water, Forest, Park, Urban, Industrial, Farmland, Historic. Mark the cell `noSpawn` if it overlaps schools, cemeteries, hospitals, military areas, airports, or motorway/trunk roads.
4. Assign each cell to a district from the district polygons.
5. Write `region.json`: cells → {district, biomes, noSpawn}, plus arenas, trainers, rest stops.

**Run time (on the device):**

1. Every GPS update, find the player's H3 cell. Ignore updates with accuracy worse than 50 m.
2. Count walked distance; travel above 25 km/h counts as zero (no spawns from cars and buses).
3. Each new cell entered: roll an encounter with chance 1/6 (tunable), seeded by `hash(cellId, timeWindow, playerSeed)`.
4. Pick the species from the district's spawn table, weighted by the cell's biome shares, the time of day (day/night) and unlocked field abilities.
5. Level = random within the district's band.

Guarantees: at least one encounter per 300 m walked (pity counter), no encounter within 30 m of the previous one, and the first walk follows the onboarding script.

**Example spawn table entry:**

```json
{ "species": "cobble_crab", "district": 4, "weight": 10,
  "biomes": { "historic": 3.0, "urban": 1.0 }, "time": "any", "requires": "rock_smash" }
```

## Arenas, trainers, rest stops and field abilities

**Points of interest are fixed, hand-placed in data, and each has an interaction radius so players can stand somewhere safe.**

| Point | Radius | Interaction | Repeatable |
| --- | --- | --- | --- |
| Arena | 80 m | Leader battle; 1–2 junior trainers first | Leader rematch after the Championship |
| Trainer | 50 m | One battle, 1–3 creatures, reward item | Once |
| Rest stop | 40 m | Full heal, item restock once an hour | Yes |
| Hidden item | 30 m | Pick up an item; some need a field ability | Once |

**Arena leaders.** Each has a name, a personality tied to the place, a 2–6 creature team on its type theme (see Arena difficulty), one signature tactic (for example the Water leader sets up rain-like Speed boosts) and a short pre- and post-battle line. Losing keeps all XP gained.

**Arena difficulty.** The leader team grows by about +6 levels per arena and +1 creature every two arenas. The *expected player team* (used by the sim and by level design) is one creature more than the leader, at the same levels.

| Arena | Theme | Leader team | Leader levels | Expected player team | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Folk | 2 (Rendsnude, Loftnisse) | 9–10 | 3 at L9–10 | Built, on target |
| 2 | Water | 3, two carry a Fire move | 13–15 | 4 at L13–15 | Built, on target |
| 3 | Spirit | 3 | 19–21 | 4 | Planned |
| 4 | Stone | 4 | 25–27 | 5 | Planned |
| 5 | Storm | 4 | 31–33 | 5 | Planned |
| 6 | Grove | 5 | 37–39 | 6 | Planned |
| 7 | Mixed | 5, ace Søormling | 43–45 | 6 | Planned |
| 8 | Fire | 6 | 48–50 | 6 | Planned |

**Win-rate targets** for the expected player team vs. the leader, measured with `pnpm sim:report`: 40–60% with neutral types, 75–90% with a type advantage, 15–30% with a disadvantage, never 0%. Measured in M1.5: arena 1 at 53–55% for all three starters; arena 2 at 27% (Fire), 47% (Water), 85% (Grove). Route trainers have no target, but should be beatable by the expected team for their district.

**Field abilities** are taught to a team member and take one of its 4 move slots. A creature must be *in the team* for the ability to work.

| Ability (en / da) | Requirement | Effect |
| --- | --- | --- |
| Forager / Sanker | Badge 2, Grove or Folk creature | Forest/park cells add rare Grove spawns; hedge items |
| Angler / Lystfisker | Badge 3, Water creature | Encounter button in water-adjacent cells, Water spawns |
| Runereader / Runelæser | Badge 4, Stone or Folk creature | Historic-cell spawns and stone-landmark items (a nod to Danish rune stones) |
| Nightseer / Natteøje | Badge 5, Spirit or Storm creature | Night spawn table unlocked after sunset |
| Sealbreaker / Seglbryder | Badge 6, Stone or Folk creature | Unlocks sealed trainers and the arena-7 junior gauntlet |
| Homing / Hjemfinder | Badge 7, Storm creature | Return to *heal* at a visited rest stop; never to battle or catch |

Field-ability names are original. The names used by the Pokémon games for their field moves (Cut, Fly, Strength, Rock Smash, Surf, Flash and similar) are never used in code, data or text (accepted proposal P1).

Locked layers are shown on the map (rustling trees, rings on water, a stone glyph) with the label "needs Forager" etc.

## Screens and UX

**Nine screens plus post-battle modals (learn move, evolve) cover v1; the map and the battle screen get almost all of the polish.**

| Screen | Purpose | Key elements |
| --- | --- | --- |
| Map | Main screen while walking | Player dot + accuracy ring, district border, POI markers, encounter toast, team HP strip, menu button |
| Battle | Turn-based fight | Both creatures with HP bars and status; 2×2 move grid in the bottom third; Switch / Bag / Run row; event text line |
| Team | View and order up to 6 creatures | Cards with HP, level, types; tap for details, moves, field ability |
| Creature detail | Stats and moves | Stats, types, XP bar, moves with type/power/PP, evolution hint |
| Storage | Creatures beyond 6 | Grid, swap into team |
| Bag | Items | Grouped list, use from map or battle |
| Field guide | Collection | Seen / caught per district, biome hints ("found near water at night") |
| Badges and progress | Campaign | 8 badge slots, next arena and its distance |
| Settings | Safety and comfort | Units, sound, reduce motion, text size, data export/delete, safety reminder |

UX rules:

- Everything that matters during a battle sits in the bottom 40% of the screen; tap targets at least 48 px.
- The map never asks for input while the player is moving faster than walking pace.
- Any battle can be left and resumed later with the exact same state.
- Encounters are announced by vibration + a toast; the player taps to start, so nothing forces them to stop in the street.

## Art, audio and tone

**A warm, storybook look: Nordic folklore filtered through H.C. Andersen paper-cuts, readable on a small screen in daylight.**

- **Creatures:** 2D sprites at 128–256 px with simple bone or frame animation (idle, attack, hit, faint). Strong silhouettes and one dominant colour per type.
- **Map:** a custom MapLibre style in muted paper tones; water and parks clearly coloured because they matter for spawns; buildings flat. POI icons as small illustrated stamps.
- **Battle backgrounds:** one per biome (river, forest, old town, harbour, park, farmland, night).
- **UI:** large type, high contrast, type colours always paired with an icon or label (colour-blind safe).
- **Audio:** short loops per district, a battle theme, a leader theme; strong hit and catch sounds. Sound off by default outdoors; haptics on.
- **Tone and writing:** gentle and witty, like a fairy tale narrator. All text in Danish and English from the start (i18n keys, no hard-coded strings).
- **Placeholders:** CC0 assets (for example Kenney or Quaternius) or simple coloured shapes until the fun test passes. No Pokémon assets, ever.

## Technical architecture

**A TypeScript monorepo: offline tools build the region data, pure packages hold the game rules, and a PWA client runs everything on the phone with no game server in v1.**

Architecture diagram (in the Claude doc): **Build time (`tools/`)**: OpenStreetMap data → `region-builder` (H3 biome cells, POIs) → `region.odense.json`; Protomaps extract → `odense.pmtiles`. **Shared packages (`packages/`)**: `data` (JSON + Zod, feeds engine and spawn), `engine` (pure, seeded battles), `spawn` (cell lookup, seeded encounter rolls). **Phone (`apps/client`, PWA)**: map screen (MapLibre + PMTiles, GPS), battle screen (animates engine events), save (IndexedDB). The client imports the packages; the region file and PMTiles are served as static files and cached offline.

The battle engine is the heart of the game and has no dependency on the browser, the map or React, so it can be unit-tested, simulated in bulk, and later ported to C# if a Unity client is built.

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces |
| Client | Vite + React, MapLibre GL JS, `pmtiles`, `vite-plugin-pwa`, IndexedDB via `idb-keyval` |
| Spatial | `h3-js`, `@turf/turf`, `osmtogeojson` |
| Validation | Zod |
| Tests | Vitest; property tests with `fast-check` for the engine |
| CI / hosting | GitHub Actions; a static host for the client and data files |

## Data model

**All game content is data (JSON validated by Zod schemas); all player progress is one versioned save object stored on the device.**

The table says what each file must hold. **The exact field names live in code** and win over this doc: content schemas in `packages/data/src/schemas.ts`, engine and save types in `packages/engine/src/types.ts` (accepted proposals P3 and P4). Change the GDD only when the *meaning* changes, not for a renamed field.

| File / type | Holds | Key fields |
| --- | --- | --- |
| `types.json` | The type chart | types\[\], matrix\[attacker\]\[defender\] |
| `species.json` | Creature species | id, name (i18n key), types, baseStats {hp, atk, def, spd}, catchRate, baseXp, learnset \[{level, moveId}\], evolution {level, into}, sprite |
| `moves.json` | Moves | id, name, type, power, accuracy, pp, priority, effect? {kind, chance, target, stat?, stages?, status?, percent?} |
| `items.json` | Items | id, kind (heal, cure, catch, revive), value |
| `trainers.json` | Trainers and leaders | id, name, poiId, aiTier, team \[{species, level, moves}\], reward, lines |
| `spawns.json` | Spawn tables | species, district, weight, biomes {}, time, requires? |
| `region.<id>.json` | Built by the region builder | cells {h3Id: {district, biomes, noSpawn}}, pois \[{id, kind, lat, lng, radius}\], districts |
| `odense.pmtiles` | Map tiles | Extract of the Protomaps basemap for the Odense area |

**Runtime state:** a battle state holds the turn number, the RNG state, both sides (team, active creature, stat stages, statuses, items) and the result. A creature instance holds its species, level, XP, HP, status, moves with PP, and an optional nickname. The save holds the player seed, team, storage, bag, badges, defeated trainers, seen and caught lists, rest-stop restock times and any active battle. See the code for exact types.

The save never stores a location history: only progress. It is versioned so migrations are explicit.

## Safety, privacy and accessibility

**These are requirements, not polish: each one has a test or a review step before the field test.**

- **Placement.** No POI or spawn inside no-spawn cells. Every arena, trainer and rest stop is checked on site, on public ground, away from road edges.
- **Movement.** No encounters or prompts above 25 km/h; a "stay aware of your surroundings" screen at launch; no feature that rewards going out at night alone (night spawns are a layer, never required for progress).
- **Privacy (GDPR).** Location is processed only on the device. No location is sent to a server in v1. Field-test telemetry is opt-in, anonymous, and records game events (battle started, arena won) without coordinates. Players can export and delete their save.
- **Age.** Rated 12+; no chat or player-to-player contact in v1.
- **Accessibility.** Colour-blind-safe types (icon + label), scalable text, reduce-motion setting, full screen-reader labels on battle controls, no time limits on turns.
- **Attribution.** "© OpenStreetMap contributors" and the Protomaps credit visible on the map at all times.

## Development plan

**Milestones over 12 weeks, with two playtest gates, ending in a two-week field test; each milestone has a done-criterion and only starts when the previous one is met.** The paper playtest (weeks 1–2) runs alongside M0 and needs no code.

| Milestone | Weeks | Goal | Done when | Status |
| --- | --- | --- | --- | --- |
| M0 — Foundations | 1–2 | Monorepo, tooling, schemas, placeholder content | `pnpm test` and `pnpm build` pass in CI; 15 species, 30 moves and the type chart validate | Done |
| M1 — Battle engine + battle prototype | 3–5 | A full battle playable on a phone | Engine coverage ≥ 90%; 10,000 simulated battles without errors; battle test page on a phone | Done (99.9% coverage) |
| M1.5 — Balance pass | 3–5 | Battles long enough to decide; arenas on target | Neutral 1v1 median 4–6 turns; arena win-rate targets met and tested in CI | Done |
| M1.6 — GDD sync + playtest kit | 5 | Shared GDD in the repo; tools to run Gate 2 outdoors | `docs/GDD.md` matches this doc; v1.1 type change re-balanced; testers can play on their own phones and export timings and ratings | Done (142 tests) |
| Gate 2 — Outdoor battle test | 5–6 | Are battles fun standing on a street? | Testers rate battles 4+/5; wild under 2 min, trainer under 3 min, arena under 8 min | Next |
| M2 — District slice | 6–9 | Walkable district with spawns, trainers, an arena | A tester can walk the district, catch, beat 4 trainers and the arena; works offline after first load | After Gate 2 |
| M3 — Field-test build | 10–12 | Stable, installable build for 15–25 testers | Installable PWA, opt-in telemetry, feedback button, no blocker bugs for 3 days | Planned |

**M0 — Foundations**

- [x] pnpm monorepo: `packages/engine`, `packages/data`, `packages/spawn`, `tools/region-builder`, `apps/client`
- [x] TypeScript strict, ESLint + Prettier, Vitest, GitHub Actions CI
- [x] `CLAUDE.md` with architecture, rules (no Pokémon content, engine is pure), and commands
- [x] Zod schemas for types, species, moves, items, trainers, spawns; a `validate` script
- [x] Placeholder content: 7-type chart, 15 species, \~30 moves, 6 items

**M1 — Battle engine and battle prototype**

- [x] Seeded RNG (sfc32 or mulberry32) with serialisable state
- [x] `createBattle`, `getLegalActions`, `resolveTurn` → {state, events}; immutable state
- [x] Damage, type chart, STAB, crits, accuracy, priority, Speed order, statuses, stat stages
- [x] Switching, items, catching, running, XP, level-up, move learning, evolution trigger
- [x] AI tiers: wild, trainer, leader
- [x] `sim` CLI: run N battles between teams and print win rates and turn counts
- [x] Client battle screen (React) driven only by engine events; test page with fixed teams

**M1.5 — Balance pass** (done; details in `docs/DECISIONS.md` D28–D41 and `docs/BALANCE.md`)

- [x] `pnpm sim:report` and a CI test for arena win-rate targets
- [x] HP formula raised; Storm → Stone ½; coverage moves; auto-learn rule
- [x] Arena 1 and 2 leaders; expected player-team presets
- [x] AI set-up rule, running rule, full-team catch to storage, turn cap 150
- [x] Post-battle learn-move and evolve modals

**M1.6 — GDD sync and playtest kit**

- [x] Add `docs/GDD.md` (export of this doc) and make CLAUDE.md point to it as the design source of truth
- [x] Apply v1.1: Storm → Grove = 2; re-run `sim:report`; keep all arena targets green
- [x] Playtest mode: tester code, per-battle real-time timer and turn count, a 1–5 rating plus optional comment after each battle, stored locally
- [x] Export results as JSON/CSV (share or copy button); no location data
- [x] Text and animation speed setting (normal / fast)
- [x] Deploy the client to a static host so testers can open it on their own phones outdoors

M1.6 also added the GDD audit with proposals P1–P7 (all accepted in v1.2), Revive Leaf, auto-pause in the background, offline support after the first load, a hidden developer battle page at `#/dev`, `docs/GATE2.md` (facilitator script) and `pnpm gate2:report`. The deploy workflow is prepared but not yet published.

**Gate 2 — Outdoor battle test** (follow `docs/GATE2.md`)

- [ ] Sync GDD v1.2 into the repo and apply the P1 rename and term guard (prompt M1.7)
- [ ] Choose hosting: public GitHub Pages (code becomes public) or a private repo on Cloudflare Pages / Netlify
- [ ] Deploy and open the link on 2–3 phones, Android and iOS
- [ ] Recruit 6–10 testers; schedule sessions in daylight and one after dark
- [ ] Run the sessions, collect exports, run `pnpm gate2:report`
- [ ] Decide: pass (go to M2), tune timings, or rework battles

**M2 — District slice**

- [ ] Region builder: Overpass query → GeoJSON → H3 res-10 biome cells → `region.odense.json`
- [ ] District 1 polygon, POIs (1 arena, 4 trainers, 2 rest stops) placed by hand
- [ ] PMTiles extract for Odense and a custom MapLibre style
- [ ] Map screen with GPS, accuracy filter, speed filter, and a **dev GPS simulator** (replay a GPX walk)
- [ ] Spawn rolls per cell + time window, pity counter, encounter toast
- [ ] Save/load in IndexedDB; team, bag, storage, field guide screens
- [ ] Trainers, rest stops, arena leader, badge, Forager as the first field ability

**M3 — Field-test build**

- [ ] PWA manifest, offline caching of tiles and region file
- [ ] Onboarding script, safety screen, settings
- [ ] Opt-in event telemetry without coordinates; in-app feedback form
- [ ] Deploy to a static host (for example Cloudflare Pages or GitHub Pages)
- [ ] Test on 3 Android and 2 iOS phones outdoors

## Open questions

- [ ] Final game name and a check that it is free to use (trademark search, app stores, domain)
- [ ] Are 30–40-turn leader fights acceptable outdoors? Answer with Gate 2 timings before changing numbers.
- [ ] Should individual leaders get heal or opponent-debuff moves as a signature tactic?
- [ ] Is 1/6 per new cell the right encounter rate, or should it scale with walking speed?
- [ ] Should the Championship and later tiers allow asynchronous battles against other players' saved teams?
- [ ] Native app later: Unity (C#, 3D, AR) or Flutter (2D, MapLibre)? Decide after M3.
- [ ] Which district is the best test area: Centrum (dense, many landmarks) or Munkemose and the river (more biomes)?
- [ ] How to handle players who move away from Odense mid-campaign: a "home city" generator for other towns?
- [ ] Art: draw it yourself, commission, or partner with an illustration student?
- [ ] Real type icons to replace the 3-letter codes (ILD, VND...)

## Change log and how this doc stays in sync

**This doc is the design source of truth; `docs/GDD.md` in the repo is an exported copy.** Implementation detail lives in `docs/DECISIONS.md`. When development produces a design decision, it is folded into this doc, the version goes up, and a fresh export replaces `docs/GDD.md`. Claude Code never edits `docs/GDD.md` directly; it proposes design changes in `docs/GDD-PROPOSALS.md`.

| Version | Date | Changes |
| --- | --- | --- |
| 1.2 | 2026-11-20 | Accepted P1–P7 from M1.6: original field-ability names (Forager, Angler, Runereader, Nightseer, Sealbreaker, Homing), Catch and Run in the turn order, data model defers field names to code, leader teams 2–6, Grove defensive strength tracked in BALANCE.md, "Bag" button; M1.6 marked done, Gate 2 checklist added |
| 1.1 | 2026-11-20 | Folded in M1 and M1.5: HP formula, Storm → Stone ½, Storm → Grove 2 (new), coverage moves, auto-learn rule, AI set-up rule, running, full-team catch, turn cap 150, arena difficulty table and win-rate targets, balance tooling, M1.6 and Gate 2 added to the plan |
| 1.0 | 2026-11-20 | First version |
