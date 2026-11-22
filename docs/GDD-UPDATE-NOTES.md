# GDD update notes (changes since GDD v1.9)

Everything built or decided since the v1.9 export that the GDD doesn't describe yet,
grouped by GDD section, with suggested wording. Details and reasons are in
[DECISIONS.md](DECISIONS.md) (D111–D148); open proposals are in
[GDD-PROPOSALS.md](GDD-PROPOSALS.md) (P16–P21).

## Change log line (suggested)

| Version | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.10    | M2d done and live (game feel); orbit camera (always on the player, drag rotates, zoom tilts 30–76° and looks ahead), a round world that ends in sky at 1.2 km (adjustable 0.8–1.4 km), with a day/night sky (stars at night), opt-in 3D buildings, loading screen, HUD on demand (folded goal card, Nearby button, GPS signal icon), menu over the live map, touch drags never scroll or reload the page, fainted creatures recover after 8 hours, short GPS dips tolerated, species art colours, new logo (the arena badge) and colours without green and yellow, switching between the map game and the battle playtest, a back gesture asks before leaving; accepted P16–P20 |

## Game feel → Map view (P20)

Replace the camera paragraph with:

> The camera always looks at the player and never pans. Dragging rotates the view around
> the player by exactly the angle the finger sweeps around it, near or far, so the view
> always follows the finger. A quick swipe keeps turning briefly; two-finger twist works
> too. Pinching or the scroll wheel zooms on the player (zoom about 16.5–18.5): zoomed out
> the camera looks almost straight down (30°), and zooming in tilts it up to 76° and moves
> the player lower on the screen (from just above the middle to 60% of the way down), so
> zooming in means looking ahead. A compass button turns north up. When the GPS position
> changes, the player slides to it instead of jumping.

Add:

- **The edge of the world and the sky:** the world is a round patch around the player that
  ends in sky at a fixed distance, the same at every zoom. It is 1,200 m by default; the
  setting "How far you can see" sets it between 800 and 1,400 m. The edge is an invisible
  wall painted like the sky: buildings inside stand in front of it, everything behind it
  is hidden, and the last 150 m of ground blend softly into the sky. 3D buildings load and
  unload at the edge. The day or night sky is drawn behind the map, so it only fills the
  space above the horizon and never covers ground; at night it has stars, which turn with
  the camera.
- **Touch:** dragging on the map never scrolls the page or triggers the browser's
  pull-to-reload; a finger drag turns the map just like a mouse drag; a pinch always
  zooms, also while the player is moving.
- **Menu:** the menu opens over the live map, so closing it is instant (the map, GPS and
  buildings are not reloaded).
- **Icons:** creatures, stamps (arenas, trainers, rest stops) and the Journal star show at
  every zoom while they are within the fog distance; they are hidden when they are behind
  the camera or beyond the fog wall.

## Game feel → Look and feel / Screens and UX

- **Heads-up display on demand:**
  - The Journal goal starts folded as a round button with the direction arrow; one tap
    shows the goal, the next opens the Journal.
  - The Nearby strip opens from a paw button showing how many creatures are around.
  - No "looking for creatures" message. A weak or missing GPS fix is a small signal icon,
    not a sentence. A denied GPS permission still shows a message.
- **Loading screen:** on the first map of a session, "Finding your position" and "Building
  the town" are ticked off; it never waits more than 20 seconds.
- **3D buildings (setting, off by default):** buildings from the map data drawn in 3D at a
  storybook scale (about half their real height, so the street around the player stays
  visible); facing labels stay above them.
- **Settings screen:** add "3D buildings", "How far you can see" (fog wall, 0.8–1.4 km)
  and "Battle playtest" (opens the playtest; the playtest has "Go to the map game") to the
  list.
- **App name:** "Monster League" for now (was "Odense Monster League", "OML" on the
  home screen); Odense becomes the first region rather than part of the name.
- **Map credits:** the OpenStreetMap / Protomaps credits are a small "i" button in the
  corner of both maps, closed at start; a tap opens them above the game's buttons, and the next touch anywhere
  else closes them again.
- **Leaving:** an accidental back gesture (an edge swipe) doesn't leave the site or close
  the installed app; the game asks "Leave the game?" first. Stay closes the dialog and the
  swipe has no effect; Leave, or a second swipe, closes the installed app (in the browser:
  goes back to the page before).
- **Logo:** the arena badge with an empty centre (cream petals, a red ring and a cream
  centre on navy). It is the app icon and appears with the game's name on the first
  screen. The swinging lantern stays the loading-screen icon.
- **Colours:** no green or yellow in the interface outside the map: copper for badges and
  highlights, spruce blue for things that are done, Danish red as the main colour. The
  phone's top and navigation bars follow the paper colour (cream by day, navy at night).
  The map keeps its own palette; health bars keep green, yellow and red. The phone's
  top bar is the menu's paper colour (cream by day, navy at night), so the menu seems to
  fill the screen; on iPhone it is see-through.
- **Design system (as built):** headings in Fraunces, body text in Atkinson Hyperlegible
  (both SIL Open Font License, self-hosted); the main menu button is a red satchel.

## Game feel → Wild areas and routes (P17, P18)

- **Routes as built:** Route 1 Kongens Have–Klosterhaven (769 m), Route 2
  Klosterhaven–H.C. Andersens Hus (585 m), Route 3 H.C. Andersens Hus–Munke Mose
  (1,375 m). Routes 4–7 are drafts (Route 7 is 13.6 km round the east side).
- **P17:** a route stays in the two districts it connects where they touch; otherwise it
  may pass through districts already unlocked (Route 3 runs through district 2 along
  Odense Å, since districts 3 and 4 don't touch).
- **P18:** the Journal step is "Beat the trainers in <district>"; a district's trainers
  stand on any route through it. District 2's trainers stand on Routes 2 and 3 (Route 1's
  district-2 stretch has no room for them).
- **Arena sites 3–8** are placed from OpenStreetMap and approximate until their POIs are
  placed in M3 (Havnebadet especially).

## Game feel → Journal

As built (suggested addition):

- **Main goals per district:** reach the district → walk its route → beat its trainers →
  visit one of its rest stops → challenge its arena. Steps can be done in any order; the
  current goal is the first open step of the next arena's district. Arenas not built yet
  show "opens in a later update".
- **Walking a route:** route checkpoints every 100 m; 80% of them completes the step.
- **Side goals per district:** walk 300 m in its wild areas, catch a creature of its typical
  type, meet its rare creature.

## Encounters and spawning → Density targets (P16)

- **As built:** wild areas 1 per 136 m, streets 1 per 331 m, 30-minute park walk 11.7
  creatures (spawn algorithm 4).
- **P16:** the two targets only overlap at 143–150 m per creature. Suggested wording: "A
  30-minute park walk (about 2 km at a stroll) should offer about 10–16 creatures", or
  define the walking pace.

## On the phone (Encounters and spawning) — GPS

Add:

> A short GPS dip (a fix worse than 50 m) doesn't hide the creatures: the last accurate
> position stays in play for 90 seconds, and only then does the map show the poor-signal
> icon and hide them.

## Battle system / Catching, levelling, evolution and items (P19)

Change "losing faints the whole team until a rest stop or items" to:

> … until a rest stop, items, or 8 hours: a fainted creature recovers fully by itself
> 8 hours after it fainted. The team screen shows the time left.

Add to the item table (P21):

> | Revive Blossom | Revive at full HP | (to be decided) |

Until its source is decided, Settings → Test items adds one to the bag (for testing),
alongside Basic Charms and Small Tonics.

## Creatures → placeholder roster

Add: placeholder art uses each species' own colours (body and accent, set in
species.json), with the type colour kept on the map marker's ring. Before, Folk creatures
all came out grey.

## Data model

Save versions since v1.9:

| Version | Adds                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| v3      | Journal progress: districts reached, route checkpoints reached, metres walked in wild areas, rest stops visited (no positions or times) |
| v4      | Recovery clock for fainted creatures                                                                                                    |
| v5      | The 3D buildings setting                                                                                                                |
| v6      | The fog distance setting (then 1,000–2,000 m, default 2,000)                                                                            |
| v7      | Fog distance limited: default 1,200 m, range 800–1,400 m (longer settings come down to 1,200)                                           |

Region file v3: each cell carries flags for no-spawn, wild area, water edge and route
corridor.

## Open proposals to decide (GDD-PROPOSALS.md)

| Proposal | What to decide                                                                          | State                                               |
| -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| P16      | Density targets: widen the park-walk range to 10–16, or define the walking pace         | Needs your decision; code meets the current targets |
| P17      | Routes may pass through districts already unlocked when their two districts don't touch | Needs your decision; Route 3 already does this      |
| P18      | Journal step "Beat the trainers in <district>"; trainers stand on any route through it  | Needs your decision; built this way                 |
| P19      | Fainted creatures recover by themselves after 8 hours                                   | Built at your request; fold in                      |
| P20      | Orbit camera (exact drag rotation), tilt 30–76°, fog wall and sky                       | Built at your request; fold in                      |
| P21      | Revive Blossom (revive at full HP): where players get it                                | Built at your request; source needs your decision   |

## Development plan

- Mark **M2d** done; the owner-feedback round after it is done too.
- Next stays **Gate 3**. First verify the district 1–2 POIs on site, including the moved
  trainers Freja (Jernbanegade), Karen (Albani Torv) and Mads (the path along Odense Å).
