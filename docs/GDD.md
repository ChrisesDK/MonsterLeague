# Odense Monster League — Game Design Document

Version 1.18 · Nov 26, 2026 · maintained in the repository (see Change log)

## Overview

**Monster League (working title; "Odense Monster League" until v1.10) is a free, walk-to-play monster-collecting RPG: Odense Kommune is the first region, with 8 arenas at its landmarks, routes that open the region as you walk them, and real turn-based battles.** It is an original IP in the genre of the mainline monster RPGs, with no Pokémon content. The feasibility study and fun-test plan are in Doc.

| Item | Decision |
| --- | --- |
| Genre | Location-based, single-player monster RPG with turn-based battles |
| Platform v1 | Mobile web app (PWA), Android and iOS browsers; native app later |
| Price | Free; no ads, no paid items |
| Audience | 12+; players who grew up with handheld monster RPGs and like walking or cycling around their city. A region's campaign is made mainly for its residents; tourism content comes later |
| Session | 20–60 minute walks; battles of 1–3 minutes |
| Campaign length | 14–30 days of play per region: about 38 km of walking to all 8 badges in Odense, at least 117 km to open every zone (a season's goal) |
| v1 scope | One Odense district, 15 creatures, 4 trainers, 1 arena, 1 field ability (the "vertical slice") |
| Full Odense scope | Odense Kommune: 39 zones in 8 districts, 50 routes, \~110 route trainers, 24 rest stops, \~35 creatures, 8 arenas, Odense Championship |
| Later tiers | Fyn's other municipalities as regions of their own (8 arenas each, chosen on the Fyn map), then Denmark; leaderboards (for example longest distance walked) and a competitive scene for players with all 8 badges |

**Design pillars** — every feature must serve at least one:

1. **The city is the map.** Real places shape what you find and where you fight. Walking somewhere new should always pay off.
2. **Every turn is a decision.** Battles are short but never mindless: type match-ups, switching and items matter.
3. **A campaign, not a grind.** A clear path of 8 arenas with a story arc, not endless dailies.
4. **Play outdoors comfortably.** One thumb, pause any time, fights from a safe spot, works in the cold and dark.
5. **Local and original.** Danish folklore and fairy tales give the creatures and arenas their identity.

## Core loop and player experience

**Walk a route → it fills in and opens the zone it leads to → meet creatures and trainers → battle → catch and level → heal at a rest stop → challenge the arena → earn a badge and field ability → the next arena takes a challenge.**

1. **Explore.** The map shows the player, zone and region borders, routes (dashed, solid where walked), rest stops, trainer markers and arenas. Wild creatures appear on the map around the player, the same for everyone nearby, and the player taps one to battle it (see Encounters).
2. **Battle.** A wild encounter or trainer opens the battle screen. Battles pause automatically if the app is backgrounded.
3. **Grow.** Winning gives XP; wild creatures can be caught. The team is up to 6 creatures; extras go to storage.
4. **Recover.** Rest stops fully heal the team and restock a few basic items once per hour.
5. **Challenge.** The arena is a fixed leader team with a type theme. Losing leaves the whole team fainted, so the player must walk to a rest stop, use items, or wait: creatures that have been fainted for 8 hours recover fully on their own (accepted P19), before battling again, and comes back with a clear lesson ("her creatures resist Fire").
6. **Unlock.** A badge raises the level cap for obedience, unlocks one field ability and lets the next arena take a challenge once its zone is open. Walking routes opens zones (see World).

**First 15 minutes (onboarding):** choose one of three starter creatures wherever the player opens the game; a personal tutorial creature (visible only to that player, not a shared spawn) appears 100–200 m away on a spawnable spot for a guided first battle and catch; then the map points the way to Centrum (the start zone), its nearest rest stop and first trainer. The player should have fought three battles and seen the arena marker before minute 15.

**Onboarding details (accepted P13):** starters begin at level 5; the starting bag holds 5 Basic Charms and 2 Small Tonics; the tutorial creature is level 3 and easy to catch. The tutorial only ends with a catch: if the creature gets away or wins, the team is healed, up to 3 charms are given back, and a new tutorial creature appears.

## Game feel: a mainline game, served like a walking game

**The aim is the feel of a mainline monster RPG (routes, tall grass, trainers, towns, badges, a Town Map) delivered through a walking-game view (a tilted map following the player, creatures visible around you).** Original look and layout throughout; no copying of any existing game's interface.

|  | Walking games (Pokémon GO) | Mainline games (Switch era) | This game |
| --- | --- | --- | --- |
| World view | Tilted map following the avatar, limited zoom | 3D world plus a Town Map | Tilted map following the player, limited zoom; a separate Town Map |
| Where creatures live | Everywhere | Only grass, water, caves; none in towns | Everywhere, but sparse in streets ("towns") and dense in wild areas ("tall grass"), which the map draws as grass and ripples |
| Encounters | Many, seconds each | Near-constant in grass, about a minute each | Visible creatures; fewer battles than walking games because each is a real 1–2 minute fight |
| Structure | No story or routes | Towns linked by routes with trainers | Numbered routes between zones along real paths, with trainers on them; walking a route opens the zone it leads to |
| Guidance | Little | Story objectives, map markers | A Journal with the next goal always on screen |

**Map view (accepted P20).** The camera always looks at the player and never pans; there is no recentre button. Dragging rotates the view around the player by exactly the angle the finger sweeps around it, near or far, so the view always follows the finger; a quick swipe keeps turning briefly, and a two-finger twist works too. Pinching or the scroll wheel zooms on the player (zoom about 16.5–18.5): zoomed out the camera looks almost straight down (30°), and zooming in tilts it up to 76° and moves the player lower on the screen (to 60% of the way down), so zooming in means looking ahead. A compass button turns north up. When the GPS position changes, the player slides to it instead of jumping; the figure ignores GPS drift under 3 m, so it stands still when you do.

- **The edge of the world and the sky:** the world is a round patch around the player that ends in sky at a fixed distance, the same at every zoom: 1,200 m by default, 800–1,400 m with the setting "How far you can see". The edge is a tall wall that is the sky itself: haze at the foot, the day or night sky higher up, and at night the stars, fixed on it so they move with the skyline. Buildings inside stand in front of it, everything behind it is hidden, and the last 150 m of ground blend into the haze. 3D buildings (a setting, off by default, drawn at about half their real height so the street stays visible) load and unload at the edge.
- **Creatures** are drawn up to 200 m away in their own colours. A dashed 40 m ring around the player shows the battle range: creatures beyond it are a little see-through, creatures within it solid with a soft glow, and the phone vibrates when one comes within range. A thin circle sweeps out from the player to the ring every few seconds, like a scanner. A "Nearby" strip lists the creatures around with name and distance; choosing one turns the camera towards it.
- **Icons** (creatures, stamps for arenas, trainers and rest stops, the Journal star) show at every zoom while they are within the fog distance; they are hidden behind the camera or beyond the edge.
- **Touch:** dragging never scrolls the page or triggers pull-to-reload; a pinch always zooms, also while the player is moving.
- **Night:** the map switches to a night style after sunset.

**Wild areas and routes.**

- **Wild areas** are cells whose biome mix is mainly park, forest, meadow/field or water edge. The map draws them with a grass or ripple texture, so players can see where creatures live, as with tall grass.
- **Routes** are numbered walking routes between two zones, following real footpaths, park paths and the river path where possible, and through the grass where the paths allow (42 % of all route metres run through wild areas). In Odense there are 50: 15 make up the badge path (Route 1 Centrum–Næsbyhoved … Route 15 Zoo–Tusindårsskoven), 10 are other ways between the same places and 25 lead to a destination (a forest, lake, fjord shore or village). Badge-path routes are 1.2–4.7 km and the longest route is 6.9 km: long stretches between arenas are split at a park or forest in the middle, so a route is one walk. Most arenas have 3–4 routes in.
- **A route is a progress bar.** It is drawn dashed (red; routes to a destination orange-red), and the walked part solid; a checkpoint every 25 m is reached within 30 m, and a route is finished at 90 % (so short GPS gaps don't block it). A finished route opens the zones at both ends as soon as one of them is open, so a route walked "from the wrong side" pays off later. Progress counts on every walk and is kept between walks.
- **Route trainers** stand on every route, about one per 1.5 km (1–3 per route), and creatures are denser within about 30 m of a route.
- **Streets** stay sparse, like the towns between routes, and mostly have urban creatures.

**Town Map.** A full-screen overview of the region in the same paper style: the region border (solid yellow, with a pale wash outside the region), district and zone borders (dotted; each edge drawn once, never on top of another line), closed zones lightly dimmed with how to open them, arenas with badge state, every route with its number and walked part, rest stops, the player's position and the Journal's current target. It is held on the region (it can't be dragged out of it), and its map ends in an even frame 2 km around the region, plain beyond (v1.15). It zooms from the whole municipality, where only the arenas show, down to the streets. Arenas are badges; everything else is a stamp: trainers (ticked when beaten; shown when zoomed in), rest stops, markets and the **destinations**, one stamp per zone that says what it is (forest, meadow and field, lake and water, town), so players can see what a route leads to. Tapping a place shows its straight-line distance, its zone and what it needs (a destination: what it is, which routes lead there and which route to walk next); no turn-by-turn directions. A **filter** button (a funnel) in the top bar, next to the Fyn button, opens a short menu of switches to show or hide arenas, routes, trainers, rest stops, markets and destinations; the choice is remembered on the phone.

**Fyn map.** A "Fyn" button on the Town Map opens a map of Fyn's municipalities, each a region: in the same paper style, held on Fyn with a small zoom range, showing each region's 8 arena badges (grey until won). It is for choosing a region: today only Odense can be opened (back to its Town Map, also handy for planning a trip from elsewhere); the others say "coming later". Back closes the Fyn map first, then the Town Map.

**Journal (quest log).**

- **Main goal:** always available on the map as a folded card with a direction arrow; one tap shows the goal and distance, the next opens the Journal. The main goals per arena are: open its zone (the Journal picks the next route toward it, starting from an open zone: "Walk Route 1 to open Næsbyhoved Slotsbanke") → beat the trainers on its district's badge-path routes → visit one of its rest stops → challenge its arena. Steps can be done in any order; the current goal is the first open step of the next arena. Arenas not built yet show "opens in a later update".
- **Side goals per district:** finite and never daily: walk 300 m in its wild areas, catch a creature of its typical type, meet its rare creature. Trainers on other routes are optional.
- **Region progress:** "Routes walked: 3 of 50 · Zones open: 4 of 39".
- **First launch** ends with one clear goal on screen, so a new player always knows what to do next.

**Look and feel.**

- A storybook paper style inspired by Danish fairy tales.
- One design system: colours, type (headings in Fraunces, body in Atkinson Hyperlegible, both OFL and self-hosted), components and motion, with a night palette. No green or yellow in the interface outside the map: copper for badges and highlights, spruce blue for things that are done, Danish red as the main colour; the phone's bars follow the paper colour (cream by day, navy at night). The map keeps its own palette, and health bars keep green, yellow and red.
- **Logo:** the arena badge with an empty centre (cream petals, a red ring, a cream centre on navy); it is the app icon. The main menu button is a red satchel.
- A heads-up display that never covers the player and shows itself on demand: the folded Journal card, a paw button for the Nearby strip with the number of creatures around, and a small signal icon for a weak GPS fix (no "looking for creatures" message).
- A loading screen ("Finding your position", "Building the town") whenever the map is built, never longer than 20 seconds. The menu opens over the live map, so closing it is instant.
- Big friendly buttons and satisfying feedback on catches, badges, level-ups and zones opened.
- Interface and icons are original; no ball-shaped menu button or other borrowed trade dress.

## World: Odense Kommune, zones and progression

**Odense Kommune is the first region; Fyn's other municipalities come later, each as its own region. The region is split into 39 zones around arenas, towns and wild or water destinations, in 8 districts. Numbered routes along real paths link the zones; walking a whole route opens the zones it leads to. The arenas form a loop around the start town, spread over the whole municipality, and each sits at a place that fits its theme.** The region's border is the municipality border with the harbour, the canal and small inlets included (closed by 400 m). Zones and districts live in `content/zones.odense.json`; their outlines and border lines are generated by the region builder.

| # | Arena site | Theme | District (level band) | Field ability earned |
| --- | --- | --- | --- | --- |
| 1 | Kongens Have (start town, Centrum) | Folk | Centrum (3–8) | — |
| 2 | Næsbyhoved Slotsbanke (medieval castle mound) | Stone | Næsbyhoved and Stavis Å (8–14) | Forager |
| 3 | Stige Ø (island in the fjord) | Water | The fjord (13–20) | Angler |
| 4 | H.C. Andersen Skoven (fairy-tale forest) | Grove | The eastern woods (19–26) | Runereader |
| 5 | Hollufgård / Sneglehøjen (sculpture park) | Spirit | Hollufgård and Fraugde (25–32) | Nightseer |
| 6 | Den Fynske Landsby (village smithy) | Fire | Dalum and Hjallese (31–38) | Sealbreaker |
| 7 | Odense Zoo | Mixed | Zoo and Sanderum (37–44) | Homing (heal only) |
| 8 | Tusindårsskoven's hill (the Millennium Forest) | Storm | The western woods (43–50) | — |

Zones come in four kinds: 8 **arena** zones, 5 **towns** (a rest stop, no arena: the harbour, Kulturbotanisk Have, Fraugde, Bellinge, Korup) and 26 **wild** or **water** destinations (big grass areas, lakes, fjord shores). Every arena site and town has a rest stop, and so do the main destinations (24 rest stops). The level band of district *n* is used for its trainers and rare creatures, and for common creatures caught by a player with *n − 1* badges (see the rules below).

Rules:

- **Zones open with routes.** The start zone (Centrum) is open. A finished route opens the zones at both of its ends as soon as one of them is open.
- **Zones lock arenas, trainers and rare creatures, not everyday wildlife.** Common creatures can be battled and caught everywhere from day one, so a player who lives far from the centre can play near home. In a zone the player has not opened, rare creatures and field-ability layers show greyed out as "too wild to catch: walk a route to <zone>", and its trainers and arena refuse ("walk a route here first").
- **Arenas go in order:** arena *n* takes a challenge when its zone is open and the player holds badge *n − 1*.
- **Common creatures match the player.** A common creature's level comes from the player's own band: the band of the next arena's district (0 badges → district 1's band, 1 badge → district 2's band, and so on). Rare creatures use their own district's band. Species are shared by everyone; levels are per player, because everyone catches their own copy anyway.
- **100 %** is every zone opened and every badge; walking every route is a bonus.
- **Home zone.** Onboarding works anywhere; the map then points to Centrum.
- **Championship.** After 8 badges, the Odense Championship is a 4-battle gauntlet at a central landmark (for example Rådhuset's square).

## Regions: one campaign per municipality (v1.17)

**Every Fyn municipality becomes its own region, like a separate game in the same app: its own starters, creatures, arenas, badges, routes and progress. Odense creatures stay in Odense and Svendborg creatures in Svendborg.** Entering a region the player has no campaign in starts that region's campaign with its own starter choice; the other campaigns stay as they were (the save becomes one campaign per region, with shared settings).

**How the game follows the player (v1.18).** The campaign being played is the region the player stands in: inside its land, or up to 500 m off its coast (quays, piers, the harbour). Out at sea or between regions nothing changes. The switch waits until a battle and its choices (learn a move, evolve) are done. Arriving in a region for the first time shows a short welcome and that region's three starters; the safety note and the location question are not asked again. Coming back to a region brings its campaign back exactly as it was. The Town Map, the play map, the Journal, the field guide, the bag and the badges always show the campaign's own region; the Fyn map shows each region's badges. Only regions whose creatures and arenas are built can be played. The type chart, battle rules, moves, items and the app are shared. Regions are built with the recipe in docs/REGION-RECIPE.md and tracked in docs/REGIONS.md, including an update queue: an update made in one region is offered to the others, and the owner decides for each region whether it comes as it is, adapted, or not at all (P27).

**Svendborg (the second region, being built).** 415 km² in twelve pieces: the mainland, Tåsinge (by the Svendborgsund bridge), Thurø (by causeway), the ferry islands Skarø, Hjortø and Drejø, and islets. 44 zones in 8 districts with the same level bands as Odense. Starters form a coastal triangle, **Water → Stone → Storm → Water**, three stages each. Its creatures are its own: clearly different from Odense's, but in the same spirit (folklore and local names, the same rarities and destination homes).

| # | Arena site | Theme | Badge (da / en) |
| --- | --- | --- | --- |
| 1 | The old harbour (Frederiksø), start town | Spirit | Lygte-mærket / Lantern badge |
| 2 | Christiansminde (beach and beech wood) | Fire | Bål-mærket / Bonfire badge |
| 3 | Thurø | Water | Ø-mærket / Island badge |
| 4 | Troense (skipper village) | Storm | Skipper-mærket / Skipper badge |
| 5 | Valdemars Slot | Folk | Slots-mærket / Castle badge |
| 6 | Egebjerg Mølle | Stone | Mølle-mærket / Mill badge |
| 7 | Hvidkilde (manor, lake, woods) | Grove | Skov-mærket / Forest badge |
| 8 | Gudme (Iron Age gold) | Mixed | Guld-mærket / Gold badge |

The badge path runs from the harbour to Christiansminde and Thurø, over the Svendborgsund bridge to Troense and Valdemars Slot on Tåsinge, back over the sound to Hvidkilde and Egebjerg, and north to Gudme (45 walking routes: 14 on the badge path, 11 other ways, 20 to destinations). **Ferry islands** (Skarø, Hjortø, Drejø) are optional destinations, never needed for a badge: the Town Map draws each crossing as a loose dotted line over the water along the real sailing lane, and an island's zone opens when the player arrives there (lands on it). A crossing has no progress bar and does not count among the routes in the Journal. The ferries leave from the harbour in the start town, where several routes meet, so a player who walks to the quay and decides not to sail never has to walk back the way they came.

**Badges.** Every badge has its own design: its own outline, emblem and colour, taken from its arena's place (Odense: crown, castle mound, fjord, fairy-tale tree, snail spiral of Sneglehøjen, smithy anvil, paw, storm over the hill; Svendborg: lantern, bonfire, island, anchor on a ship's wheel, castle, windmill, oak leaf, gold bracteate). No two badges share an outline within a region.

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

**Roster (v1.13): 55 creatures in 23 evolution lines, each line two or three stages.** Every line has a **rarity**, which decides how often it spawns:

| Rarity | Lines | Spawn weight | Level | Notes |
| --- | --- | --- | --- | --- |
| Common | 6 (Torvdue, Rendsnude, Mosbille, Grimælling, Mosling, Ræveling) | 25 | Player's band | Mosling only in destinations |
| Uncommon | 9 (Brokrabbe, Kulingmåge, Lygtling, Gløding, Rokkeling, Lynspurv, Dugpust, Flintling, Ildflue) | 9 (18 for the district's featured one) | Player's band | Rokkeling, Dugpust and Ildflue only in destinations; Lygtling and Ildflue at night |
| Rare | 4 (Loftnisse, Søormling, Kampetrold, Ellepige) | 2.5 | District's band | Søormling and Ellepige only in destinations; locked with their zone |
| Very rare | 1 (Nøkkeling) | 0.8 | District's band | Only at lakes and other water in destinations |

The three starter lines get a third stage at level 36 (Brandløve Fire/Folk, Havodder Water/Folk, Lundekonge Grove/Spirit) and never appear in the wild. Of the 20 wild lines, 6 have three stages (Torvdue → Kirkedue → Vinddue, Mosbille → Skovbille → Eghjort, Grimælling → Svaneunge → Kongesvane, Gløding → Glødøgle → Essedrage, Mosling → Mostrold → Lyngkonge, Lynspurv → Tordenkrage → Tordenravn) and 14 have two. Second stages evolve at 14–30, third stages at 32–38; a final stage often gains a second type. Base-stat totals rise from 245–320 (first stages) to 385–400 (final stages). Fourteen new moves give every type a mid-level attack (60–70 power) and a top attack (90–100 power, learned at 34–40). **docs/CREATURES.md** lists every creature with its rarity, types, stats, evolutions, moves, spawn chance (in destinations and elsewhere), where it spawns and a small spawn map; it is generated from the content by `pnpm docs:content`, so it always matches the game. Names are original Danish words and folklore (lindorm, nøkken, mosekone, ellekonge), checked against existing monster-game names. All species stay `placeholder: true` (`packages/data/content/species.json` is the source of truth). Placeholder art uses each species' own colours (body and accent, set in species.json), with the type colour kept on the map marker's ring; a third stage gets a tall crest.

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
| Small / Medium / Large Tonic | Heal 20 / 40 / 60 HP | Rest stops, trainer rewards, markets |
| Clear Drops | Cure status | Rest stops |
| Basic / Good / Great Charm | Catch item, ×1 / ×1.5 / ×2 | Rest stops; Good after badge 2, Great after badge 5 |
| Revive Leaf | Revive at 50% HP | Hidden items, arena and route-trainer rewards |
| Revive Blossom | Revive at full HP | Markets (2,000 skilling), arena 7 and 8 leader rewards (v1.13); a found source is still open (backlog P21) |

**Skilling and markets (v1.12).** The game's coin is the *skilling* (an old Danish coin). Beating a trainer pays once: the trainer's highest creature level × 25 (arena leaders × 60), so a Centrum route trainer pays about 200. Markets sell every priced item and buy items back for half their price; Good Charms need badge 2 and Great Charms badge 5. Rest stops still give a free restock once per hour (for example 5 Basic Charms, 2 Small Tonics), so a player who never visits a market can still play. Prices (skilling): Basic Charm 100, Good Charm 300, Great Charm 600, Small Tonic 150, Medium Tonic 350, Large Tonic 600, Clear Drops 200, Revive Leaf 800, Revive Blossom 2,000. Ways to find items while walking (items on the ground, creatures that find things on routes) are still open (backlog P26).

## Encounters and spawning

**Wild spawns are server-authoritative and shared: a small spawn service decides which creatures stand in which cell during each 15-minute window, so every player in the same place at the same time sees the same creatures, even in single-player.** Each player battles and catches their own copy; nobody can "take" a spawn from someone else. Spawns are visible on the map (like footprints or a shape in the grass), and the player taps one to start the battle, so the game never forces anyone to stop in the street.

**Build time (region builder):**

1. Fetch OSM features for the region (land use, natural, water, leisure, historic, amenity, highways).
2. Cover the region with H3 cells at resolution 10 (about 65 m edge, \~15,000 m² per cell).
3. For each cell, compute the share of each biome by area: Water (lakes, harbour, and rivers and streams buffered from their lines), Forest, Park, Meadow/field, Farmland, Urban, Industrial, Historic. Mark the cell `noSpawn` if at least 25% of its area is covered by schools, kindergartens, cemeteries, hospitals, care homes, prisons, places of worship, allotment gardens, golf courses, campsites, military areas, airports, railway tracks or motorway/trunk roads (care homes to campsites added in v1.14). Playgrounds, open water, Odense Zoo and Den Fynske Landsby stay open (owner decision). The light rail (letbanen) does not count as railway, because it runs along ordinary streets. Separately, no spawn is ever placed inside one of those areas, or on the light-rail tracks, whatever its cell (accepted P10, P11).
4. Keep the cells inside the region border and give each the nearest zone centre's zone, and that zone's district (a POI's own cell always counts as the POI's zone).
5. Write `region.<id>.json`: cells → {district, zone, biomes, flags (noSpawn, wild, water edge, route corridor, destination)}, plus the zone and district outlines and the border lines for the maps.

**Spawn service (server):**

1. Time is cut into 15-minute windows (window = floor(unix seconds / 900)).
2. The seed for a window is HMAC-SHA256(server secret, region + window). The secret never leaves the server, so nobody can predict future spawns.
3. For each cell, the shared `spawn` package rolls how many creatures appear (density from the cell's biome mix, 0 in `noSpawn` cells), which species (district spawn table weighted by biome shares, day/night, and the field ability a spawn requires) whether it is common or rare, and a level roll between 0 and 1. The phone turns the roll into a level: the player's own band for common species, the district band for rare ones. Each spawn table entry is marked common or rare. The same pure code runs in the server and in the tests.
4. The client asks for **one coarse cell** (H3 resolution 7, about 5 km²) and the current window, and gets the spawn list for that whole area. The server never receives the player's exact position, and it does not log requests.
5. Only the current and the next window are served, so lists can be cached for a short time without revealing the future.

**On the phone:**

1. Every GPS update with accuracy better than 50 m updates the player's cell. When the signal briefly gets worse, the game keeps the last good position and keeps showing spawns for up to 90 seconds, and only then shows the poor-signal icon and hides them. Travel above 25 km/h shows no spawns (no catching from cars and buses).
2. Spawns within 200 m are drawn on the map, and a Nearby strip lists them. A spawn can be battled from within 40 m.
3. Spawns that need a field ability the player lacks are shown as a hint ("rustling in the trees: needs Forager"); rare spawns in zones the player has not opened are "too wild to catch"; common spawns can always be battled. The phone finds a spawn's zone in its own copy of the region file, so the spawn service doesn't need to know about zones.
4. Each player can battle each spawn (spawn ID) once; the save records which IDs were used.
5. Without a connection, the cached list for the current window keeps working; after that the map says "No signal: the creatures are hiding".

**Destinations are for catching; paths and the inner city are for trainers and arenas (v1.13).** A *destination* is real nature (water, forest, park, meadow or farmland making up at least half of the cell) in one of the forest, field or lake zones that the Town Map shows as destination stamps; the region builder marks these cells. In a destination, spawns are denser and rare and very rare creatures are three times as likely. Seven **destination creatures** live only at their own homes: one to three named destinations, with one main home where they are commonest (v1.15): Mosling (Kirkendrup Skov; also Ræveskov, Stenløse Skov), Dugpust (Brændekilde; Hindemosen), Ildflue (Lungs Grave, at night; Ørbækparken), Rokkeling (Sanderum Sø; Lumby Mølle), Søormling (Seden Strand; Lumby Mølle), Ellepige (Hesbjerg; Fællesskov) and Nøkkeling (Tarup-Davinde only). They never appear anywhere else, also not through a field ability, so a lucky find in the city can't replace the trip: filling the field guide means travelling across the municipality. Routes and streets keep a calmer stream of everyday creatures.

**Density targets (v1.13):** destinations: one battle-able creature per 70–110 m walked; other wild areas (city parks and green strips): one per 100–170 m; route corridors outside wild areas: one per 200–400 m; streets: one per 300–450 m. Rare creatures make up at least twice the share of finds in destinations as elsewhere. A 30-minute walk at 4 km/h (about 2 km) in a destination should offer about 15–22 creatures, of which a player battles perhaps half. Measured over Odense Kommune in v1.15: destinations 1 per 100 m, other wild areas 1 per 159 m, routes 1 per 301 m, streets 1 per 352 m; rares 2.3 times as common in destinations (most rares now live at their homes); destination walk 17.7. (v1.9 targets, replaced: wild areas and route corridors 1 per 100–150 m, streets 300–400 m, park walk 10–16, accepted P16.) Tuned with `spawn:report` and the GPS simulator, then checked in Gate 3. The first walk after choosing a starter follows the onboarding script. In M2 the server only decides what spawns; checking catches on the server comes with accounts in the multiplayer phase.

**Example spawn table entry:**

```json
{ "species": "<a stone species id>", "district": 4, "weight": 10, "rarity": "rare",
  "biomes": { "historic": 3.0, "urban": 1.0 }, "time": "any", "requires": "runereader" }
{ "species": "<a lake species id>", "district": 3, "weight": 0.8, "rarity": "rare",
  "biomes": { "water": 2.0 }, "time": "any", "destinationOnly": true }
```

Real spawn tables live in `packages/data/content/spawns.json` (accepted P8).

## Arenas, trainers, rest stops and field abilities

**Points of interest are fixed, hand-placed in data, and each has an interaction radius so players can stand somewhere safe. They are pressed, never pushed on the player: tapping a stamp within reach (its radius plus 15 m for GPS error) acts at once (a rest stop heals, a ready trainer or arena starts its battle, a market opens); if it can't (a trainer already beaten, a closed zone, a fainted team) a small card says why, with a close button. Tapping a stamp out of reach says how far to walk. Nothing pops up by itself when the player walks into a radius (v1.12).**

| Point | Radius | Interaction | Repeatable |
| --- | --- | --- | --- |
| Arena | 80 m | Leader battle; 1–2 junior trainers first | Leader rematch after the Championship |
| Trainer | 50 m | One battle, 2–4 creatures (by district), reward item. Route trainers stand on every route, about one per 1.5 km (1–3 per route), each with an occupation that suits the place (kayakers by the water, forest wardens in the woods, a smith's apprentice at the village) | Once |
| Rest stop | 40 m | Full heal, item restock once an hour | Yes |
| Market | 40 m | Buy items for skilling, sell items for half price; 9 in Odense, at real shopping places (Vestergade, Storms Pakhus, Rosengårdcentret, Tarup Center, Hjallese Torv, Dalum, and the villages Bellinge, Korup and Fraugde) | Yes |
| Hidden item | 30 m | Pick up an item; some need a field ability | Once |

**Arena leaders.** Each has a name, a personality tied to the place, a 2–6 creature team on its type theme (see Arena difficulty), one signature tactic (for example the Water leader sets up rain-like Speed boosts) and a short pre- and post-battle line. Losing keeps all XP gained.

**Arena difficulty.** The leader team grows by about +5 to +6 levels per arena and from 2 creatures (arena 1) to 5 (arenas 7 and 8); arena 8 reaches the level cap of 50. The *expected player team* (used by the sim and by level design) is one creature more than the leader, at about the same levels, with creatures evolved as a player's would be.

| Arena | Place | Theme | Leader (junior first) | Leader team | Expected player team | Win rate (Fire / Water / Grove starter) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Kongens Have | Folk | Søren (Gardener Jens) | Rendsnude 9, Loftnisse 10 | 3 at L9–10 | 55 / 55 / 54 % |
| 2 | Næsbyhoved Slotsbanke | Stone | Dorthe (Bell-ringer Poul); Storm attacks | Kampetrold 14, Kulingmåge 13, Brokrabbe 15 | 4 at L13–15 | 24 / 75 / 80 % |
| 3 | Stige Ø | Water | Ingrid (Fisher Karen) | Grimælling 19, Kulingmåge 20, Strømodder 22 and 21 | 5 at L21–22 | 27 / 43 / 89 % |
| 4 | H.C. Andersen Skoven | Grove | Forester Asger (Scout Mads) | Mostrold 29, Skovbille 30, Ellepige 31, Bøgevætte 32 | 5 at L26–28 | 85 / 31 / 39 % |
| 5 | Hollufgård | Spirit | Sculptor Mette (Miller Ane) | Lygtemand 33, Mosekone 33, Nøkkeling 34, Loftnisse 35 | 5 at L31–33 | 44 / 64 / 57 % |
| 6 | Den Fynske Landsby | Fire | Smith Niels (Baker Lars) | Glødøgle 35, Lygtemand 37, Essedrage 36, Brandløve 39 | 5 at L36–38 | 57 / 74 / 17 % |
| 7 | Odense Zoo | Mixed | Keeper Fatima (Guide Yasmin) | Kongesvane 40, Eghjort 42, Lygtemand 40, Tordenravn 43, Essedrage 42 | 6 at L41–43 | 50 / 46 / 48 % |
| 8 | Tusindårsskoven | Storm | Weatherwatcher Bo (Runner Freja) | Stormmåge 49, Tordenravn 49, Rokkevinge 48, Vinddue 49, Essedrage 49 | 6 at L44–46 | 55 / 14 / 31 % |

All eight arenas are built (v1.13): each has its POI at the arena site with a junior trainer before the leader. Leaders reward a Revive Leaf (arenas 1–4: one, 5–6: two) or a Revive Blossom (arenas 7–8); juniors reward charms. Win rates are from `pnpm sim:report` (docs/BALANCE.md); the CI guard allows ±5 points, and arenas 4, 5, 6 and 8 sit within 1–4 points of their bands, to be tuned with testers' results. The expected player teams avoid creatures that make one starter's match-up meaningless (for example no Stone creatures against the Storm leader). **docs/TEAMS.md** lists every arena and trainer team, generated by `pnpm docs:content`.

**Win-rate targets** for the expected player team vs. the leader, measured with `pnpm sim:report`: 40–60% with neutral types, 75–90% with a type advantage, 15–30% with a disadvantage, never 0%. Measured in M1.5: arena 1 at 53–55% for all three starters. Route trainers have no target, but should be beatable by the expected team for their district: their levels sit inside the district's band, below the leader's.

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
| Map | Main screen while walking | Player figure + 40 m battle ring, region, district and zone borders, routes with their walked part, wild areas, POI stamps, Journal card, Nearby strip, menu button |
| Battle | Turn-based fight | Both creatures with HP bars and status; 2×2 move grid in the bottom third; Switch / Bag / Run row; event text line |
| Team | View and order up to 6 creatures | Cards with HP, level, types; tap for details, moves, field ability |
| Creature detail | Stats and moves | Stats, types, XP bar, moves with type/power/PP, evolution hint |
| Storage | Creatures beyond 6 | Grid, swap into team |
| Bag | Items | Grouped list with the skilling balance, use from map or battle |
| Market | Buy and sell (v1.12) | Opened at a market on the map; Buy and Sell tabs, prices, the balance; back returns to the map |
| Field guide | Collection | Seen / caught per district, biome hints ("found near water at night") |
| Badges and progress | Campaign | 8 badge slots, next arena and its distance |
| Settings | Safety and comfort | Sound, Vibration (its own switch), reduce motion, battle speed, text size and language (dropdowns), 3D buildings, "How far you can see" (0.8–1.4 km), Battle playtest, data export/delete, safety reminder; the last line is the credits ("Developed by Christian Bröchner Rasmussen with Claude") |

Added in v1.9–v1.11: the **map heads-up display** (Journal card, Nearby strip, compass, menu), the **Town Map** with the **Fyn map**, and the **Journal** screen (see Game feel). The badges screen shows how many zones are open.

**Back gesture:** in a menu it goes back one level, on the Fyn map it returns to the Town Map, on the Town Map it closes the map; only on the game view does it ask "Leave the game?" (Stay, or Leave, which closes the installed app). **Map credits** are a small "i" button, closed at start.

UX rules:

- Everything that matters during a battle sits in the bottom 40% of the screen; tap targets at least 48 px.
- The map never asks for input while the player is moving faster than walking pace.
- Any battle can be left and resumed later with the exact same state.
- Encounters are announced by vibration + a toast; the player taps to start, so nothing forces them to stop in the street. The same goes for points of interest: the player presses a stamp, nothing pops up by itself.

## Art, audio and tone

**A warm, storybook look: Nordic folklore filtered through H.C. Andersen paper-cuts, readable on a small screen in daylight.**

- **Creatures:** 2D sprites at 128–256 px with simple bone or frame animation (idle, attack, hit, faint). Strong silhouettes and one dominant colour per type.
- **Map:** a custom MapLibre style in muted paper tones; water and parks clearly coloured because they matter for spawns; buildings flat. POI icons as small illustrated stamps.
- **Battle backgrounds:** one per biome (river, forest, old town, harbour, park, farmland, night).
- **UI:** large type, high contrast, type colours always paired with an icon or label (colour-blind safe).
- **Audio:** short loops per district, a battle theme, a leader theme; strong hit and catch sounds. Sound off by default outdoors; haptics on.
- **Tone and writing:** gentle and witty, like a fairy tale narrator. All text in Danish and English from the start (i18n keys, no hard-coded strings).
- **Placeholders:** CC0 assets (for example Kenney or Quaternius) or simple coloured shapes until the fun test passes. No Pokémon assets, ever.

**Creature art pipeline: three stages, with every image's source and licence recorded.**

| Stage | Source | Rules |
| --- | --- | --- |
| A1 — now | Generated placeholder sprites made by code (simple shapes, type colours, eyes, a feature or two per species) | Original by construction; consistent look; no licence questions |
| A2 — next | AI-generated placeholder images, and free 2D packs licensed CC0 or CC-BY | Never prompt with franchise names or "in the style of" a franchise or artist; review every image for resemblance to existing monsters; check the tool's terms allow public use; CC-BY needs credits; no packs whose licence forbids redistribution, because the repo is public |
| A3 — goal | Drawings submitted by a handful of human artists | Shared art brief and style guide per creature; artists keep copyright and grant the game a written, non-exclusive, permanent licence; credited in-game and in the README; replaces A1/A2 art before any wider release |

Every image has an entry in an asset manifest: file, species, source (code / AI tool + prompt / pack + URL / artist), author, licence, and a `placeholder` flag. CI fails if a sprite has no manifest entry. AI images are treated as temporary: they may not be protected by copyright, so they cannot be the game's lasting identity.

## Technical architecture

**A TypeScript monorepo: offline tools build the region data, pure packages hold the game rules, a PWA client runs the game on the phone, and one small spawn service decides which wild creatures appear so every player sees the same ones.**

&#91;embedded content: architecture · build tools, shared packages, phone client\]

The battle engine is the heart of the game and has no dependency on the browser, the map or React, so it can be unit-tested, simulated in bulk, and later ported to C# if a Unity client is built.

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces |
| Client | Vite + React, MapLibre GL JS, `pmtiles`, `vite-plugin-pwa`, IndexedDB via `idb-keyval`; hosted on GitHub Pages at christianrasmussen.dk/OdenseMonsterLeague |
| Spawn service | Cloudflare Worker (free tier) running the shared `spawn` package; secret in Worker settings, never in the repo |
| Spatial | `h3-js`, `@turf/turf`, `osmtogeojson` |
| Validation | Zod |
| Tests | Vitest; property tests with `fast-check` for the engine; Worker tests with the Workers Vitest integration |
| CI / hosting | GitHub Actions; static client on GitHub Pages; the Worker is deployed from CI on every push that changes spawn code or data, and each spawn response reports its region-data and spawn-rules versions so drift is caught |
| Later (multiplayer phase) | Accounts, friends, trades and battle relay on Cloudflare (Workers, D1, Durable Objects) |

## Data model

**All game content is data (JSON validated by Zod schemas); all player progress is one versioned save object stored on the device.**

The table says what each file must hold. **The exact field names live in code** and win over this doc: content schemas in `packages/data/src/schemas.ts`, engine and save types in `packages/engine/src/types.ts` (accepted proposals P3 and P4). Change the GDD only when the *meaning* changes, not for a renamed field.

Since M2b, the save format and the progression rules (badges, obedience, zones and route progress, rest stops, restock, field abilities) live in the pure package `packages/game`, not in the engine's types (accepted P12).

| File / type | Holds | Key fields |
| --- | --- | --- |
| `types.json` | The type chart | types\[\], matrix\[attacker\]\[defender\] |
| `species.json` | Creature species | id, name (i18n key), types, baseStats {hp, atk, def, spd}, catchRate, baseXp, learnset \[{level, moveId}\], evolution {level, into}, sprite |
| `moves.json` | Moves | id, name, type, power, accuracy, pp, priority, effect? {kind, chance, target, stat?, stages?, status?, percent?} |
| `items.json` | Items | id, kind (heal, cure, catch, revive), value |
| `trainers.json` | Trainers and leaders | id, name, poiId, aiTier, team \[{species, level, moves}\], reward, lines |
| `spawns.json` | Spawn tables | species, district, weight, biomes {}, time, requires? |
| `zones.<region>.json` | Zones and district level bands | zones \[{id, kind, district, centre, arena?, start?}\], districts \[{id, wildLevels}\] |
| `routes.<region>.json` | Routes, built from the OSM foot network | id, number, from and to zone, kind (main, alt, explore), length, wild share, path |
| `pois.<region>.json` | Arenas, trainers, rest stops | id, kind, zone, district, position, radius, trainer and route (trainers) |
| `region.<id>.json` | Built by the region builder | cells {h3Id: \[district, zone, flags, biome shares, blocked positions\]}, zones, districts |
| `borders.<region>.geojson` | Built by the region builder | the region border and every zone and district edge once, smoothed |
| `fyn.geojson` | The Fyn map | the municipalities of Fyn (OSM borders, simplified) |
| `odense.pmtiles` | Map tiles | Extract of the Protomaps basemap for Odense Kommune and 1.6 km around it |

**Runtime state:** a battle state holds the turn number, the RNG state, both sides (team, active creature, stat stages, statuses, items) and the result. A creature instance holds its species, level, XP, HP, status, moves with PP, and an optional nickname. The save holds the player seed, team, storage, bag, skilling, badges, opened zones, defeated trainers, seen and caught lists, rest-stop restock times, Journal progress (districts reached, route checkpoints reached, metres walked in wild areas, rest stops visited), the fainted creatures' recovery clock, settings and any active battle. See the code for exact types.

The save never stores a location history: only progress. Route progress is saved as the numbers of the checkpoints reached on each of the game's routes: no coordinates, no times, never sent anywhere (accepted P23). The save is versioned so migrations are explicit (v9 in v1.11: opened zones and route checkpoints; district numbers followed the new arena order; v10 in v1.12: skilling, with trainers already beaten paid out).

## Safety, privacy and accessibility

**These are requirements, not polish: each one has a test or a review step before the field test.**

- **Placement.** No POI or spawn inside no-spawn cells. Every arena, trainer and rest stop is checked on site, on public ground, away from road edges.
- **Movement.** No encounters or prompts above 25 km/h; a "stay aware of your surroundings" screen at launch; no feature that rewards going out at night alone (night spawns are a layer, never required for progress).
- **Privacy (GDPR).** Precise location stays on the device. The only thing sent to a server is the coarse H3 resolution-7 cell (about 5 km²) needed to fetch spawns, with no account or player ID attached, and the spawn service does not log requests. Route progress stays on the device as checkpoint numbers (it shows which parts of the game's routes a player has walked, but holds no coordinates or times). Field-test telemetry is opt-in, anonymous, and records game events (battle started, arena won) without coordinates. Players can export and delete their save.
- **Age.** Rated 12+; no chat or player-to-player contact in v1.
- **Accessibility.** Colour-blind-safe types (icon + label), scalable text, reduce-motion setting, full screen-reader labels on battle controls, no time limits on turns.
- **Attribution.** "© OpenStreetMap contributors" and the Protomaps credit visible on the map at all times.

## Development plan

**The single-player game is built first, in milestones over about 20 weeks with playtest gates, ending in a two-week field test; multiplayer follows as M5; each milestone has a done-criterion and only starts when the previous one is met.** The paper playtest (weeks 1–2) runs alongside M0 and needs no code.

| Milestone | Weeks | Goal | Done when | Status |
| --- | --- | --- | --- | --- |
| M0 — Foundations | 1–2 | Monorepo, tooling, schemas, placeholder content | CI green; content validates | Done |
| M1 / M1.5 — Battle engine, balance | 3–5 | A full, balanced battle on a phone | Coverage ≥ 90%; arena win-rate targets in CI | Done |
| M1.6–M1.8 — Playtest kit, GDD sync, deploy | 5 | Gate 2 build online | Live at christianrasmussen.dk/OdenseMonsterLeague | Done |
| Gate 2 — Outdoor battle test | 5 | Are battles fun on a street? | Testers rate battles well | Qualitative pass |
| M2a — Map and shared spawns | 6–8 | Real Odense map with biomes and server-decided spawns you can walk to and battle | Region file for Odense; spawn service live; same spawns on two phones; GPS simulator; A1 placeholder art | Done (live; 6.6% no-spawn cells, 1 spawn per 221 m in green areas, 371 m in streets) |
| M2b — District 1 playable | 8–9 | A complete single-player loop in district 1 | Save, starter, trainers, rest stops, arena 1 and badge playable offline-tolerant | Done (live; badge 1 playable end to end) |
| M2c / M2d — Arena loop, game feel | 9–10 | Open wildlife, Town Map, Journal, camera and design system | Districts 1–2 playable with routes 1–3 | Done |
| Region rework (P22) | 10 | Odense Kommune as a region | 39 zones, 50 routes that open them, route trainers on every route, 24 rest stops, new arena loop, Fyn map | Done |
| Gate 3 — Region walk test | 11 | Does walking the routes feel good and worth travelling for? | Spawn density on target; testers want to keep walking | Next (the owner tests with GPS) |
| M3 — Full Odense single-player | 12–19 | The whole campaign | Arenas 3–8 with leaders and POIs, \~35 creatures, all field abilities, Championship; A2 art | Started: arenas 3–8, 55 creatures and route trainer teams done (v1.13) |
| M4 — Field test | 19–20 | Two weeks with 15–25 players | Return rate and ratings from the fun-test plan | Planned |
| M5 — Multiplayer and social | after M4 | Play together | Friend battles, trades, friends list, party strong encounters | Later |
| Art track | parallel | Real creature art | A3 artist submissions replace placeholders | Ongoing |

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

- [x] Sync GDD v1.2 into the repo and apply the P1 rename and term guard (prompt M1.7)
- [x] Deployed (M1.8): repo chrisesdk/OdenseMonsterLeague (public, all rights reserved), live at https://www.christianrasmussen.dk/OdenseMonsterLeague/ via the portfolio's custom domain; testers must use the https link
- [x] Deploy and open the link on 2–3 phones, Android and iOS
- [x] Recruit 6–10 testers; schedule sessions in daylight and one after dark
- [x] Run the sessions, collect exports, run `pnpm gate2:report`
- [x] Decide: pass (go to M2), tune timings, or rework battles

**Gate 2 result (2026-11-20): qualitative pass.** Testers found the battles an accurate recreation of mainline turn-based fights that look and feel good. No exports were collected, so timing and rating targets are measured in later field tests instead. The main criticism, "it feels very single-player", is answered in the Multiplayer and social section, after the single-player game is complete.

M1.7 (done, 148 tests): field abilities are data in `field-abilities.json`; a franchise-term guard in CI blocks Pokémon terms in every name and da/en string; `docs/DEPLOY.md` covers both public GitHub Pages and a private repo on Cloudflare Pages. Either way, the testers' URL itself is public.

**M2a — Map and shared spawns**

- [ ] Region builder for the whole Odense city area: OSM → H3 res-10 cells with biome shares (water incl. rivers and lakes, forest, park, meadow/field, farmland, urban, industrial, historic) and `noSpawn`
- [ ] District 1 polygon drafted; other districts as rough placeholders
- [ ] PMTiles extract for Odense and a custom paper-tone MapLibre style
- [ ] `spawn` package: pure, deterministic spawn rolls per cell and window
- [ ] Spawn service on Cloudflare Workers: HMAC seed, coarse res-7 requests, current and next window only, no logging
- [ ] Map screen: GPS with accuracy and speed filters, visible spawns within 100 m, tap within 40 m to battle with the existing engine
- [ ] Dev GPS simulator (GPX replay, tap to teleport) and a density report per biome
- [ ] A1 placeholder sprites generated by code, with the asset manifest and its CI check

**M2b — District 1 playable**

- [ ] Save/load in IndexedDB; onboarding and starter choice
- [ ] Team, bag, storage and field guide screens
- [ ] Trainers, rest stops (heal + hourly restock) and the arena 1 leader with its POI radius
- [ ] Badge 1, obedience levels, district unlocks ("too wild to catch")
- [ ] Field-ability system with spawn layers (Forager tested with a dev toggle until badge 2 exists in M3)

**Before Gate 3**

- [x] Redraw all 8 district polygons on real borders (done; arena order then changed in v1.7)
- [x] M2c: new arena order and district numbering, open wildlife with per-player levels, Stone arena 2 at Klosterhaven, Water leader moved to arena 4, district 2 trainers and rest stop, POI fixes
- [x] M2d: drifting-marker bug fixed, routes 1–3 (4–7 drafts), wild areas, new density, Town Map, Journal, UI redesign with night style; then the always-centred rotating camera, 8-hour recovery, 90-second GPS grace and coloured wild creatures
- [x] After M2d: orbit camera, sky wall, 3D buildings, loading screen, HUD on demand, back-gesture guard, vibration setting, new logo and colours
- [x] Region rework (P22): Odense Kommune, 39 zones, 50 routes, route trainers on every route, 24 rest stops, arena loop, Fyn map, clean borders
- [ ] Owner walks the routes with GPS; then check the POIs on site and set them to `verified: true`
- [ ] Run Gate 3 with `docs/GATE3.md`: daylight sessions plus one after dark

**M3 — Full Odense single-player, M4 — Field test, M5 — Multiplayer**

- [x] M3: arenas 3–8 with leaders, juniors and POIs; 55 creatures in 23 lines with rarities (v1.13)
- [ ] M3: all six field abilities; arena rematches; the Odense Championship; A2 art
- [ ] M3: onboarding, safety screen, settings, opt-in telemetry without coordinates, in-app feedback
- [ ] M4: two-week field test with 15–25 players on 3+ Android and 2+ iOS phones
- [ ] M5: accounts, friends via QR, friend battles, trades, trainer cards, party strong encounters (see Multiplayer and social)

## Multiplayer and social (later phase)

**The whole single-player game comes first; multiplayer is built after the field test (M5), on top of a game that is already complete on its own.** Arenas and badges stay single-player for good. Gate 2 testers called the game "very single-player" compared with Pokémon GO, but named two strengths: progress through the city feels meaningful, and turn-based battles between friends would be far better than tap-and-swipe battles.

**Already shared in single-player:** wild spawns are server-authoritative, so friends walking a park together see the same creatures and each catches their own.

**Planned for M5, in order of value for cost:**

1. **Friend battles.** Started in person by scanning a QR code. Both teams are scaled to a fixed level (for example 50), so friends with 2 and 6 badges get a fair fight. The engine is deterministic, so both phones run the same battle and a small relay only passes the chosen actions.
2. **Trading.** In person by QR code. The badge obedience rule protects progression: a traded creature above the player's obedience level ignores orders half the time.
3. **Friends list and trainer cards.** Badges, team and arena clear times, visible only to friends added in person.
4. **Party strong encounters.** A rare, powerful creature that only groups of 2–4 can see. Each player fights with one creature against a boss scaled to party size, and every player gets their own catch attempt after a win. **A party adds, never subtracts:** normal spawns stay exactly the same for party members.

**Mixed-progress groups:** field abilities give high-badge players something in early districts (new layers there), and arena leaders offer rematches with stronger teams after later badges. Groups lining up their progress is otherwise accepted, as with friends playing a mainline game together.

**Privacy rules for M5:** sharing location with a party is opt-in, limited to that party and to friends added face to face, and stops when the party ends. There is no public player discovery and no chat, in line with the 12+ rating.

## Open questions

- [ ] Final game name and a check that it is free to use (trademark search, app stores, domain); "Monster League" for now, candidates Wild Atlas, Wanderfolk, Waymark
- [ ] Where the Revive Blossom comes from (backlog P21)
- [ ] Leaderboards (for example longest distance walked) and a competitive scene for players with 8 badges: when and how, given the privacy rules
- [ ] Are 30–40-turn leader fights acceptable outdoors? Measure in Gate 3 and M4.
- [ ] Should individual leaders get heal or opponent-debuff moves as a signature tactic?
- [ ] Spawn density: do the per-biome targets feel right on real walks?
- [ ] Native app later: Unity (C#, 3D, AR) or Flutter (2D, MapLibre)? Decide after M4.
- [ ] How to handle players who move away from Odense mid-campaign: a "home city" generator for other towns?
- [ ] Art: which AI tool for A2 placeholders (terms must allow public use), and how to find 3–5 artists for A3 (art schools, local illustrators)
- [ ] Artist agreement: licence wording, credit, and whether artists are paid
- [ ] Real type icons to replace the 3-letter codes (ILD, VND...)

## Change log and how this doc stays in sync

**This doc is the design source of truth, and since v1.11 it lives in the repository as `docs/GDD.md`, maintained by Claude Code on the owner's behalf.** Design decisions are written straight into it, with a new version line below. `docs/GDD-PROPOSALS.md` is the design backlog: open questions and ideas that still need the owner's decision. Implementation detail lives in `docs/DECISIONS.md`.

| Version | Date | Changes |
| --- | --- | --- |
| 1.18 | 2026-11-26 | Campaigns per region in the game: the campaign follows the region the player walks in (up to 500 m off its coast), switching after any battle; a new region starts at its own starter choice and the other campaigns wait unchanged; ferry crossings are sailed, not walked, and an island opens when the player lands there |
| 1.17 | 2026-11-25 | Regions: one campaign per municipality, with an update queue between regions (P27); Svendborg designed: Water/Stone/Storm starters, eight arenas and badges, ferry islands that open on arrival with dotted crossings, its own creatures; every badge its own design |
| 1.16 | 2026-11-25 | Tester features: a one-time welcome (what to try, add to home screen, export, feedback), Feedback in the menu (share sheet, never a location), save import, the field guide names destination creatures' homes; first launch goes straight into the map game |
| 1.15 | 2026-11-25 | Destination creatures spawn only at their 1–3 home destinations, with one main home each, spread over the municipality; the Town Map ends in an even frame 2 km around the region |
| 1.14 | 2026-11-25 | No spawns on golf courses, allotment gardens, care homes, prisons, places of worship or campsites; playgrounds, open water, the zoo and Den Fynske Landsby stay open |
| 1.13 | 2026-11-25 | Roster v2: 55 creatures in 23 lines of two or three stages (20 wild lines, starters get a third stage at 36), a rarity per line (common, uncommon, rare, very rare) and 14 new moves; destinations (nature in forest, field and lake zones) get denser spawns, triple rare odds and seven destination-only lines, while routes and streets get fewer; new density targets; arenas 3–8 built with leaders, juniors and POIs, all inside the win-rate guard; route trainer teams use the new roster; docs/CREATURES.md and docs/TEAMS.md generated from the content |
| 1.12 | 2026-11-25 | Skilling (coins from trainers) and 9 markets that buy and sell items (replaces "no shop and no currency"); Medium Tonic; the Town Map shows trainers, rest stops, markets and destination stamps (forest, field, lake, town) and gets a filter; points of interest are pressed (tap the stamp within reach, with 15 m GPS slack) instead of a card popping up |
| 1.11 | 2026-11-25 | The GDD moves into the repository and is maintained by Claude Code; folded in everything since v1.10 (orbit camera details, the sky wall at the edge of the world, 3D buildings, HUD on demand, loading screen, back gesture, settings, logo and colours) and accepted P22 (Odense Kommune as the region: 39 zones opened by walking 50 routes, route progress bars, new arena loop Næsbyhoved–Stige Ø–H.C. Andersen Skoven–Hollufgård–Den Fynske Landsby–Zoo–Tusindårsskoven, Water leader moved to arena 3, the Fyn map) and P23 (route progress saved as checkpoint numbers); route trainers on every route (about one per 1.5 km); region border includes the harbour and canal; campaign length 14–30 days; P17 and P18 replaced by P22 |
| 1.10 | 2026-11-21 | M2d done and live; accepted P16 (walk target stated at 4 km/h, 10–16 creatures), P17 (routes may cross unlocked districts), P18 (Journal: beat the district's trainers), P19 (fainted creatures recover after 8 hours), P20 (always-centred camera that rotates on drag and tilts as you zoom); 90-second GPS grace before the weak-signal note |
| 1.9 | 2026-11-21 | New Game feel section (comparison with walking and mainline games, tilted follow camera, wild areas and routes, Town Map, Journal, look and feel); density targets raised for wild areas (1 per 100–150 m) and set for streets (1 per 300–400 m); creatures visible to 200 m with a Nearby strip; M2d added before Gate 3 |
| 1.8 | 2026-11-21 | M2c done and live; accepted P14 (Kampetrold and Ellepige, 17 species) and P15 (arena 2 in Klosterhaven, since the square is too close to the district border); arena 2 and arena 4 teams and win rates recorded |
| 1.7 | 2026-11-21 | Arena order becomes a geographic loop (1 Kongens Have, 2 cathedral/Stone, 3 H.C. Andersen/Spirit, 4 Munkemose/Water, 5 Zoo/Mixed, 6 Fruens Bøge/Grove, 7 Den Fynske Landsby/Fire, 8 harbour/Storm); districts lock arenas, trainers and rare creatures but not common wildlife; common creature levels follow the player's badges; spawn entries marked common or rare; M2c added before Gate 3 |
| 1.6 | 2026-11-21 | M2b done and live (district 1 playable to badge 1); accepted P12 (save and progression rules in packages/game) and P13 (starter level 5, starting bag, tutorial rules); district redraw and POI checks added before Gate 3 |
| 1.5 | 2026-11-21 | M2a done and live; Worker auto-deploy and version check; onboarding: starter chosen anywhere plus a personal tutorial creature; losing faints the whole team until a rest stop or items |
| 1.4 | 2026-11-20 | Accepted P8–P11 from M2a: field-ability name in the spawn example, Meadow/field biome and buffered rivers, no-spawn cells at 25% coverage plus never placing spawns inside no-spawn areas, light rail excluded from railway; M2a built, waiting for the spawn service deploy |
| 1.3 | 2026-11-20 | Gate 2 qualitative pass; single-player game first, multiplayer as M5; server-authoritative shared spawns (spawn service, coarse-cell privacy, visible spawns you tap); creature art pipeline A1–A3; new roadmap M2a/M2b, Gate 3, M3 full Odense, M4 field test, M5 multiplayer; new Multiplayer and social section |
| 1.2 | 2026-11-20 | Accepted P1–P7 from M1.6: original field-ability names (Forager, Angler, Runereader, Nightseer, Sealbreaker, Homing), Catch and Run in the turn order, data model defers field names to code, leader teams 2–6, Grove defensive strength tracked in BALANCE.md, "Bag" button; M1.6 marked done, Gate 2 checklist added |
| 1.1 | 2026-11-20 | Folded in M1 and M1.5: HP formula, Storm → Stone ½, Storm → Grove 2 (new), coverage moves, auto-learn rule, AI set-up rule, running, full-team catch, turn cap 150, arena difficulty table and win-rate targets, balance tooling, M1.6 and Gate 2 added to the plan |
| 1.0 | 2026-11-20 | First version |
