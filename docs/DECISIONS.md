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
  enforces one leader per arena. `content/odense/player-teams.json` holds one preset per arena:
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
  - `content/odense/spawns.json` is empty until M2.
  - `requires` was a free id until M1.7; it must now name a field ability (D55).
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

## M1.7: GDD v1.2 sync

- **D55. Field abilities as data.** `content/shared/field-abilities.json` holds
  `{id, badge, types[]}` for forager (2; grove, folk), angler (3; water), runereader (4;
  stone, folk), nightseer (5; spirit, storm), sealbreaker (6; stone, folk) and homing (7;
  storm). Names are i18n keys `fieldAbility.<id>.name` (en from the GDD, da Sanker,
  Lystfisker, Runelæser, Natteøje, Seglbryder, Hjemfinder).
  - Validation checks the schema, that each badge unlocks at most one ability, that every
    ability has a name in both locales, and that a spawn's `requires` names an existing
    ability.
  - Effects and teaching come in M2.
- **D56. Franchise-term guard.** `packages/data/test/franchise-terms.ts` holds a short,
  hand-written deny-list: Pokémon brand words and the field-move names Cut, Fly, Surf,
  Strength, Rock Smash, Flash, Waterfall, Whirlpool, Dive, Defog, Rock Climb and HM.
  - **Names:** species, move, item and field-ability ids and their da/en names must not
    _equal_ a term (case-insensitive; `_` in ids reads as a space).
  - **i18n:** every da/en string must not _contain_ a term as a whole word (Unicode
    letters count as word characters, so "Shortcut" and "flygt" pass).
  - **Side effect:** the Danish word "fly" (aeroplane) can't be used on its own.
  - **Scope:** docs aren't scanned; they discuss the terms on purpose.
  - **First run:** no hits.
- **D57. Proposals P1–P7 accepted in GDD v1.2.** Code was checked against the new text:
  - **P2** (Switch, Item, Catch and Run before moves) is how the engine has worked since
    M1 (D9).
  - **P7:** the battle button is "Bag" / "Taske".
  - **P5:** leader teams of 2–6; the schema allows 1–6.
  - **P3/P4:** the GDD now defers field names to the code.
  - **P6:** grove strength is tracked in BALANCE.md.
  - **P1:** no old ability names in code, content or i18n (the guard enforces it).
- **D58. Pages workflow skips private repos.** Pushes to a private repo don't run the
  GitHub Pages job (option B uses Cloudflare Pages); manual runs still work.

## M1.8: Publish to GitHub Pages

- **D59. Public repo** `github.com/chrisesdk/OdenseMonsterLeague`, created with `gh repo
create … --public --source . --remote origin`.
  - Notices: "Source available, all rights reserved", no open-source licence (README;
    `"license": "UNLICENSED"` in package.json).
  - Before the first push, tracked files and the full history were checked for secrets,
    `.env` files, local paths and emails. Nothing was found besides the owner's first name
    in the GDD byline, which is the owner's own document.
  - All commits use the GitHub noreply address.
  - `.gitignore` covers `.env*`, key files, playtest exports (`oml-gate2-*.json/csv`, a
    root `/gate2/` folder) and local tool settings.
- **D60. Sub-path build.** GitHub Pages serves the project at `/OdenseMonsterLeague/`.
  - The deploy workflow sets `VITE_BASE` from the repo name; dev and local preview stay
    at `/`.
  - Vite rewrites `index.html` URLs. The PWA manifest uses relative `start_url`/`scope`
    (`.`), and the service worker registers at `<base>sw.js` with scope `<base>`.
  - `apps/client/scripts/check-base.ts` (unit-tested) fails the build if `dist/` HTML,
    CSS, the manifest or the SW registration reference a root-absolute URL outside the
    base. It runs in CI and in the deploy job.
  - Verified locally with a static server that serves `dist/` only under the prefix
    (root = 404), then live.
- **D61. Custom domain inherited.** The owner's user site `chrisesdk.github.io` has the
  custom domain `www.christianrasmussen.dk`, so GitHub serves this project at
  `https://www.christianrasmussen.dk/OdenseMonsterLeague/` and 301-redirects the github.io
  URL there, over **http://**, since HTTPS isn't enforced on the user site.
  - The tester link is therefore the HTTPS custom-domain URL. Service workers and Web
    Share need a secure context.
  - Changing the portfolio's settings is the owner's call; this project never touches
    that repo. No CNAME file was added here.
- **D62. Live verification** (phone-sized headless Edge, live HTTPS site):
  - the page and all assets return 200;
  - start → wild battle → rating → JSON export works;
  - the service-worker scope is `/OdenseMonsterLeague/`;
  - the app reloads offline (including `#/dev`);
  - no failed requests and no console errors.

  The portfolio root still returns 200 (unchanged). The first deploy run succeeded without
  a re-run, because Pages was enabled while the job was still queued.

## M2a: map and shared spawns

- **D63. Region builder method** (`tools/region-builder`).
  - **Inputs:** one Overpass query for the bbox (10.30–10.47 E, 55.35–55.43 N; config in
    `src/config.ts`), cached in `tools/region-builder/cache/` (gitignored).
  - **Sea and harbour basins:** these are bounded by `natural=coastline` lines, so water
    _polygons_ also come from the Protomaps extract's `water` layer (zoom 15).
  - **Sampling:** biome shares are the fraction of each res-10 cell's 49 res-12
    child-centre samples that fall in a biome.
  - **Priority** (when a sample is in several areas): water > forest > park > historic >
    meadow > farmland > industrial > urban.
  - **Buffers (radius):**
    - water lines: river 15 m, canal 10 m, stream 5 m;
    - historic features: 20 m;
    - noSpawn points: 30 m;
    - rail: 10 m;
    - motorway/trunk: 20 m.
  - **noSpawn** (GDD list), if **any** sample overlaps:
    - schools, kindergartens/childcare, hospitals, cemeteries, military areas, aerodromes;
    - `railway=rail`, motorway/trunk roads (incl. links).
  - **Light rail and tram tracks** (Odense Letbane) are **not** noSpawn: they run along
    main streets people walk every day.
  - Samples in no mapped area stay unclassified, so shares can sum to less than 100%.
  - Run: `pnpm region:build` (about 2 s from cache).
- **D64. Region file** `packages/data/region/odense/region.json`.
  - **Format:** `{region, version, h3Res 10, coarseRes 7, bbox, biomes[], osmTimestamp,
districts[{id, wildLevels, draft}], cells{h3: [district, noSpawn, …shares %]}}`.
  - One cell per line, shares as integer percent.
  - Cells without a district or any biome are dropped.
  - Validated by `pnpm validate` (schema, districts 1–8, stale-file check).
  - Size: 7,562 cells, 316 KB raw / 47 KB gzip.
- **D65. Districts** (`packages/data/content/odense/districts.geojson`, hand-editable).
  - District 1 is drawn along real streets: the railway north of the station, Nørregade,
    Overgade/Vestergade, Kongensgade/Klostervej, Vestre Stationsvej. It includes Kongens
    Have and the station and excludes the H.C. Andersen quarter and the cathedral square.
  - Districts 2–8 are Voronoi placeholders around their GDD arena landmarks, clipped to
    the bbox, `draft: true`.
  - `wildLevels` are the GDD bands.
  - `draft-districts.ts` made the first version only. The GeoJSON is now the source; edit
    it by hand (e.g. geojson.io) and re-run `pnpm region:build`.
- **D66. Map.**
  - **Tiles:** a PMTiles extract of the Protomaps basemap (build 2026-11-18, schema 4.15),
    8.4 MB, served from Pages. Range requests verified (206).
  - **Style:** custom "paper" MapLibre style; water, parks and forest in strong colours.
  - **Fonts:** Noto Sans glyphs (OFL), self-hosted, so the map makes no third-party
    requests.
  - **Attribution:** `© OpenStreetMap contributors · Protomaps`, always visible
    (non-compact).
  - **Offline:** tiles are not precached; offline map tiles come in M3. Spawn lists are
    cached for the window.
- **D67. Spawn rules** (`packages/spawn`, pure; same lint rules as the engine; h3-js
  allowed).
  - **Density** per res-10 cell per window = Σ share × `DENSITY[biome]`, 0 in noSpawn
    cells.
    - Values: water 1.0, forest 0.95, park 1.0, meadow 0.85, farmland 0.6, urban 0.5,
      industrial 0.4, historic 0.6.
    - Count = ⌊density⌋ + (rng < fraction), capped at 3.
  - **Species weight** = entry weight × Σ share(biome) × preference(biome). Entries are
    filtered by district and by day/night (`time`).
  - **Day/night:** sunrise/sunset from the NOAA equations at the region centre, at the
    window midpoint. Checked against published times to within about 2 minutes.
  - **Level:** uniform in the district band.
  - **Position:** a res-12 child centre that lies inside the cell after rounding to
    6 decimals.
  - **Id:** two FNV-1a hashes of `region|window|cell|index` (16 hex digits).
  - **RNG:** the engine's sfc32, seeded by mixing the HMAC seed words, the cell hash and
    the window.
- **D68. Spawn tables** for districts 1–2 (`content/odense/spawns.json`).
  - Seven commons/specials plus Lygtling (night only) and two rares that need a field
    ability: Loftnisse needs runereader (district 1), Søormling needs angler (district 2).
    These show as "rustling" hint markers.
  - Starter lines are not wild; evolved forms are rejected by validate.
  - Every biome has at least one species in each district.
- **D69. Density report** (`pnpm spawn:report`, a CI gate).
  - **Method:** seeded random walks (10 m steps, gentle turns, kept inside districts 1–2),
    12 walkers × 1.2 km per window, 96 windows over 3 days (day and night).
  - **Counted:** battle-able spawns within 40 m.
  - **Classes:** green = water+forest+park+meadow ≥ 50% of the cell; streets =
    urban+historic+industrial ≥ 50%.
  - **Result:** green 1 per 238 m (target 150–300), streets 1 per 432 m (target
    300–500).
- **D70. Spawn service** (`apps/spawn-service`, Cloudflare Worker).
  - **Parameters:** only `region`, `cell` and `window` are accepted; anything else
    (e.g. `lat`) is a 400.
  - **Cell:** must be a valid res-7 cell containing region cells.
  - **Window:** `current`, `next`, or the equivalent numbers; past and later windows are
    rejected.
  - **Response:** `Cache-Control: max-age` until the requested window ends.
  - **CORS:** the live domain and localhost only.
  - **Rate limit:** Workers rate-limit binding, 60/min, keyed by the client IP in memory
    only.
  - **Logging:** no `console` calls; observability, logs and Logpush off;
    `send_metrics = false`.
  - **Secret:** `SPAWN_SECRET` only via `wrangler secret put` (prod) or `.dev.vars`
    (local, gitignored).
  - **Bundle:** 173 KB gzip (free limit 3 MB).
  - **Tests:** `@cloudflare/vitest-pool-workers` 0.8.71, the newest release that supports
    our Vitest 2.1; it prints a harmless warning about the `ratelimits` key.
- **D71. Map game** (`#/`).
  - **Permission:** a short explanation screen before the browser's location prompt,
    skipped if permission was already granted.
  - **GPS:** `watchPosition` with high accuracy. Fixes worse than 50 m are ignored.
  - **Speed rule:**
    - speed comes from the device, or else from fixes at least 5 s apart;
    - spawns hide above 25 km/h and return below 20 km/h (hysteresis).
  - **Fetching:**
    - the player's res-7 cell is fetched for the current and next window;
    - when a point 350 m away in any of 8 directions lies in another res-7 cell, that
      cell is fetched too;
    - lists are cached in memory and IndexedDB until they expire.
  - **Display:**
    - spawns within 100 m are shown;
    - tapping one within 40 m starts a wild battle, from further away a toast says
      "walk closer";
    - the encounter toast vibrates only after the user has interacted.
  - **Once per spawn:** used spawn ids are kept in localStorage until they expire.
  - **Team:** the temporary player team is the arena-1 preset with the fire starter
    (until M2b saves).
  - **Pause:** map battles can be paused and resumed.
  - **Routes:** `#/playtest` (Gate 2), `#/dev` (battle page), `#/dev/map` (simulator),
    `#/dev/biomes` (debug).
  - **Not configured:** without `VITE_SPAWN_SERVICE_URL` a production build shows "spawn
    service not configured" with a link to the playtest. Dev builds default to
    `http://localhost:8787`.
- **D72. GPS simulator** (dev builds and `#/dev/map`).
  - **Controls:** teleport by tap, sample GPX (station → Kongens Have → Kongensgade →
    Klosterbakken → Munke Mose → Odense Å, about 1.9 km), ×1/×5/×20 time-lapse, fake
    40 km/h.
  - **Time-lapse** reports walking speed, so only the fake toggle trips the speed rule.
  - **Test hooks:** `window.__omlSim` and marker `data-lat/lng` exist for automated
    checks only, and only when the dev tools are on.
- **D73. Privacy test** (`apps/client/test/privacy.test.ts`) fails if:
  - a spawn request carries anything but `region`, a res-7 `cell` and `window`;
  - a finer cell can be sent;
  - any client module other than `src/map/spawnApi.ts` makes network calls (`fetch`,
    `sendBeacon`, XHR, WebSocket, EventSource).
- **D74. A1 art** (`packages/art`).
  - **Generator:** code creates every sprite, deterministic from the species id, its
    types (features per type), its stage (evolved = crest) and its stat total (size).
    Map markers and a species-neutral hint marker come from the same code.
  - **Manifest:** `assets.json` gives file, kind, species, source `code`, author, licence
    `own` and `placeholder: true` for every asset.
  - **CI check:**
    - every species has a sprite and a marker entry, and every file has an entry;
    - licences come from the allow-list `CC0-1.0`, `CC-BY-4.0`, `own`, `artist-licence`;
    - the files are up to date with the generator.
  - **Accessors:** `spriteUrl()`/`markerUrl()` refuse anything without a manifest entry.
  - **Use:** the battle screen (map and playtest) uses the sprites, with type tags kept
    for colour-blind readability.
- **D75. PWA precache:** includes the label fonts; excludes the region chunk (only used by
  the dev biome view).
- **D76. CI:**
  - Actions bumped off the deprecated Node 20 runtime: checkout v7, setup-node v7,
    pnpm/action-setup v6, configure-pages v6, upload-pages-artifact v5, deploy-pages v5.
  - CI runs on Node 22.
  - New steps: `pnpm spawn:report` and a Wrangler dry-run of the Worker.
  - The Pages build takes `VITE_SPAWN_SERVICE_URL` from the repo variable
    `SPAWN_SERVICE_URL`.

## GDD v1.4: accepted P10 and P11

- **D77. No-spawn rules (supersedes the "any overlap" part of D63).**
  - **Cell rule:** a cell is `noSpawn` when at least 25% of its 49 res-12 sample points lie
    in a no-spawn area (schools, kindergartens/childcare, hospitals, cemeteries, military
    areas, aerodromes, heavy rail ±10 m, motorway/trunk ±20 m).
  - **Position rule:** in every other cell, sample positions inside those areas **or within
    5 m of light-rail/tram tracks** (Odense Letbane, now in the Overpass query) are blocked.
    No spawn is ever placed there.
  - Light rail never counts toward a cell's 25%.
  - **Format:** blocked positions are stored per cell as a bit mask over `cellToChildren(cell,
12)` order, in an optional 11th column of the region file (format **version 2**; 49
    bits fit exactly in a JSON number).
  - **Spawn package:** spawns only take unblocked positions that lie inside the cell; a
    cell with no free position gets no spawns.
  - **Effect** (OSM data of 2026-11-20):
    - noSpawn cells: 1,032 → **502 of 7,562 (6.6%)**;
    - 660 other cells keep spawning with some blocked positions;
    - Eventyrhaven spawns again (1 of 49 positions blocked, by the kindergarten).
  - **Density** (`pnpm spawn:report`): green 1 per **221 m** (was 238), streets 1 per
    **371 m** (was 432). Both still within the GDD targets.
- **D78. Overpass backoff.** The region builder retries HTTP 429/502/503/504 after 30, 60,
  120 and 240 s, as the Overpass servers ask. A cached response is reused whenever the
  query is unchanged.

## Worker/client drift guard

- **D79. Versions.**
  - **`regionData`:** the first 12 hex digits of SHA-256 over the region cells and
    districts. `pnpm region:build` writes it into `region.odense.json` (`dataVersion`) and
    into the tiny `region.odense.version.json`, which the client imports instead of the
    324 KB region file. Validate fails if the two disagree.
  - **`spawnRules`:** `a<SPAWN_ALGORITHM>-<hash32 of density table, per-cell cap, window
length, position resolution and spawn tables>`.
  - **Code changes:** a golden test in `packages/spawn/test/version.test.ts` (fixed
    synthetic region and tables) fails whenever spawn _code_ changes its output, until
    `SPAWN_ALGORITHM` is bumped.
- **D80. Reporting.**
  - **Worker:** returns `versions` in every `/v1/spawns` response (not in headers, so no
    CORS changes).
  - **Client:** `src/map/versions.ts` compares them with its own; a missing `versions`
    field counts as a mismatch.
  - **On a mismatch:** `console.error` once per distinct mismatch; a dev-tools-only
    warning chip on the map; nothing player-visible.
- **D81. Automatic Worker deploys** (`.github/workflows/spawn-service.yml`) on pushes to
  `main` touching the Worker, `packages/spawn`, `packages/data`, the engine RNG or the
  lockfile.
  - **Before deploying:** validate plus the data/spawn/Worker tests.
  - **After deploying:** it verifies the live Worker reports this commit's versions
    (6 tries, 10 s apart).
  - **Credentials:** a Cloudflare API token limited to _Account · Workers Scripts · Edit_
    for the owner's account (secret `CLOUDFLARE_API_TOKEN`) plus the variable
    `CLOUDFLARE_ACCOUNT_ID`. The job fails rather than skips when they're missing.
  - **Ordering:** the Pages and Worker deploys run in parallel, so a dev build may briefly
    show the drift warning for a minute after a push.

## M2b: district 1 playable

- **D82. Obedience in the engine.** `SideConfig.obedienceLevel` (number or null) is copied
  to `Side.obedienceLevel`.
  - A creature above that level ignores the order 50% of the time (`DISOBEY_CHANCE`). The
    roll happens after the sleep/paralysis checks and uses no PP (event `disobey`).
  - `null`/missing = always obey: trainers, leaders and wild creatures never set it.
  - The map game passes `15 + 5 × badges` (packages/game `obedienceLevel`).
- **D83. Field abilities take a move slot.** A taught ability is
  `CreatureInstance.fieldAbility`; that creature can know 3 moves.
  - Level-up learning respects the 3-move cap: a 4th learnset move becomes a
    learn-or-skip choice.
  - Teaching to a creature with 4 moves asks which move to forget. Forgetting the ability
    frees the slot.
  - Who can learn it: the ability's badge is won (or it is switched on with the dev
    toggle) and the creature has one of its types.
  - Spawns with `requires` can be battled only when a **team** member has the ability;
    otherwise they show as hint markers, as in M2a.
- **D84. `packages/game`.** The save type and all progression rules are pure functions in
  a new package under the same purity lint as engine and spawn (h3-js allowed). The GDD
  says save types live in `packages/engine/src/types.ts`; see proposal P12.
- **D85. Save format v1** (`SaveGame`, Zod-validated on load).
  - **Fields:** seed, onboarding step, starter, team, storage, bag, badges, defeated
    trainers, seen/caught per district, `lastRestock` per rest stop, used spawns,
    dev-unlocked abilities, the active battle, pending learn/evolve choices, next uid and
    settings.
  - **Storage:** IndexedDB database `oml-save`, key `save`. Writes are queued so they land
    in order.
  - **Autosave:** every state change is saved: battle turns, battle end, catches, items,
    rest stops, badges, team and storage moves, settings.
  - **Migrations:** `migrations[n]` turns version n into n+1. v0 is the M2a localStorage
    data: used spawns carry over, and the old dev-team map battle is dropped.
  - **A save that fails to load** is copied to `backup-<time>`, and the player gets
    "Start over" instead of a crash.
  - **Export:** Settings → Export save writes the JSON (share sheet or download).
  - **Delete:** Delete save needs two taps.
- **D86. The save holds no location.**
  - **Tutorial creature:** its position is kept in memory only and re-rolled after a
    reload.
  - **Used spawns:** stored as opaque ids with their expiry, and pruned on every write, so
    at most the last 15 minutes' worth exists.
  - **Rest stops:** `lastRestock` holds POI ids and device times, which the GDD Data model
    asks for.
  - **Tests:** the game package and `apps/client/test/privacy.test.ts` scan a save (with
    a map battle built from a full service spawn) and the exported file for coordinate
    keys, coordinate-like numbers and H3 cells.
- **D87. Starter.**
  - **The three starters:** Gnistkat, Åodder and Bøgling, at **level 5**. That suits
    route trainers at L4–9, and the arena-1 expected team reaches L10 by then.
  - **Start bag:** 5 Basic Charms and 2 Small Tonics, the same as one rest-stop restock.
    The GDD sets neither the starting level nor the bag; see P13.
- **D88. Tutorial creature.**
  - **Creature:** a level-3 Torvdue, visible only to this player.
  - **Placement:** sampled 120–180 m away, snapped to an unblocked res-12 position in a
    region cell that is not no-spawn, so never in a no-spawn area or on light-rail tracks.
    Outside the region file it is placed without checks. It is placed again if the player
    is more than 600 m from it (a poor first fix).
  - **Easy catch:** the battle uses a copy of the content with catch rate 255. With the
    GDD formula and a Basic Charm that is ≈ 33% at full HP and ≈ 100% at 1 HP.
  - **Guidance:** a hint line in the battle and a guide card with an arrow on the map.
  - **Ending:** onboarding finishes only with the catch. If the tutorial creature faints,
    the player runs or the team faints, the team is healed for free and a new creature
    is placed. The bag is topped up to 3 Basic Charms for each tutorial battle.
- **D89. District-1 guidance.** After onboarding, and until the first trainer is beaten,
  the map shows arrows and distances to the nearest unbeaten district-1 trainer and the
  nearest district-1 rest stop. Inside district 1 it shows only the rest stop. The card
  hides while the player stands inside a POI radius, where that POI's own card shows.
- **D90. Trainers and the arena.**
  - **POI card:** inside a POI's radius, a card shows the trainer's name, intro line and a
    Battle button.
  - **Each trainer battles once.** A win adds them to `defeatedTrainers`, shows their
    defeated line and adds their `reward` to the bag; the stamp gets a tick.
  - **Arena:** trainers are fought in the POI's order (juniors, then the leader). The
    leader's win adds the badge and opens the ceremony screen (badge art, the new
    obedience level, the district unlock).
  - **Locked districts:** a trainer whose district is locked refuses with the badge that
    unlocks it ("Come back with the Munkemose badge"). A fully fainted team cannot start
    a battle.
- **D91. Rest stops.**
  - **Rest button:** inside the 40 m radius it fully heals HP, status and PP. It is a
    button, not automatic, so the player sees what happened.
  - **Restock:** the POI's `restock` items, once per hour per rest stop, by device time.
  - **Clock guard:** a stored restock time in the future (the clock was set back after
    it) blocks that stop until device time passes it plus the hour. Setting the clock
    forward is not guarded; that is the "basic guard" the brief allows.
- **D92. Losing.**
  - **The team stays fainted.** Wild spawns and trainers refuse (`teamFainted`) until a
    rest stop or items heal someone.
  - **The map shows the nearest rest stop** with an arrow and distance.
  - **Nothing else is lost:** XP is kept and the bag keeps what wasn't used. A lost
    trainer can be fought again.
- **D93. District locks and "too wild".**
  - **Unlocks:** district 1 is always open; district d opens with badge d−1.
  - **Spawn districts:** come from the region file's res-10 cell. The 330 KB region chunk
    is now lazy-loaded by the map and precached by the service worker (it was excluded in
    M2a), so the game works offline.
  - **Locked spawns:** greyed markers labelled "too wild to catch"; tapping says which
    badge is needed.
  - **Note:** districts 2–8 are still Voronoi drafts. Munkemose currently lies in draft
    district 4, so M3 must redraw them before the badge names and unlocks line up on the
    ground.
- **D94. Battles from the map.**
  - **Saved every turn:** the battle state and any new learn/evolve choices go into the
    save after every turn. After a reload or closing the app, "Resume battle" continues
    exactly where it stopped.
  - **Catches** go to the team, or to storage when the team has 6.
  - **Learn/evolve questions** are asked from the save after the battle, and each answer
    is saved at once. Evolving also marks the new species caught.
- **D95. Items outside battle.**
  - **Tonics:** on a creature that isn't fainted and isn't at full HP.
  - **Clear Drops:** on a creature with a status.
  - **Revive Leaf:** on a fainted creature, to 50%.
  - **Who:** team and storage creatures alike. Charms work only in wild battles.
- **D96. Field guide.**
  - **Seen** is marked when a wild battle starts and for each member of a trainer's team.
    **Caught** is marked by a catch, the starter or an evolution.
  - **Per district:** wild by the spawn's district; tutorial, trainers and evolutions
    count as district 1 for now (all v1 POIs are in district 1).
  - **Unseen species** show as silhouettes with "???".
  - **Hints** come from the spawn tables: the top one or two biomes (those with at least
    75% of the top weight), day/night, and the required ability.
- **D97. Settings live in the save.**
  - **Language** follows the save.
  - **Text size** scales the root font (100/112.5/125%).
  - **Reduce motion** turns off animations everywhere, as well as the OS setting.
  - **Battle speed** is normal/fast.
  - **Sound** is stored for when sounds exist (there are none yet).
- **D98. Art.** POI stamps (arena, trainer, rest stop, each plain and "done") and badge
  art (8 badges, earned and empty) are code-generated A1 placeholders. The manifest
  gained the kinds `stamp` and `badge`.
- **D99. Speed.** Above 25 km/h the POI cards (and their Battle/Rest buttons) hide, like
  spawns (GDD Safety: no prompts above 25 km/h).
- **D100. Gate 3 sessions** (Settings → Walk test). Opt-in, with a tester code; stored in
  localStorage until shared.
  - **Distance:** summed on the phone from fixes with ≤ 50 m accuracy. Steps under 5 m
    are added up; jumps faster than 25 km/h are dropped. Only the metres total is kept.
  - **Spawns seen:** battle-able spawns (status ok) that came within 100 m, once per id.
  - **Battle time:** active time with the Gate 2 timer, paused in the background. It is
    not carried over a reload.
  - **Dark:** "after dark" uses Odense's sun times, not the player's position.
  - **Ending a session:** asks "How fun was this walk?" (1–5) and takes an optional
    comment.
  - **Export:** JSON and CSV through the share sheet. `pnpm gate3:report` reads them.
- **D101. End-to-end test.**
  - **Setup:** Playwright runs against a production build (`vite preview`, no spawn
    service) on a 390×844 touch viewport, using `#/dev/map` (simulator and dev hooks).
  - **Dev hooks:** `window.__omlDev` (`skipOnboarding`, `setTeamLevel`, `setTeamHp`,
    `addCreature`, `injectSpawn`, `grantAbility`, `teach`, `setFast`). It exists only
    with dev tools, so battle outcomes can be forced, and Forager and "too wild" can be
    tested without the service.
  - **Battles in the test:** the test's player uses the first usable move. The leader
    battle may be retried (with a rest-stop heal) up to 4 times.
  - **CI:** runs as its own `e2e` job (Chromium); the report is uploaded on failure.

## GDD v1.6: district redraw

- **D102. Districts 1–8 drawn on real borders** (`content/odense/districts.geojson`,
  generator and method in `tools/region-builder/districts/`; it replaces the M2a Voronoi
  draft and its script).
  - **Arenas:** each arena location from the GDD World table lies inside its own
    district, taken from OSM:
    - Kongens Have (the arena-1 POI);
    - Munke Mose park;
    - H.C. Andersens Hus;
    - Sankt Knuds Kirke;
    - Odense Havnebad;
    - Odense Zoo;
    - Den Fynske Landsby;
    - Fruens Bøge forest at 55.3712, 10.3722. The forest's centroid lies on the Svendborg
      railway, so this point is taken from its western part.
  - **Borders:**
    - **1** Centrum/station: railway (N), Nørregade (E), Vestergade (S), Pantheonsgade and
      Jarlsberggade (W).
    - **2** Munkemose: the railway and district 1 (N), Vestergade → Ansgargade →
      Kirkegårds Allé → Odense Å → Hunderupvej (E), Ring 2 (Kløvermosevej/Tietgens Allé,
      S), the Svendborg railway (W).
    - **3** H.C. Andersen quarter: railway (N), Nørregade (W), Overgade and Odense Å (S),
      Palnatokesvej/Grønlandsgade (E).
    - **4** Old town & cathedral: Vestergade/Overgade and Odense Å (N), Hunderupvej (W),
      Ring 2 (Tietgens Allé, Hunderupgade, Munkerisvej, Ørbækvej, S), Ejbygade (E), and
      the railway east of Grønlandsgade.
    - **5** Harbour: everything north of the main railway.
    - **6** Fruens Bøge: south of the main railway, west of the Svendborg railway.
    - **7** Zoo & river south: Ring 2 (N), the Svendborg railway (W), Hunderupvej (E),
      Skovalléen (S).
    - **8** Den Fynske Landsby: everything else in the south and east (east of the
      Svendborg railway, south of Skovalléen and Ring 2, east of Ejbygade, south of the
      railway).
  - **Outer areas** join the nearest outer district: the north (Tarup, Vollsmose) goes to
    5, the south-west (Dalum, Bellinge) to 6, the south-east (Hjallese, Odense SØ) to 8.
  - **Connectors** (no street in the extract): Jarlsberggade → Pantheonsgade (≈ 520 m,
    the old hand-drawn line, west of Kongensgade where trainer_niels stands); Vestergade →
    Ansgargade (180 m, along Vesterbro); the south end of Nørregade → the
    Vestergade/Overgade corner (95 m); the east end of Overgade → Odense Å (≈ 150 m);
    the Svendborg railway → the main line at the junction (43 m).
  - **Result:** 8 single polygons covering the whole region bbox, with no gap or overlap.
    Areas: 0.45 / 3.30 / 0.49 / 4.51 / 45.4 / 18.7 / 1.36 / 21.5 km². All `draft: false`.
  - **Region build:** 7,582 cells (20 more than before, since the bbox is now fully
    covered). Density: green 1 per 243 m, streets 1 per 362 m (targets 150–300 / 300–500).

## M2c: GDD v1.7 arena order and open wildlife

- **D103. Districts renumbered** to the v1.7 loop. The polygons are unchanged; only their
  numbers and names change:

  | Old | New | District                |
  | --- | --- | ----------------------- |
  | 1   | 1   | Centrum / station       |
  | 4   | 2   | Old town and cathedral  |
  | 3   | 3   | H.C. Andersen quarter   |
  | 2   | 4   | Munkemose and the river |
  | 7   | 5   | Zoo and river south     |
  | 6   | 6   | Fruens Bøge             |
  | 8   | 7   | Den Fynske Landsby      |
  | 5   | 8   | Harbour                 |
  - **Badge names follow:** 2 Cathedral, 3 Fairy-tale, 4 Munkemose, 5 Zoo, 6 Beech,
    7 Village, 8 Harbour.
  - **Save v2:** the migration `1 → 2` renumbers the districts stored in the field guide
    (seen/caught) and in an active wild battle. Badges are unchanged, so badge 1 now opens
    the cathedral district.

- **D104. Spawn format** (`SPAWN_ALGORITHM` 3).
  - **Spawn fields:** a spawn carries `rarity`, `levelRoll` in [0, 1) and its `district`,
    instead of a level. The roll takes the RNG draw the level used to take.
  - **Level on the phone** (`spawnLevel` in packages/game): band = the player's band for
    commons (district min(badges + 1, 8)), or the spawn's district band for rares; level
    = lo + ⌊roll × (hi − lo + 1)⌋.
  - **Bands** are read from `districts.odense.geojson` (`wildLevels`).
- **D105. Locks** (`spawnStatus`).
  - Commons without a field ability are battle-able in every district.
  - In a locked district, rares and field-ability layers are "too wild" (greyed).
  - In an unlocked district, a missing field ability shows the hint marker.
  - Trainers and arenas in locked districts refuse, as before.
- **D106. Spawn tables for all 8 districts** (`spawns.json`, `rarity` required).
  - **Commons:** the same seven commons everywhere (Torvdue, Rendsnude, Mosbille,
    Grimælling, Brokrabbe, Kulingmåge, and Lygtling at night), with per-district weight
    factors (e.g. Brokrabbe ×2 in the old town, Grimælling ×2.5 by the river, Kulingmåge
    ×2.5 at the harbour).
  - **Rares by place:**
    - 1: Loftnisse;
    - 2: Kampetrold (new);
    - 3: Loftnisse;
    - 4: Søormling;
    - 5: Søormling and Kampetrold;
    - 6: Ellepige (new);
    - 7: Loftnisse;
    - 8: Søormling.
  - **Field-ability layers** are marked rare: Loftnisse (runereader) and Mosbille
    (forager) in 1, Søormling (angler) in 4, Ellepige (forager) in 6.
  - **Starter lines stay out of the wild** (D68). Fruens Bøge and the cathedral district
    had no fitting rare, so two placeholder species were added: Kampetrold (Stone, a
    fieldstone troll, BST 320, catch rate 45) and Ellepige (Grove/Spirit, a forest
    elf-maid, BST 330, catch rate 45). See proposal P14.
- **D107. POI rules.**
  - **Region build:** a POI's own res-10 cell always gets the POI's district (the library
    rest stop's cell had counted as district 3).
  - **Validation:** fails when a POI's cell counts as another district, or when its
    interaction radius crosses its district's border.
  - **trainer_freja** moved from Gravene (17 m from the border) to the pedestrian part of
    Slotsgade by Odense Slot (195 m inside). It was first tried at the castle forecourt,
    but that is a no-spawn cell.
- **D108. Arena 2 and district 2.**
  - **Arena 2** (Stone) is in Klosterhaven, the public garden just south of Sankt Knuds
    Kirke (176 m inside district 2). Skt. Knuds Plads itself is only about 50 m from the
    district 1 border, too close for an 80 m arena radius; see proposal P15.
  - **District 2 POIs** (all `verified: false`):
    - junior trainer Klokker Poul (Brokrabbe L11, Torvdue L12);
    - leader Stenhugger Dorthe;
    - route trainers Kirketjener Karen at Albaniengen (L10–11) and Løber Mads in Sankt
      Jørgens Park (L12–14);
    - a rest stop on Munkemøllestræde by H.C. Andersens Barndomshjem.
  - **Arena 4** (Water): the former arena-2 Water leader, moved and scaled to 4 creatures
    at L25–27. Data only until M3.
  - **Presets:** the sim's expected player team now uses the evolved starter when the
    preset's starter level reaches the evolution level (arena 4: L27).
- **D109. Balance** (`pnpm sim:report`). Teams tuned, not the type chart.
  - **The problem:** Water and Grove starters hit Stone super-effectively, so a pure Stone
    team loses 100% to them while still beating Fire.
  - **Arena 2 leader:** Kampetrold L14 (with Squall Slap), Kulingmåge L13, Brokrabbe L15
    (with Sky Crackle), no items. The signature tactic is Storm coverage against Water and
    Grove.
  - **Arena 2 preset:** starter L15 + Grimælling L13, Mosbille L14, Kulingmåge L14 (the
    commons a district-1 player catches).
  - **Arena 2 result:** Fire 24%, Water 75%, Grove 81%.
  - **Arena 4 leader:** Grimælling L25 (Beech Lash), Kulingmåge L26 (Squall Slap, Sky
    Crackle), Strømodder L26 (Kiln Blast), Strømodder L27; 2 large tonics.
  - **Arena 4 preset:** evolved starter L27 + Kulingmåge 25, Brokrabbe 26, Mosbille 26,
    Torvdue 25.
  - **Arena 4 result:** Fire 22%, Water 43%, Grove 80%.
  - **Caveat:** win rates react in big steps to the leader's lead creature and items (the
    AI is close to deterministic). Arena 2 Water sits at the lower edge, 75–77% across
    seeds.
- **D110. Density report** now walks the whole region, since every district has a
  table.
  - **CI gate** (battle-able = no ability needed): green 1 per 201 m, streets 1 per 308 m.
  - **New 0-badge line** (commons only, outside district 1): 3.54 per km (green 1/203 m,
    streets 1/301 m); before M2c it was zero.

## M2d — Game feel (GDD v1.9)

- **D111. The drifting creature marker.** MapLibre places a DOM marker by writing
  `transform` on the marker's root element. The tutorial creature's idle `bob` animation
  also animated `transform` on that root, with only a 50% keyframe; the 0%/100% frames used
  MapLibre's inline translate, so the marker kept interpolating towards screen (0, 0), the
  top-left (north-west on an unrotated map).
  - **Fix:** every marker is a root (MapLibre's) plus an inner `.marker-body` that carries
    all animations. Nothing styles the root's `transform`, `transition` or `animation`.
  - **Second bug found by the new test:** updating a marker's state by assigning
    `className` also wiped MapLibre's own `maplibregl-marker` classes (absolute
    positioning), and the marker jumped about 56 px. State classes are now toggled one by
    one.
  - **Guards:** `apps/client/test/marker-css.test.ts` fails if any CSS rule moves a marker
    root; `e2e/map.e2e.ts` pans and zooms with animated markers on screen and checks each
    marker sits within 4 px of `map.project(lngLat)` (426 px off before the fix).
- **D112. Wild areas** are computed in the region build: a cell is wild when park, forest,
  meadow/field and water cover at least 50% of it; a wild cell with at least 25% water is a
  water edge (ripples instead of grass). Region file v3: column 1 of a cell row is a bit
  field (1 noSpawn, 2 wild, 4 water edge, 8 route corridor). 2,024 wild cells.
- **D113. Routes** (`content/odense/routes.json`, `pnpm routes:build`): Dijkstra over the
  OSM foot network (Overpass, cached). Cost per metre: footpaths and park paths 1, streets
  1.15–2.8 by size, steps 4; ×0.65 in wild cells, ×0.55 along water, ×2.5 in no-spawn
  cells, ×12 within 12 m of a railway or motorway (crossing stays possible). No routing
  service. Paths simplified (2 m) and rounded to 6 decimals.
  - **Districts:** a route may only use cells of the two districts it connects. Districts
    3 and 4 do not touch, so Route 3 falls back to districts already unlocked when it is
    walked (1–4) and passes district 2 along Odense Å; the data says so (`via: [2]`) and
    validation checks it (P17).
  - **Validation:** starts and ends within 150 m of its arenas, stays in its districts and
    `via`, at most 30 m within 12 m of a railway or motorway, length and wild share match
    the data. Draft routes only get a warning for the hazard rule (Route 7 runs 45 m next
    to a railway in the far east; it is fixed when it goes live).
  - **Arena sites** (`content/odense/arenas.json`): all 8 arena locations for routes, the
    Town Map and the Journal; built arenas link their POI. Sites 3–8 come from OSM and are
    approximate until their POIs are placed in M3 (Havnebadet especially).
- **D114. Route trainers.** Route 1's district-2 stretch (Vestergade to Klosterhaven) has
  no spot whose 50 m radius clears the border, the arena and the rest stop. District 2's
  trainers therefore stand where Routes 2 and 3 cross the district: Karen by Albani Torv
  (Route 2), Mads on the path along Odense Å (Route 3). Freja moved 139 m onto Route 1
  (Jernbanegade). Lise (107 m from Route 1, in Kongens Have), Ole (station square) and
  Niels stay: district 1 is the starting town and has no incoming route.
- **D115. Density (SPAWN_ALGORITHM 4).** A cell's biome density is multiplied by 1.6 in
  wild and route-corridor cells and 0.9 elsewhere. A route corridor is a cell with at least
  3 of its 49 sample points within 30 m of a route (270 cells). Species stay biome-weighted:
  in street cells 87% of the creatures found prefer urban, historic or industrial biomes,
  in wild cells 33%.
  - **spawn:report (CI gate):** wild 1 per 136 m (target 100–150), streets 1 per 331 m
    (300–400). 30-minute park walk (2 km at 4 km/h through a wild area of 40+ cells, two
    windows): 11.7 creatures on average, 10th–90th percentile 6–17 (target 10–14). With 0
    badges outside district 1: wild 1 per 135 m, streets 1 per 322 m, park walk 11.6.
- **D116. Journal** (`packages/game/src/journal.ts`, pure). Main chain per district:
  reach → walk its route (the live route that ends at its arena) → beat its trainers →
  visit one of its rest stops → challenge its arena. Steps without content are left out
  (no trainers yet) or "coming soon" (no arena POI yet). Steps complete in any order; the
  current goal is the first open step of the next arena's district.
  - **Route walking:** checkpoints every 100 m along the route; one counts within 30 m;
    80% of them completes the step. The arrow points to the next checkpoint after the
    furthest one reached.
  - **Side goals** (`content/odense/goals.json`): explore (300 m in the district's wild areas),
    catch a creature of the district's typical type (one that really spawns there as a
    common: district 7 uses Folk, since Fire starters are never wild), meet (battle) its
    rare creature.
  - **Save v3:** `journal` = districts reached, checkpoint indices per route, wild metres
    per district (capped at the goal), rest stops visited. No positions or times. The v2→v3
    migration counts rest stops in `lastRestock` as visited.
  - **Map card:** the current goal with an arrow relative to the camera bearing and a
    straight-line distance; the tutorial and a fainted team override it.
- **D117. Play camera.** Pitch fixed at 50° (min = max pitch), zoom 16.5–18.5, two-finger
  rotate and drag-rotate on, compass button eases north. Map padding (top 130, bottom 230
  px) keeps the player in the clear middle between the HUD rows. Dragging stops following;
  6 s after the last pan the camera snaps back, or at once with "Back to me". The follow
  `easeTo` is skipped while another camera move runs, so reset-north isn't cut short.
  - **Heading:** `deviceorientationabsolute` (Android), `webkitCompassHeading` after the iOS
    permission (asked from the compass button), else the GPS course; drawn as a cone that
    lies flat on the map. Nothing is stored.
  - **Creatures** drawn to 200 m, faint beyond 100 m, bobbing within 40 m. Markers are
    pooled by spawn id and updated in place; at 4× CPU throttle in headless Edge, walking
    Route 1 with 30 creatures injected averages 55 fps (95th percentile 35 ms, 1 frame over
    50 ms in 10 s), so a symbol layer is not needed yet.
  - **Night style:** sunset/sunrise from the spawn package's NOAA code for Odense's centre,
    re-checked every minute; switches the map palette in place (`setPaintProperty`) and the
    UI tokens (`html[data-theme=night]`), including the battle stage.
  - **Map labels** only use characters in the shipped glyph ranges (U+0000–01FF); dashes in
    route names become hyphens (a missing range logged parse errors).
- **D118. Town Map.** A second MapLibre map, flat (pitch 0, no rotate), zoom 12–16, the
  same paper style and world layers. Locked districts are dimmed and labelled with the
  badge they need. Cards show name, straight-line distance, district and what is needed.
- **D119. Design system** in `apps/client/src/ui/`: tokens (day/night colours, type scale,
  spacing, radius, shadow, motion), components (Button, Card, Sheet, Tabs, ListRow,
  ProgressBar, Pill, Toast, Modal), an original line-icon set, haptics. Fonts are
  self-hosted from npm (Fraunces for headings, Atkinson Hyperlegible for body, Latin subsets
  only) and listed with their OFL licence in `packages/art/assets.json` (`fonts`), which
  `pnpm art:build` writes and a test checks. The main menu button is a red satchel.
  - **Feedback:** catch and level-up bursts in battle, an evolution morph, paper confetti
    for badges, haptic patterns for each. Reduce motion (setting or OS) turns animations
    and haptics off.

## After M2d — owner feedback

- **D120. Orbit camera** (owner request; replaces D117's pan, snap-back and recentre). The
  camera always looks at the player. One-finger or mouse drag rotates the map around the
  player and never pans: the angle swept around the player's screen point turns the bearing,
  and a sideways swipe close to the player turns it as well. Pinch, two-finger twist and the
  scroll wheel work around the map centre, which the padding puts on the player.
  Double-tap zoom, box zoom and keyboard panning are off. The tilt follows the zoom
  (`transformCameraUpdate`): 50° zoomed out (16.5), 68° zoomed in (18.5), so zooming in
  looks further ahead. A drag that ends on a marker doesn't also tap it. The recentre
  button is gone; the compass still turns north up (`apps/client/src/map/orbit.ts`).
- **D121. Short GPS dips.** A fix worse than 50 m no longer hides the creatures at once:
  the last accurate fix stays in play for 90 s (`playableFix`, `GPS_GRACE_MS`), and the
  player figure stays there. Only after 90 s without an accurate fix does the map show "GPS
  is weak" (or a GPS error) and hide the creatures. Distances (Gate 3, Journal) only count
  between accurate fixes, so a dip adds no metres.
- **D122. Natural recovery** (owner request; GDD proposal P19). A fainted creature recovers
  fully by itself 8 hours after it fainted. The save (v4) keeps `faintedSince` (uid → device
  time). The client keeps it in step with the team and checks once a minute, but never
  during a battle. A rest stop or an item is still the quick way. The team screen shows the
  time left, and the fainted Journal card offers both options.
- **D123. Creature colours.** The placeholder art took its colours from the type, and Folk
  is grey, so district 1's commons all looked grey. Species now carry their own art
  colours (`colors: [body, accent]` in species.json, chosen to suit each creature: the
  pigeon slate blue, the gull white with a yellow beak, the crab orange…). Marker rings
  keep the type colour so the type still reads at a glance. A1 art was regenerated.
- **D124. Always centred, smooth corrections** (owner feedback). Before, the camera
  followed with a 600 ms `easeTo` per GPS fix, skipped while another camera move ran, while
  the figure jumped at once; so after a zoom or rotate, or with sparse fixes, the camera
  could sit off the figure. Now one frame loop draws the player: the figure glides towards
  the newest playable fix (exponential, 0.45 s time constant; jumps over 300 m snap) and the
  camera centre is set to the figure's position whenever the map is idle. During gestures
  and camera animations `transformCameraUpdate` pins the centre to the same position
  (calling `jumpTo` then would cancel the gesture). The accuracy ring moves with the figure.
  The e2e test checks the figure is mid-glide 150 ms after a 22 m correction and that the
  camera stays within 3 px of it throughout.
- **D125. Rotation feel and a steeper tilt** (owner feedback). The tilt runs from 55°
  (zoomed out) to 80° (zoomed in): closer to the ground, the camera looks further ahead.
  Drag-to-rotate (`dragRotation` in `src/map/orbit.ts`) now blends two parts by the
  stroke's direction:
  - **Around the player:** the part of the move that circles the player turns the map with
    the finger. The effective radius is clamped to 140–220 px, so dragging over the player
    no longer spins and strokes near the screen edges still turn decisively.
  - **Across the screen:** the part that points towards or away from the player turns the
    map by its sideways movement. Its direction is set once per stroke from where the
    finger starts (below/above, right/left of the player), so a long swipe from one side to
    the other, or up and down the side, rotates at the same steady rate (about 0.4° per px).
    A stroke aimed straight at the player hardly turns the map.
  - **Fling:** a quick swipe keeps turning and slows down over about 0.4 s.
  - **Tests:** unit tests cover circles, swipes along the top and bottom, side strokes,
    swipes through the player (never above about 0.43° per px) and direction-independent
    speed; the e2e test swipes across the screen level with the player.
  - **Frame rate:** at 4× CPU throttle, 44–50 fps (55° and 80°).
- **D126. Tilt measured, circles without a jerk, no icons from behind** (owner feedback).
  - **Tilt 65–72 degrees.** Measured in the real map (390 × 844 phone, ground distance from
    the player to just below the Journal card): zoomed out at 65 degrees 462 m; zoomed in at
    a fixed 65 degrees only 116 m; at 72 degrees 226 m, about twice that. From 73 degrees
    the horizon and an empty sky band come into view, which is why 80 degrees looked wrong.
    Doubling the zoomed-out 462 m would need 77 degrees (horizon on screen).
  - **The jerk.** The across-the-screen part took its direction from where the stroke
    started. A circle that isn't centred on the player (most are: thumbs circle the screen's
    middle) moved "the wrong way" relative to the player for part of the loop, and the map
    turned back there (rate swung from -0.44 to +0.13 degrees per px). Now a stroke tracks
    the finger path's own turning: a smoothly curving path drives the map with the curve
    (one map turn per loop, wherever the loop is), and straight strokes keep the
    player-relative rules (around + across, with the side following the finger with 60 px
    hysteresis and a decaying "circling intent"). A sudden reversal resets the curve.
    Tested on circles around, beside and far from the player, small and large, both ways:
    always the same direction, step-to-step change under 0.05 degrees per px.
  - **Icons from behind.** DOM markers have no depth test, so a point behind the tilted
    camera (about 1.1 km behind the player zoomed out, 290 m zoomed in) was projected
    mirrored onto the screen: city-centre stamps showed up when looking away. Every icon
    (stamps, creatures, the Journal star) is now hidden when it lies further behind the
    player than the bottom edge of the screen reaches, or more than 2 km away
    (`markerInView`, checked about 7 times a second).
- **D127. 3D buildings** (owner request). A `fill-extrusion` layer on the basemap's
  buildings (play view only; the Town Map stays flat). It is GPU-drawn per vector tile and
  the tiles (zoom 14–15, overzoomed) already simplify the shapes, so the level of detail
  comes from the tiles and every building in view is drawn as one cheap mesh per tile.
  - **Heights:** the OSM height where Odense has one (about one building in ten), otherwise
    a typical height for its kind (house 7 m, apartments 14 m, church 18 m, shed 3 m, …)
    plus up to 3 m from the house number so streets aren't uniform. Everything is drawn at
    55% (`BUILDING_SCALE`) and capped: full-height blocks hid the street around the player
    under the tilted camera.
  - **Order:** added last, so buildings hide routes and wild areas behind them; creature
    and stamp icons are HTML and stay on top. Day and night colours follow the palette.
  - **Frame rate** (headless Edge, 4× CPU throttle, Route 1 walk, 30 creatures; 3 runs each):
    39–50 fps zoomed out, 40–48 fps zoomed in, 95th-percentile frame 28–35 ms, 0–3 frames
    over 50 ms in 10 s (48–51 fps without buildings).
- **D128. Loading screen.** On the first map of a session a paper screen with a swinging
  lantern lists "Finding your position" and "Building the town" and ticks them off. It
  leaves when there is a playable GPS fix and the map has gone idle (tiles and buildings
  in place) after the player was placed. It never waits more than 20 s, and a GPS error
  ends it at once (the map then shows its banner). Not shown again after battles.
- **D129. Fling and tests.** The fling's speed is now measured over the stroke's last
  100 ms (events can come 1–3 ms apart, which made a fast swipe spin half a turn after
  release), only when the finger was still moving at release, and capped at 0.6 degrees
  per ms (at most about 90 degrees extra). E2E traces are off: traces of the long map tests
  exhausted the test runner's memory in CI (failure screenshots are kept). Creature icons hidden
  behind the camera are no longer "visible" to Playwright, so the tests wait for markers
  to be attached instead.
- **D130. The map goes idle again.** Once the player figure had arrived, the frame loop
  re-sent the accuracy ring's data every frame, so the map re-rendered forever: the loading
  screen (which waits for the map to go idle) always hit its 20 s fallback on the live site,
  phones rendered constantly (battery), and CI's software renderer slowed to a crawl with
  the 3D buildings. The ring is now only updated when it moves or changes size; the loading
  screen finishes in about 1 s locally. The district e2e's trainer win against Ole was a
  coin flip (the test always used the first move, a Folk move Brokrabbe resists, and
  Brokrabbe stalls with Hunker Down); the test now uses Beech Lash there.
- **D131. Owner feedback round: 3D opt-in, labels, simpler rotation, HUD on demand, tilt.**
  - **3D buildings are an opt-in setting** (Settings → 3D buildings; save v5 adds
    `settings.buildings3d`, false, also for existing saves). Off shows the flat building
    outlines; the switch applies live.
  - **Facing labels above buildings:** place and water names (the labels that stand up and
    turn towards the camera) are moved above the 3D buildings layer.
  - **Rotation, simplified:** only motion around the player turns the map
    (`dragRotation` = tangential motion / effective radius 140–260 px). Strokes below or
    above the player, along the sides, and half or full circles turn it; a horizontal swipe
    level with the player moves towards/away from it and turns it 0–8 degrees within ±40 px,
    helped by damping each move by (r / 200 px)³ near the player. Nothing is blocked. The
    across-the-screen term, stroke side, circling intent and path curvature are gone; the
    time-based fling stays.
  - **HUD on demand:** the Journal goal starts folded as a round arrow button (tap: the goal;
    tap again: the Journal; a chevron folds it); the Nearby strip opens from a paw button
    with a count. The "Looking for creatures" banner is gone, and a missing or weak GPS fix
    is a small signal icon (with the full text as its label) instead of a sentence.
  - **Tilt on phones:** a simulated touch pinch did tilt (zoom 17.5 → 18.5, 68.5 → 72
    degrees), but 65–72 was too subtle to see. The range is now 65–76, and a haze along the
    top of the map hides the map's far edge, which at a steep tilt ended in a visible cut
    (the "rendering glitch" on PC).
- **D132. 30 degrees zoomed out, fog and sky** (owner feedback).
  - **Tilt 30–76 degrees:** zoomed out the camera looks almost straight down (30); zooming
    in tilts it up to 76.
  - **Low distance fog** (MapLibre 4 has no built-in fog): concentric rings around the player
    drawn above the map, clear up close, thickening from 150 m and solid from 480 m when
    zoomed in; the distances double per zoom level out (`fogRadii`), so the fog band always
    sits in view rather than squeezed against the horizon. The map background (past the
    horizon) takes the fog colour.
  - **Buildings despawn inside the fog:** the 3D layer has a `distance` filter that draws
    only buildings within 60% of the fog band (updated every 40 m walked or on a zoom
    change, since a filter change re-processes the tiles). Icons stop at the fog's solid
    edge too.
  - **Sky:** a day or night sky gradient above the fog, shown only at steep tilts (none up to
    55 degrees, full at 76), so the near-top-down view isn't fogged.
  - The district e2e answers a pending evolve/learn question before opening the menu (which
    creature reaches its evolution level depends on random catches).
- **D133. Fog moved out, buildings stay, no pull-to-reload** (owner feedback).
  - **Fog further out:** zoomed in it starts at 400 m and is solid at 1,100 m (doubling per
    zoom level out, so zoomed out it lies beyond the view).
  - **Buildings are no longer unloaded in the fog:** the distance filter re-processed the
    map tiles on every zoom step (the zoom lag); the fog simply covers distant buildings.
  - **Screen-space fog:** the fog is now a CSS ellipse around the player, sized each frame
    from three projected ground points (fog start and end ahead, fog end to the side) and
    masked below the player's row (the ground there is near the camera). It replaces the
    kilometre-wide fog polygons on the map, which were expensive to tile.
  - **No pull-to-reload on phones:** with drag-panning off, MapLibre's CSS sets
    `touch-action: pan-x pan-y` on the map, which hands one-finger vertical drags to the
    browser (scrolling and pull-to-reload). The map now sets `touch-action: none` (more
    specific than MapLibre's rule), and the page has `overscroll-behavior: none`.
  - **Test flake explained:** the camera e2e called `map.jumpTo()` inside `page.evaluate`,
    which returns the whole map object; serialising it back to the test could exhaust the
    page's memory ("execution context was destroyed"). The helpers now return nothing. The
    district e2e uses Beech Lash against the Stone trainers of district 2 too.
- **D134. Fog at 1 km, buildings unloaded past it, menu over the live map, touch drags**
  (owner feedback).
  - **Fog fixed in the world:** clear to 650 m, solid at 1,000 m, at every zoom (it no
    longer scales with zoom). 3D buildings beyond the fog are unloaded with a `distance`
    filter (1,000 m plus a 200 m step); the filter is re-centred only after walking 200 m
    and never on zoom, so zooming doesn't re-process tiles (the earlier lag).
  - **Menu over the map:** the menu screens used to replace the play view, so closing the
    menu rebuilt the map, restarted the GPS and reloaded tiles and buildings. They are now a
    full-screen layer over the map, which stays alive underneath.
  - **Finger drags:** on the live site a simulated one-finger drag reloaded the page (the
    browser took it as pull-to-reload, D133). With `touch-action: none` on the map, a
    finger drag and a mouse drag along the same stroke now turn the map identically
    (72.2 degrees each, no cancelled pointer events). E2E tests cover the finger drag (no
    reload) and the menu (same map object, no loading screen).
- **D135. Static fog wall (1–2 km setting), buildings 100 m behind it, exact drag rotation**
  (owner feedback).
  - **Why the fog seemed to come closer when zooming in:** the sky band was a fixed share
    of the screen's height, so at steep tilts it painted over ground that was well inside
    1 km, and the soft fade made the visible distance change with zoom.
  - **Fog wall:** one hard edge at the fog distance, at every zoom, with no fade. Each frame
    the ellipse through the projected ground points at that distance (ahead and to the
    side) is clear; everything beyond it, up to the top of the screen, is fog, with the day
    or night sky colour at the top. The separate sky band is gone.
  - **Distance is a setting:** "How far you can see", 1,000–2,000 m in 100 m steps, default
    2,000 m (save v6 `settings.fogDistance`; older saves get 2,000). Changing it moves the
    wall, the icon cut-off and the building range at once.
  - **Buildings:** 3D buildings load and unload at the fog distance + 100 m (2,100 m by
    default), so they come and go behind the wall. The filter is re-centred after 100 m
    walked (it was 200 m) and never on zoom.
  - **Off-screen buildings:** MapLibre only loads and draws the map tiles the camera can
    see (plus a small cache), so buildings out of view are not drawn. A per-building view
    filter would re-process tiles on every turn of the camera (the lag D133 removed), so it
    is not added.
  - **Exact drag rotation:** the map turns by exactly the angle the finger or mouse sweeps
    around the player, at any distance from it, so the screen always follows the finger
    (before, strokes near the player were damped and a swipe level with the player barely
    turned it). Only moves within 2 px of the player, which have no defined angle, are
    skipped. The fling after a swipe is unchanged.
- **D136. The ground reaches the fog wall, the sky is behind the map, look-ahead zoom**
  (owner feedback: zoomed in, the sky still took ground near the skyline).
  - **Real cause:** MapLibre stops drawing the ground where the view reaches 85% of the way
    (in screen pixels) from the centre to the horizon (`Transform.getHorizon()`). Fully
    zoomed in (76°) that edge was only about 850 m ahead, so the ground ended well before
    the 2 km fog and the empty band above it read as sky. Half zoomed in, the whole screen
    was ground, which is why you could see further there.
  - **Ground reach:** the play map replaces `getHorizon()` on its transform with
    `horizonForReach`, which makes MapLibre draw the ground exactly to the fog distance
    - 300 m ahead of the player (or to the top of the screen when that is nearer), at every
      tilt and padding, and no further, so nothing beyond the wall is loaded. This is MapLibre
      internals (4.7.1); an e2e test checks the far plane in the browser.
  - **Fog wall outline:** the far half of the fog circle is projected onto the screen (48
    points) and the fog fills the screen above it, up to the horizon, as an SVG path. The
    ellipse used before dipped below the real line towards the screen's sides.
  - **Sky behind the map (owner idea):** the sky is the map container's background (sky
    colour at the top, fog colour at the horizon), so it only shows where no ground is
    drawn and can never cover ground.
  - **Look-ahead (owner idea):** the camera still looks at the player, but MapLibre's
    padding moves the player down the screen as you zoom in: where it always stood when
    zoomed out (44% down on a phone), 60% down when fully zoomed in. Two thirds was the first
    idea, but an arena's card at the bottom then covers the player's feet. The padding is
    set on the transform in every `move` event (`setPadding` would stop a running pinch).
    Drag rotation still turns around the player.
- **D137. Logo, colours and switching between the map game and the battle playtest**
  (owner feedback).
  - **Logo:** the arena badge (the game's own rosette of 12 round petals) with an empty
    centre: cream petals, a Danish-red ring and a cream centre on a navy tile
    (`public/icon.svg`, own work), since collecting arena badges is the heart of the game.
    It is the app icon and sits with the game's name on the first onboarding screen and the
    playtest start. Tried first and dropped: a lantern-creature mascot (the lantern stays
    the loading-screen icon), the walker on a stamp (too detailed when small), and logos
    from non-starter creatures (Grimælling, Loftnisse, Lygtling, Brokrabbe). The owner
    chose the badge from four colourings for how it reads at small sizes.
  - **No green and yellow:** the phone's top and navigation bars used the old green theme
    colour; they now follow the paper colour of the current theme (cream by day, navy at
    night; `main.tsx` keeps `<meta name="theme-color">` in step), and the manifest uses the
    night navy. Outside the map, the `--gold` token is now copper and `--leaf` (things that
    are done) is spruce; the map screen keeps its own leaf and gold (owner: don't change
    the map). Health bars and the grass in the battle backdrop keep their colours.
  - **Switching modes:** before, a player who chose the map at the location step had no way
    to the battle playtest and back. Settings now has a "Battle playtest" section that
    opens it, and the playtest's start screen and menu have "Go to the map game". The map
    save is untouched by the playtest.
- **D138. The fog wall is a wall in the 3D scene; 1,200 m by default, 800–1,400 m**
  (owner playtest).
  - **Buildings in front of the fog:** the screen-space fog was painted over the map with
    no depth, so the tops of buildings inside the wall that rose above the wall's line on
    screen were covered. The fog is now a ring-shaped wall at the fog distance, drawn as a
    MapLibre custom layer with the depth buffer (`src/map/fogWall.ts`), the top layer:
    buildings inside stay in front of it, and ground, buildings and labels behind it are
    hidden. Its top is 40 m above the camera, so it ends just above the horizon, where the
    sky (still the map's background) takes over; this leaves a thin fog band above the
    rooftops. The vertices are relative to the player with the matrix moved in double
    precision, so the wall doesn't jitter.
  - **Distance:** 2 km showed too much; the default is 1,200 m and the setting runs from
    800 to 1,400 m. Save v7 brings settings above 1,200 m (the old 2,000 m default) down to
    1,200 m; the range was widened afterwards without a new version (no existing save is
    outside it). 3D buildings load and unload 100 m behind the wall, and the ground is
    drawn 300 m past it.
  - **Icons:** arena, trainer, rest-stop and creature icons show at every zoom while they
    are within the fog distance and not behind the camera; there is no zoom rule. With the
    shorter fog, places more than 1,200 m away are hidden until you walk closer.
- **D139. A pinch is no longer lost while the player glides** (owner report: pinch-zoom on
  the phone sometimes did nothing until a one-finger rotation).
  - **Cause:** the frame loop keeps the camera on the gliding player with `map.jumpTo()`
    whenever the map isn't moving. `jumpTo` calls `stop()`, which resets every MapLibre
    gesture handler, and a pinch only counts as moving once the fingers have spread past
    MapLibre's zoom threshold. So a pinch that started while the figure glided to a new
    GPS fix (often, since phone fixes drift) was wiped before it began, and stayed dead
    until the fingers were lifted. Rotating seemed to help because our rotation isn't a
    MapLibre gesture.
  - **Fix:** no re-centring with `jumpTo` while a finger (or the mouse) is down on the map
    (`fingersDown` in `orbit.ts`); once a gesture runs, `transformCameraUpdate` keeps the
    camera on the player. An E2E test pinches three times during glides (it failed before
    the fix: zoom stayed at 17.5).
- **D140. A back gesture asks before leaving** (owner request: an accidental edge swipe left
  the site or closed the installed app).
  - **How:** after the first tap or key press the app adds one history entry on top of its
    own (`src/ui/backGuard.ts`). A back gesture lands on the app's own entry instead of
    leaving; the guard adds the entry again and asks "Leave the game?" (Stay / Leave). It
    works the same in the browser and the installed app, on every screen (map, menus,
    playtest).
  - **Why only after a tap:** Chrome's back button skips history entries a page added
    without user input, so a guard added on load would not catch anything.
  - **In-app links** (#/playtest, #/) add their own entries above the guard, so going back
    through them never asks; only stepping back past the app's first entry does.
  - **Leave:** goes back past both entries to the page before. Where there is nothing
    before (an installed app, a new tab), it steps back to the app's own entry and tries
    `window.close()`; if the phone doesn't allow that, the next back gesture leaves without
    asking.
- **D141. Stars on the night sky** (owner request). At night the sky behind the map gets
  small stars (CSS dots in three repeating tiles of different sizes, so the pattern doesn't
  look regular). Since the sky is behind the map, they only show above the horizon and the
  fog wall. They turn with the camera at the speed the town turns at the horizon (22 px per
  degree; each tile width divides a full turn, so the sky wraps without a seam) and move
  with the horizon when the tilt changes.
- **D142. The fog wall is painted like the sky: the round world simply ends in sky**
  (owner request).
  - **Why keep a wall at all:** unloading doesn't need it (the building filter, the icon
    cut-off and the ground's drawing limit do that), but it is what makes the round
    cut-out: MapLibre stops drawing the ground along a straight line, not a circle, and its
    own layers can't be clipped to a circle cheaply. So the wall stays as the boundary,
    and only its look changes.
  - **Invisible:** the wall's shader colours every pixel with the same gradient as the sky
    behind the map (sky colour at the top of the screen, fog colour at the horizon and
    below, from the same horizon row), so it can't be told from the sky.
  - **Top at the horizon:** the wall now ends 1 m above the camera's height (was 40 m), so
    it never covers the stars above the skyline.
  - **Buildings at the edge:** 3D buildings load and unload at the fog distance itself (was
    100 m behind it), so nothing behind the wall can stick up above its lower top. With an
    invisible edge, a building appearing as it crosses the edge reads like it rises into
    view. The ground is drawn 50 m past the wall (was 300 m): nothing behind it is ever
    seen.
  - **Haze:** a 150 m band on the ground just inside the wall, in the sky's colours, ramps
    from clear to 90% at the wall's foot, so the last stretch of ground blends into the sky
    instead of ending in a hard line. It is fixed in the world (no change with zoom), and
    buildings in front of it stay crisp (depth test).
- **D143. Leaving the installed app: a close watcher instead of a history entry** (owner
  report: in the installed app, Leave only closed the dialog, and the next swipe closed the
  app without asking).
  - **Cause:** Chrome lets a page close itself (`window.close()`) only while its history
    has a single entry, and the history guard (D140) adds a second one. In the installed
    app the game is the first page, so there is nothing to go back to either.
  - **Installed app (where the browser has `CloseWatcher`, Chrome 120+ on Android):** a
    CloseWatcher catches the phone's back gesture without touching the history. The
    history keeps one entry, so Leave's `window.close()` closes the app. While the dialog
    asks there is no watcher, so a second swipe is the phone's own back and closes the app.
    Stay starts a new watcher (the swipe had no effect). In-app links (#/playtest, #/)
    replace the current entry instead of adding one, so the history stays at one entry.
  - **Browser (or no CloseWatcher):** the history guard of D140, except that the guard
    isn't pushed again while the dialog asks (a second swipe goes back), Stay pushes it
    again, and Leave goes back to the page before the game.
  - **Flows:** swipe → dialog → Leave: closes (browser: back); swipe → dialog → swipe:
    closes (browser: back); swipe → dialog → Stay: the dialog closes and the swipe had no
    effect. Where the phone refuses to close the page anyway, Leave just closes the dialog
    (no "swipe again" message, owner).
  - **Tests:** unit tests for both ways; E2E runs the installed-app way in Chromium (a test
    switch, `oml.e2e.installed`, forces it; Escape is a close request like the back
    gesture) and checks that the history never grows and that Leave calls `window.close()`.
- **D144. The app is called "Monster League" for now** (owner). The installed app was
  labelled "OML", and the name shouldn't tie the game to Odense: the aim is one app with
  travel between cities and regions (each with its own badge style). Until the owner picks
  a final name, the app name, home-screen name, page title, the name beside the logo and
  the "Leave …?" text say "Monster League"; the logo's name now comes from the
  translations (`ui.title`). The repository, package names and the GDD's working title are
  unchanged. Names considered: Wild Atlas, Wanderfolk, Waymark (open); Fableway and Rosette
  League were dropped as too tied to Odense, and anything echoing "GO" or "Wayfarer" as too
  close to another game.
- **D145. The repository is renamed MonsterLeague** (owner, with the app name of D144).
  `github.com/chrisesdk/OdenseMonsterLeague` → `github.com/chrisesdk/MonsterLeague`. GitHub
  redirects the old repository URL, but not the Pages path: the game now lives at
  <https://www.christianrasmussen.dk/MonsterLeague/> (the github.io address redirects
  there), and the old `/OdenseMonsterLeague/` link no longer works. The deploy takes its
  base path from the repository name, so only CI's check build, the base-path test and the
  docs changed. Saves are kept (same domain); an installed app points at the old path and
  must be installed again from the new link. The spawn service only checks the domain, so
  it needs no change. Earlier entries keep the old name as history.
- **D146. The phone's top bar is the menu's paper colour** (owner: the solid top and
  navigation bars border the game; make them see-through without hiding them).
  - **Android can't make them see-through:** Chrome ignores transparency in
    `theme-color`, and an installed app's bars can only be hidden (fullscreen), which the
    owner doesn't want. A first try gave the bar the sky's top colour on the map; it only
    matched when fully zoomed in (elsewhere the top of the screen is town, or the Town
    Map). Sampling the pixels under the bar was rejected as laggy. The map's building colour
    was tried next, but then the bar didn't match the menu. Now the bar is the menu's paper
    colour (`--paper`) on every screen, so the menu seems to fill the whole screen: cream
    by day (`#f5ecd7`), navy at night (`#1b2130`), set by `main.tsx` from the theme.
  - **The navigation bar** at the bottom can't be coloured from the page. The page already
    asks to be drawn edge to edge (`viewport-fit=cover`, safe-area padding), which newer
    Android versions use to draw the game behind a gesture navigation bar.
  - **iPhone:** the installed app's status bar is see-through
    (`apple-mobile-web-app-status-bar-style: black-translucent`), with the game drawn below
    it; the HUD keeps clear of it with `safe-area-inset-top`. iPhone web apps have no
    navigation bar, only the home indicator, which the game is already drawn under.
- **D147. Map credits start closed** (owner request). The "© OpenStreetMap contributors ·
  Protomaps" credits are MapLibre's compact attribution control, which starts open and only
  folds away on the first map drag; the play view never drags (it rotates), so it stayed
  open. Both maps now start with only the small "i" button (`addAttribution` in
  `markers.ts`); tapping it opens and closes the credits, and they prefer to be closed: the
  next touch anywhere else (the map, a button, a rotation or zoom) folds them away again. In the play view the bottom HUD
  row covered the button and took its taps; the credits control now sits above the game's
  buttons (z-index 6, clear of the phone's navigation bar), so open, the credits lie on top
  of the satchel button. The credits stay one tap away, as the map data licences require.
- **D148. Revive Blossom, and test items in Settings** (owner request).
  - **Item:** `revive_blossom`, kind revive at 100% (the existing item kind; Revive Leaf
    is the same at 50%). It is used like a tonic: in the bag, choose the creature; only a
    fainted one can take it, and it comes back with full HP. It works in battle like Revive
    Leaf (on a fainted bench creature). Named Revive Blossom (Danish "Livsblomst") because
    "Full Revive", the owner's working name, is a Pokémon item (hard rule 1); "Full
    Revive" and "Max Revive" are added to the franchise-term deny-list. GDD proposal P21.
  - **No way to find it in the game yet.** For testing, Settings has a "Test items"
    section, below the safety reminder and above the walk test, with "Get a Revive Blossom"
    (one per tap, `addToBag` in `packages/game`), plus "Get a Basic Charm" and "Get a
    Small Tonic" so early testing doesn't stall on running out. It is for everyone for now
    and should go once the game hands the items out.
- **D149. The loading screen covers every build of the map** (owner report: opening the map
  game from the battle test showed no loading screen while the position was found and the
  town built). It used to show on the first map of a browser session only (a module-level
  "loaded once" flag), so a map built again later (coming from the battle test, after a
  badge ceremony, after a battle) appeared half-built. Now every time the play map is
  created, the loading screen shows until the position is found and the town is built
  (or the 20-second limit, or a GPS error). Closing the menu doesn't rebuild the map, so
  no loading screen there. After a battle the position is already known and the tiles are
  cached, so it shows briefly while the town is redrawn.
- **D150. Range ring, in-range icons, Nearby and the back gesture in menus** (owner
  feedback).
  - **The ring around the player is the 40 m battle range**, not the GPS accuracy (which
    players don't need): a dashed ring with a light fill, always 40 m (`BATTLE_RADIUS_M`).
  - **In range is shown by the icon, not a message:** the "A wild … is close!" toast and the
    Nearby "Tap to battle" text are gone; the phone vibrates once when a battle-able
    creature comes within 40 m (as before, not with "reduce motion"). Icons beyond 40 m
    are a little see-through (60%), icons within it solid with a soft light glow (before:
    see-through only beyond 100 m, and in-range icons bobbed). The Nearby chips dim their
    pictures the same way.
  - **Nearby:** each chip shows the creature's name instead of its distance; choosing one
    turns the camera so it lies straight ahead of the player (`easeTo` the bearing).
  - **Selection bounce:** every icon's base style played the pop-in animation, so when a
    creature was deselected the browser replayed it from 30% size (it seemed to shrink to
    nothing). The pop-in now plays once, when an icon appears (`entering` class, removed
    when it ends); deselecting just stops the bounce.
  - **No heading cone** on the player (it was often off); the compass hook is removed.
  - **Back gesture in menus** (`src/ui/backStack.ts`): an open menu screen goes back one
    level (creature → team → the menu → the game view, as the screens' back buttons do,
    `previousScreen`), and the Town Map closes; the back guard (D143) asks these first and
    keeps guarding without a question. Only on the game view does it ask "Leave the
    game?", also when the Journal card or the Nearby strip is open there (they don't
    handle back). Works in the browser (history guard) and the installed app (close
    watcher).
- **D151. Settings: a Vibration toggle, dropdowns, the battle playtest above the walk test**
  (owner request).
  - **Vibration** is its own switch, right under Sound (save v8 `settings.vibration`,
    default on). Before, "Reduce motion" also switched vibration off, which its name didn't
    say; it now only reduces animations. The v7 → v8 migration keeps what the player had:
    vibration starts off if reduce motion was on. `buzz` follows `data-vibration` on
    `<html>`.
  - **Dropdowns** for the settings with several options (battle speed, text size,
    language) instead of rows of buttons.
  - **Order** in Settings: … safety reminder, test items, battle playtest, walk test, save.
- **D152. One sky wall instead of a fog wall, a sky behind the map and star tiles** (owner
  design). The stars were painted behind the map as if infinitely far away, so they slid
  against the skyline as the camera orbited the player (it looked laggy). Now a single wall
  in the 3D scene (`src/map/skyWall.ts`) is both the edge of the world and the sky:
  - a ring at the fog distance (the setting), the loading boundary as before: buildings
    inside stand in front of it, nothing behind it is seen, buildings load and unload at
    it, and the ground is drawn just past it;
  - tall enough to fill the screen above the horizon at every tilt (its height is worked
    out from the camera on every frame, with a 3° margin), so nothing behind the map is
    ever seen; the map's background is just the sky colour as a fallback;
  - coloured by the angle above the horizon seen from the camera: the fog colour at the
    foot, the sky colour from 14° up (a world-fixed gradient, not screen rows);
  - at night it carries the stars: soft dots generated in the shader in some cells of a
    26 m grid on the wall (a whole number of cells round the ring, so no seam), drawn on
    top of the haze. They begin 4 m above the wall's foot (the visible skyline) and reach
    full brightness at 45 m, so low stars look faint; at first the cut-off was the angle
    above the horizon, which left an empty band between the skyline and the camera's
    height on the wall (owner report). They sit where the edge of the world is, so they
    move exactly with the skyline when the camera turns;
  - the 150 m haze band on the ground inside it stays, in the fog colour.
    Removed: the screen-space fog wall colouring, the CSS sky gradient and the CSS star tiles
    (D138, D141, D142), and the per-frame horizon calculation for the background.
- **D153. Credits in Settings** (owner request). The very last line of the Settings screen
  reads "Developed by Christian Bröchner Rasmussen with Claude" (Danish: "Udviklet af
  Christian Bröchner Rasmussen med Claude"), centred and small (`settings.credits`).
- **D154. A steady player figure, and a scan inside the battle range** (owner feedback: the
  figure shook up and down, much more while rotating).
  - **Causes:** (1) while a finger is on the map the camera can't re-centre with `jumpTo`
    (D139), so it only caught up with the gliding figure on the next finger move; the
    figure and the camera took turns being a step ahead (at full zoom 1 m is about 8 px);
    (2) MapLibre rounds a marker to whole pixels when the page moves it but not when the
    camera moves it, and the two alternated (a half-pixel tremble); (3) GPS drifts 1–3 m
    while standing still, and the figure followed every drift.
  - **Fixes:** the figure holds still while a finger is down and glides on when it is
    lifted; the figure marker uses `subpixelPositioning`; a 3 m dead zone (`steadyTarget`,
    `DEAD_ZONE_M`): the figure only moves to a fix at least 3 m from where it is going.
    The game itself (battle range, spawns, checkpoints) still uses the real position.
  - **Scan:** a thin circle on the ground grows from the player to the 40 m ring every
    2.4 s (easing out) and fades towards the edge (`scanRing.ts`). It is drawn from
    projected ground points into an SVG right after the map canvas (above the map, below
    every marker), so the map doesn't redraw every frame; off while loading, in battle and
    with "Reduce motion".
- **D155. Odense Kommune is the region; zones open with routes** (owner request after the
  region sketch, GDD P22). The owner chose the sketch's version B (the real municipality
  border) and asked for trainers, arenas and rest stops along the routes and near the
  places they lead to.
  - **Region v4.** `REGION.bbox` covers the municipality (10.17–10.59 E, 55.28–55.49 N);
    cells outside `content/odense/boundary.geojson` (the OSM border, simplified to 20 m)
    are dropped. Each cell row is `[district, zone, flags, …shares, mask?]`; the file lists
    the zone ids. Region file 24,189 cells (was 7,582), 1.09 MB raw, 156 KB gzip; spawn density still on
    target (wild 1 per 131 m, streets 1 per 318 m, park walk 13.0).
  - **Zones** (`content/odense/zones.json`): 39 zones with a kind (arena, town, wild,
    water), a district and a centre. A cell belongs to the nearest zone centre (in metres);
    a POI's own cell is forced into the POI's zone. The builder writes zone and district
    outlines (`zones.odense.geojson`, `districts.odense.geojson`, generated, hexagon steps
    smoothed to about 25 m). District level bands now live in the zones file.
  - **Overpass in tiles.** The area is fetched as a 4 × 3 grid of tiles, each cached on its
    own; a tile the servers keep refusing is split into four (twice at most), and the fetch
    rotates over three public servers (the main one was overloaded for hours).
  - **Basemap.** `odense.pmtiles` is re-extracted for the municipality plus 1.6 km (the fog
    wall's reach) by `pnpm --filter @oml/region-builder basemap`, a small PMTiles v3 writer on
    top of the `pmtiles` reader (no CLI to install): 1,423 tiles, 15 MB (was 8.4 MB).
- **D156. Routes between zones and their progress bar** (P22).
  - 50 routes (`route-lib.ts ROUTES`), built over the OSM foot network through waypoints:
    15 on the badge path (`main`), 10 other ways (`alt`), 25 to destinations (`explore`).
    Wild cells and the river path only get a mild bonus now (0.85 / 0.8; noSpawn ×1.6):
    the M2d factors made the sketch's routes 1.5–3 × the straight distance. Paths just outside
    the region's cells (the causeway to Stige Ø) may be used at a cost (×1.5 partly, ×3 wholly
    outside); routes snap only to the largest connected part of the network. Lengths: badge
    path routes 1.2–4.7 km, all routes median 3.2 km, longest 6.9 km (Route 37); 174 km in
    all (main 43, alt 29, explore 102), 42 % through wild areas. Walking to all 8 badges is
    about 38 km; opening every zone needs at least 117 km (a season's goal, mostly the
    outer ring). Stige Ø's real shortest link to Seden Strand is 7.8 km round the water, so
    Route 24 runs Hindemosen–Seden instead, and Route 44 Højby–Hjallese (Højby–Stenløse was
    8 km); Stige Ø has one route in.
  - Validation of routes changed with the routes: a route may run up to 600 m outside the
    region's cells, and the railway/motorway rule now measures the longest continuous
    stretch within 12 m (at most 100 m), since crossing the E20 or a railway on a bridge with
    its ramps counts 30–100 m without running along it.
  - A route has a checkpoint every 25 m (was 100 m), reached within 30 m, and is finished at
    90 % (was 80 %), so short GPS gaps don't block it. Progress counts on every route, open
    or not; a finished route opens both its zones as soon as one end is open (`openZones`,
    repeated until nothing changes), so a route walked "from the wrong side" pays off later.
  - Play view and Town Map draw each route dotted and its walked part solid (`walkedGeo`:
    a piece between two reached neighbouring checkpoints). A toast and a short vibration
    say when a zone opens.
- **D157. What zones lock** (P22). `isZoneOpen`, `spawnStatus` (rares and ability layers in a
  closed zone are "too wild"; the client looks the zone up from its own region file, so the
  spawn service is unchanged), `trainerStatus` (`zoneLocked`; an arena leader also needs
  badge n − 1), `arenaReady`. The Journal's main chain per arena is: open its zone (the
  next route toward it: shortest by metres still to walk, starting from an open zone) →
  the district's trainers → a rest stop → the arena. The old "reach the district" step is
  gone. Districts show in the Journal once any of their zones is open, or when they are the
  next arena's.
- **D158. New arena sites and theme order** (P22). Arena 2 moves from Klosterhaven to
  Næsbyhoved Slotsbanke (OSM way 229383133); arenas 3–8: Stige Ø (Water), H.C. Andersen
  Skoven (Grove), Hollufgård (Spirit), Den Fynske Landsby (Fire), Odense Zoo (Mixed),
  Tusindårsskoven's hill (Storm). Spawn tables, side goals (ids renamed) and save data move
  with their theme: old district 3 → 5, 4 → 3, 5 → 7, 6 → 4, 7 → 6.
  - **Arena 3 leader:** the Water leader moves from arena 4. Three creatures at 19–21 could
    not meet the targets (one level flipped a starter from 84 % to 4 %: a speed tie between
    the two Strømodder), so it keeps four (Grimælling 19, Kulingmåge 20, Strømodder 22 and 21) and Grimælling swaps Beech Lash (not in its learnset) for Rinse and Mend. Expected
    team `arena3`: starter 22 plus Kulingmåge 21, Brokrabbe 21, Mosbille 22, Torvdue 21.
    Sim (2,000 battles): Fire 26 %, Water 44 %, Grove 88 % (targets 15–30, 40–60, 75–90).
- **D159. POIs on the new map** (P22). Arena 1 and its rest stops stay. Arena 2 stands on
  the castle mound. The district-1 route trainers stand on routes leaving Centrum (Ole on
  Route 16, Freja on Route 20, Niels on Route 22; Lise stays by Kongens Have), the district-2
  ones in Næsbyhoved (Karen on Route 1, Mads on Route 2). 21 new rest stops at every arena
  site, town and main destination. Each spot is checked like `pnpm validate` (inside its zone
  with its whole radius, no no-spawn cell, ≥ 15 m from road/rail). All unverified.
- **D160. Save v9** (P22). Adds `zones` (opened zones; the start zone is implied). Migration:
  district numbers in the field guide, an active battle, `journal.reached` and
  `journal.wildMetres` follow D158; route progress starts again (new routes); the zone of
  every arena already won opens. Route progress is checkpoint numbers only (owner decision,
  GDD P23): no coordinates, no times, never sent.
- **D161. Fyn map** (owner request). The Town Map's header has a "Fyn" button that opens a
  map of Fyn's ten municipalities (`content/shared/fyn.geojson`, OSM borders simplified to 250 m)
  in the Town Map's paper colours: sea background, land, dashed borders, names. Only
  Odense can be tapped (it returns to the Town Map; the others show "Coming later"). Each
  playable region shows its 8 badges, grey until won. The view is held on Fyn
  (`maxBounds`), zoom runs from all of Fyn to about one region (+1.6), no rotation or tilt.
  Back (gesture or Escape) closes the Fyn map first, then the Town Map, through the back
  stack (D150). The Town Map itself is held on the municipality and zooms out to 10.3; below
  zoom 11.8 it hides route numbers and rest stops.
- **D162. Clean borders** (owner feedback: area borders looked like the region border, lines
  overlapped, the harbour seemed to lie outside Odense, small rings inside the region).
  - **Region border:** the OSM municipality border follows the coast and cuts the harbour,
    the canal and small inlets out of Odense. The game border is that border closed by
    400 m (buffer out, then in; `borders.ts closeBorder`), outer rings only. Region cells
    are clipped to it, so the harbour and canal water are now part of the region (24,516
    cells, was 24,189).
  - **Edges, each once:** every cell inside the border gets a zone (also cells without map
    data, which left holes before: the "small rings"). The builder finds each edge between
    two cells of different zones once, joins the edges into lines between the points where
    three zones meet, straightens the hexagon steps (35 m) and rounds them (Chaikin, 3
    rounds), keeping the line ends so lines still meet. An edge between zones of different
    districts is a district edge. Edges on the region's outside are never included.
    Output: `content/odense/borders.geojson` (generated): 1 region line, 49 district edges,
    49 zone edges, 86 KB.
  - **Drawing:** region border solid in a yellow (`regionBorder`, day #d39a1a, night
    #e8b04a); district edges dotted; zone edges finer, fainter dots (Town Map from zoom 11.5).
    The old district outline layer (which drew shared edges twice) and the zone outline
    layer are gone; zone polygons remain only for dimming closed zones, without holes.
    District and zone names sit at one point each (arena site, zone centre), below the
    arena badge.
  - **Routes are dashed now** (red; routes to a destination in a new orange-red,
    `routeExplore`, which replaces the brownish draft colour), so dotted always means a
    border. Closed zones are dimmed more lightly (Town Map 0.1, play view 0.08), and a pale
    wash covers everything outside the region, so the region stands out when zoomed out.
- **D163. Route trainers on every route** (owner request). Target density: one trainer per
  about 1.5 km of route, at least 1 and at most 3 per route (a trainer battle takes a few
  minutes; wild creatures already appear every 100–150 m in grass): 110 route trainers on
  174 km of routes, one per 1.6 km. 105 are new (generated once by a script, then plain
  data): spaced evenly along the route, at least 150 m from other POIs and placed like
  `pnpm validate` checks; their district is the zone they stand in. Teams: 2 creatures in
  districts 1–2, 3 in 3–6, 4 in 7–8, from the district's spawn species (a district rare 1 in
  4 times), levels inside the district band below the leader (district 1: 4–9). Rewards by
  district (Small Tonics → Revive Leaves). Each has an occupation that fits its zone
  (kayakers, lifeguards, forest wardens, scouts, beekeepers, a smith's apprentice at the
  village, a sculptor at Hollufgård …), a Danish first name and da/en lines. Trainer POIs
  now name their `route`. The Journal's "beat the trainers" step counts the trainers on
  badge-path routes (and trainers on no route, like Lise by Kongens Have); the others are
  optional, like their routes (`isMainTrainer`). Niels was re-snapped onto Route 22 after
  the route rebuild.
- **D164. Claude manages the GDD** (owner decision, 2026-11-25). docs/GDD.md is now edited
  in the repo (v1.11 folds in GDD-UPDATE-NOTES and P22/P23, then the notes file was
  removed); docs/GDD-PROPOSALS.md is the design backlog (P21, P24 leaderboards, P25 tourism
  content). CLAUDE.md's "never edit the GDD" rule is replaced; the GDD stays out of Prettier.
- **D165. Skilling, markets and a fuller Town Map** (owner request; GDD v1.12).
  - **Skilling** (the coin; an old Danish coin, original name): beating a trainer pays once,
    highest team level × 25 (leaders × 60) (`payoutFor`). Save v10 adds `coins`; the
    migration pays out trainers already beaten. The result card says how much was won.
  - **Markets:** POI kind `market` (40 m), 9 at real shopping places, placed like the other
    POIs (valid spot, circles not overlapping others), usable in every zone (like rest
    stops). Items have a `price` (and `marketBadge`: Good Charm 2, Great Charm 5);
    selling pays half (`marketStock`, `buyItem`, `sellItem`, `sellPrice`). New item:
    Medium Tonic (40 HP). The market screen opens from the market's card on the map (Buy and
    Sell tabs, balance); back returns to the game view. The Bag shows the balance.
  - **Stamps:** new A1 stamps for market (a stall with a coin) and the destination kinds
    forest, field, lake, town. Every wild/water/town zone has an `icon` (set by hand from
    what the place is: Kirkendrup Skov a forest though its zone is mostly farmland).
  - **Town Map:** arenas stay badges; trainers (ticked when beaten; from zoom 13, there are
    over a hundred), rest stops and markets (from zoom 11.8) and destinations (from zoom 11)
    are stamps. Cards for trainers, markets and destinations (what it is, the routes in, the
    next route to walk). A funnel button next to "Fyn" opens six switches (arenas, routes,
    trainers, rest stops, markets, destinations); hiding routes also hides their lines. The
    choice is kept in localStorage (a view setting, not game progress).
- **D166. Points of interest are pressed, not pushed** (owner playtest: standing by a rest
  stop and a trainer, pressing the stamps did nothing; the card that popped up inside the
  radius was easy to miss and felt forced). Stamps on the play map are buttons. A press
  within reach (radius + 15 m, `POI_SLACK_M`, since a phone fix is often 10–20 m off) acts
  at once: a rest stop heals (its card then shows the result), a ready trainer or arena
  starts its next battle (junior first), a market opens. When nothing can happen (beaten,
  closed zone, fainted team, no team) a card says why, with a close button; walking out of
  reach closes it. Out of reach, a toast says how many metres to walk. No card appears by
  itself any more. E2E taps stamps (`tapPoi`); the "first tap" in the range-ring test is
  a key press, because a tap on the map at Kongens Have now lands on a stamp.
- **D167. Roster v2: 20 wild lines with rarities; destinations for catching** (owner
  request: every creature with a second or a second and third stage, a rarity, some only in
  destinations, and forests, fields and lakes worth travelling to; GDD v1.13).
  - **Roster:** the 11 wild species became lines (Torvdue → Kirkedue → Vinddue, Rendsnude →
    Rottekonge, Mosbille → Skovbille → Eghjort, Grimælling → Svaneunge → Kongesvane,
    Brokrabbe → Kæmpekrabbe, Kulingmåge → Stormmåge, Lygtling → Lygtemand, Loftnisse →
    Gårdnisse, Søormling → Lindorm, Kampetrold → Bjergtrold, Ellepige → Ellekonge) and 9
    new lines were added (Gløding, Rokkeling, Mosling, Lynspurv, Dugpust, Flintling,
    Ræveling, Nøkkeling, Ildflue). Starters get a third stage at 36 (Brandløve, Havodder,
    Lundekonge). 55 species, all `placeholder: true`. Existing species keep their stats
    and learnsets; new ones get stats from a role (fast, tank, bruiser, balanced) and a
    base-stat total, and learnsets from a per-type ladder plus their second type's moves
    (4–8 moves, a level-1 move, levels ≤ 50, as `check.ts` requires). 14 new moves
    (one mid and one top attack per type; no effects). Generated once by a script; the
    files are now edited by hand.
  - **Havodder is Water/Folk, not Water/Stone:** as Water/Stone it resisted the Storm
    leader and hit it super effectively, so the "disadvantaged" water starter won 89 % at
    arena 8.
  - **`rarity`** on every species (common, uncommon, rare, very rare); starters count as
    common (they never spawn). A spawn entry's own `rarity` stays the level rule (common
    = player's band, rare = district's band): uncommons are "common" entries, rares and
    very rares "rare" entries. Table weights follow the species rarity: 25 / 9 / 2.5 /
    0.8; each district doubles one featured uncommon; field-ability entries weigh 4.
  - **Destinations:** region flag 16, set by the region builder for cells in a `wild` or
    `water` zone whose nature share (water + forest + park + meadow + farmland) is at
    least 50 % (farmland counts here, unlike the wild flag, so fields are destinations).
    11,000+ cells. Spawn entries may be `destinationOnly` (weight 0 elsewhere); rare
    entries weigh ×3 in destinations (`DESTINATION_RARE_BOOST`). Density factors:
    destination 2.3, other wild 1.4, route corridor 1.0 (was 1.6 with wild), street 0.8
    (was 0.9). SPAWN_ALGORITHM 5; the golden region has a destination cell.
  - **spawn:report** now splits destination / wild / route / streets with the new targets
    and gates the rare-share ratio (≥ 2×; measured 4.9×) and a 30-minute destination walk
    (15–22; measured 17.8). Region file version stays 4: the new flag bit is ignored by
    older code.
- **D168. Arenas 3–8, route trainer teams, arena e2e** (owner request: all arena and trainer
  teams, a full experience for testers).
  - Leaders `leader_grove` (4), `leader_spirit` (5), `leader_fire` (6), `leader_mixed`
    (7, no theme: neutral for every starter) and `leader_storm` (8) join `leader_water`
    (3); each arena has one junior (`arenaN_junior`) and a POI at its arena site (radius
    80). Presets `arena4`–`arena8` (one creature more than the leader, evolved like a
    player's). Levels were tuned with a level-offset search against the sim (seed 4242,
    N 600, the CI guard) and checked with a second seed (N 1,500); team changes made where
    a single creature decided a match-up (arena 7: Rottekonge, pure Folk, could not touch
    the Spirit-typed grove starter, and Lindorm took 4× from Grove; arena 8's preset lost
    its Stone creatures). Arenas 4, 5, 6 and 8 end 1–4 points outside a band in the full
    report; left for tester feedback.
  - Leader rewards: Revive Leaf ×1 (3–4), ×2 (5–6), Revive Blossom ×1 (7–8). Juniors: Good
    Charms (3–5), Great Charms (6–8).
  - The sim's `playerTeamSide` follows the whole evolution chain (third stages at 36).
  - **Route trainers** keep their ids, places, levels, sizes and rewards; teams were re-drawn
    from the 17 non-starter, non-very-rare first stages with a type theme per trainer
    (hashed from the id), rares only from the third slot, each creature at the stage that
    fits its level. A content test keeps every trainer's first stages below their
    evolution level + 3.
  - `e2e/arenas.e2e.ts` plays arenas 3–8 in order (junior, leader, badge ceremony), a
    route trainer in district 8 (coins paid) and a market purchase, with a level-100 team
    of final stages (dev-made creatures don't evolve; they win even when ignoring orders).
  - The Stone leader's defeat line still named the old "Cathedral badge": now "Castle Mound
    badge" / "Voldsted-mærket".
- **D169. Content docs are generated** (owner request: documents to keep track of all teams
  and creatures). `tools/docs` (`pnpm docs:content`) writes docs/CREATURES.md (lines,
  rarity, spawn chance in destinations and elsewhere, where, every creature's stats and
  moves, spawn tables per district), small SVG spawn maps (docs/creatures/: circles on zone
  centres sized by the line's share) and docs/TEAMS.md (arenas with juniors, leaders,
  rewards and presets; route trainers by route; other and unplaced trainers). Spawn
  chances are exact expectations from the spawn rules (min(density, 3) per cell, split by
  entry weight, day and night half each), not samples. A test fails when the docs are
  stale. The generated files are left out of Prettier.
- **D170. More no-spawn areas** (owner request; GDD v1.14). Golf courses
  (`leisure=golf_course`), allotment gardens (`landuse=allotments`, no longer park), care
  homes (`amenity=nursing_home`, `social_facility=nursing_home|assisted_living`), prisons,
  places of worship and campsites (`tourism=camp_site|caravan_site`) are no-spawn areas, by
  the same two rules as schools (a cell ≥ 25 % covered gets no spawns; elsewhere no spawn is
  placed inside one; points get 30 m). Playgrounds, open water, Odense Zoo and Den Fynske
  Landsby stay open (owner decision). The new tags come from a second Overpass query
  (`buildExtraQuery`), tiled and cached on its own, so the main tiles were not downloaded
  again. No-spawn cells: 4.6 %. Eight POIs that now stood in blocked spots moved to the
  nearest valid spot (route trainers along their own route): Freja 5 m, Botanisk rest stop
  25 m, r8a 3 m, r11a 26 m, r23a 91 m, r23c 39 m, r35a 155 m, Hjallese market about 45 m.
  Ten routes' `wildShare` was recomputed from the new region (allotments no longer count as
  green); route paths are unchanged, so saved route progress stays valid.
- **D171. Destination creatures live only at their homes** (owner request: a lucky city
  catch must not remove the reason to travel; 1–3 homes, preferably one, with one clear main
  home). Spawn entries get `zones` (1–3 destination zones in the entry's district, with
  `destinationOnly`); `entryWeight` is 0 outside them (SPAWN_ALGORITHM 6). Homes, main
  first, spread over the municipality: Mosling Kirkendrup Skov, Ræveskov, Stenløse Skov;
  Dugpust Brændekilde, Hindemosen; Ildflue Lungs Grave, Ørbækparken; Rokkeling Sanderum Sø,
  Lumby Mølle; Søormling Seden Strand, Lumby Mølle; Ellepige Hesbjerg, Fællesskov;
  Nøkkeling Tarup-Davinde only. Field-ability layers of these creatures sit at the main
  home too (Søormling's Angler layer at Seden Strand); Ellepige's Forager layer in district
  4 was dropped (Forager keeps Mosbille in district 1). `validate` requires every entry of a
  destination creature to have zones, at most 3 homes and a single highest weight; a docs
  test checks the main home by weight is also where it really spawns most (Dugpust's main
  home became Brændekilde: the bigger meadow won even with a lower weight). Weights were set
  for the share of a home's nature spawns (common ≈ 30 %, uncommon 9–16 %, rare 6–11 %, very
  rare 3–4 %, shown in CREATURES.md as "chance at its main home"; Rokkeling's 500 is high
  because Sanderum is mostly woodland around a small lake). Journal rare goals: district 4
  is now Kampetrold, district 8 Ellepige.
- **D172. Map frame** (owner request: the Town Map ended in ragged tile edges, with a top
  middle tile but not its neighbours). `MAP_FRAMES.odense` (in `@oml/data`) is the region's
  bounding box plus an even 2 km margin (a test checks it against the boundary). The
  basemap extract takes every tile in the frame up to zoom 13 (the Town Map's levels; 512 px
  tiles) and only tiles within 1.6 km of the border above that, so the file grows little.
  The Town Map paints an opaque `frame-mask` (the earth colour) over everything outside the
  frame, so the map ends in a straight, even edge, and pans only a little beyond it.
- **D173. The field guide names destination creatures' homes** (owner request: players must
  know where to travel). `guideHints` returns each entry's `zones` and whether it is the
  creature's main home (highest weight); the guide then says "Lives only at Kirkendrup
  Skov: its home, the best place to find it" and "Also lives at …, but rarer there"
  instead of the biome hint. Shown also before the creature is seen, as a goal.
- **D174. Save import; version in Settings** (owner request: testers must not lose
  progress). Settings → Import save reads a file exported earlier, checks and migrates it
  like a stored save (`readGameFile` → `loadSave`) and replaces the save only after a
  second tap that names the badges and creatures in it; a bad file shows why. The save help
  text suggests exporting now and then. Settings shows "Version <git hash>".
- **D175. Feedback from the menu** (owner request: not a pop-up). A Feedback tile in the
  menu opens a screen with a kind (bug, idea, too hard/easy, other) and a text box. "Send"
  opens the phone's share sheet (or copies the text) with the message plus the version,
  language, date, badges, team levels and a few counts: never a position or the current
  zone. Nothing pops up after battles or other events.
- **D176. Tester welcome at first launch; no battle-test link in onboarding** (owner
  request). The game route (`#/`) shows a one-time welcome before onboarding: what the game
  is, what to try, how to keep the save (add to home screen, with iPhone or Android steps,
  hidden when already installed; export), how to send feedback and what is known to be
  unfinished. It is a phone flag (`oml.welcome.v1` in localStorage), so existing testers
  see it once too; Settings → Tester guide shows it again. Not on the dev map. The
  location step no longer links to the battle playtest (Settings still does), so a first
  launch always goes into the map game.
- **D177. One folder per region; regions never overlap** (owner request, P27). Content,
  texts, region files, docs and builder settings are split into `shared/` and one folder per
  region (`content/<region>/`, `i18n/<region>/`, `region/<region>/`, `docs/regions/<region>/`,
  `tools/region-builder/src/regions/<region>.ts`); files moved with `git mv`. `@oml/data`
  parses each region into its own Dex (`regions.odense`, `regions.svendborg`, each with
  `region`); `content` and `i18n` stay the Odense defaults until campaigns per region exist,
  and `i18nFor(region)` merges the shared UI texts with a region's own. Region texts are the
  keys `<kind>.<id>.<field>` for species, trainers, POIs, zones and routes, and the numbered
  district, badge and arena-site keys; two-part keys such as `trainer.battle` are shared UI
  (the first split put them in Odense's file; the new check caught it). Every Svendborg id
  starts with `svb_` (`REGION_ID_PREFIX`); Odense keeps unprefixed ids. `checkSeparation`
  (run by `pnpm validate` before each region's own checks) fails when an id lacks its
  prefix, uses another region's prefix or exists in two regions, when a region text names
  an id that isn't the region's, or when a shared text belongs to a region. The region
  builder picks the region with `--region <id>` (default Odense; `regionPaths` gives every
  input and output path), and a new `boundary` tool fetches the municipality outline from OSM
  (admin_level 7), simplifies it to about 20 m and drops slivers and pieces outside the
  region's box (Svendborg: Vresen, an uninhabited reserve island in the Great Belt). Route
  ids carry the prefix (`svb_route1`). The docs generator writes `docs/regions/<region>/`.
  `pnpm regions:status` reads the update queue in REGIONS.md and says when to ask the owner
  (3 or more pending updates for a region); a test keeps the queue well formed.
- **D178. Every badge its own design** (owner request). `packages/art/src/badges.ts` draws
  each region's eight badges with their own outline (no outline repeats within a region),
  colour and emblem from the arena's place; the empty slot is the same outline in grey.
  Files are `generated/badges/<region>_badge<n>.svg`; `badgeUrl(arena, earned, region)`
  defaults to Odense.
- **D179. Svendborg's map: zones, routes and ferry crossings** (owner decisions, P27, GDD
  v1.17). 44 zones (8 arena, 9 town, 21 wild, 6 water) placed from OSM (places, manors,
  mills, named forests, lakes, beaches); the three ferry islands are `wild` zones with
  `opensOnArrival` and the new Town Map icon `island`. Routes: 14 on the badge path, 11
  other ways, 20 to destinations, built from the OSM foot network like Odense's. Ferry
  crossings are routes of the new kind `ferry` (numbers 46–48): their path is the real
  sailing lane from OSM (Svendborg–Skarø–Drejø, split at Skarø's quay; Svendborg–Hjortø),
  simplified to 25 m, never walked, so validation only checks that they start and end in
  their zones and lead to an island. The quay is in the start town (Frederiksø), where
  several routes meet. Map frame: the boundary's box plus 2 km.
- **D180. Campaigns per region** (P27, GDD v1.18). Save v11: the save's progress fields
  (`CAMPAIGN_KEYS`: onboarding, starter, team, storage, bag, badges, zones, coins, trainers,
  field guide, restocks, used spawns, battle, pending choices, Journal, fainted clock) are
  the campaign of `save.region`; the other regions' campaigns are parked in
  `save.campaigns` (never the active one; validated). The seed, the uid counter and the
  settings are shared. The v10 → v11 migration makes everything so far the Odense campaign.
  `switchCampaign(save, region)` parks the current campaign and brings back the region's,
  or starts a new one at the starter choice (the safety note and the location permission
  belong to the app, so they are not asked again); it waits while a battle or a learn/evolve
  choice is open (`canSwitchCampaign`), and the map simply asks again on the next fix. Every
  game rule that takes a save now defaults to the save's own region's content
  (`regions[save.region]`), so no call can mix regions by accident. Each region names its
  starters and tutorial creature in its zones.json (`starters`, `tutorial`); validation
  requires them for a playable region and keeps starters out of the wild.
  **Which region:** the client tests the position against each playable region's boundary
  (`regionAt`, apps/client/src/map/regionGeo.ts); a position up to 500 m off the land
  still counts (the boundary follows the coast, so quays, piers and the harbour basin are
  in), the nearest region wins, and out at sea or between regions nothing changes. Only the
  playable regions take part (`PLAYABLE_MUNICIPALITIES`: Odense until Svendborg's creatures
  exist). The map is built per region (`key={save.region}`: tiles `<region>.pmtiles`, the
  map frame as max bounds, its own outlines, routes, POIs and region file); texts come from
  `makeT(locale, region)` (shared UI plus the region's names); spawn requests name the
  region, and a cached spawn list of another region is never used. The Worker serves every
  region from its own region file and spawn tables (decoded on first use; bundle 599 KiB
  gzipped). **Ferry islands:** ferry crossings are left out of the walking routes
  (`walkingRoutes`: no progress bar, no frontier, not in the Journal's route count), and
  `arriveInZone` opens an `opensOnArrival` zone when the player stands in it, with a
  toast. The play view and the Town Map draw crossings as a loose dotted line; the Town
  Map's route card says how a crossing works and an island's label says it opens on
  landing. The Fyn map shows each playable region's own badges from its campaign; tapping
  another playable region says to walk there. Feedback reports name the region.
- **D181. Svendborg playable** (owner request, P27, GDD v1.19). Content made with the
  same rules as Odense's (D163, D167, D168, D171): 55 species (`svb_` ids, Danish names in
  both languages), stats from the same role formulas and learnsets from the shared moves;
  spawn tables with rarity weights, a featured uncommon per district, rares per district
  and seven destination creatures at 1–3 homes. Home weights were tuned so the main home
  (highest weight, what the field guide names) is also where the creature is commonest
  (66–100 %), with chances there like Odense's (very rare 3.2 %, rares 8.5–11.5 %).
  Density report for Svendborg: all GDD targets met (destinations 1 per 98 m, wild 141 m,
  routes 308 m, streets 322 m, rare share 2.6×, 30-minute walk 19.1); CI now gates both
  regions. **Starter triangle:** the first draft broke it (Klintkonge as Stone/Grove beat
  Water too, and Storm had no strong Storm move before 28): Klintkonge is Stone/Folk,
  Ternling and Havterne learn Gust Lance at 18, and Kridtling starts with Grit Spray
  (Cobble Toss at 9, 290 stats) so Stone is not ahead early. **Arena POIs** sit on the
  nearest valid land spot to each site (zone, no-spawn, hazards, 80 m radius, 120 m from
  rest stops); the arena site moves with it. **Route trainers:** 102 on the 45 walking
  routes (none on ferry crossings), themed teams of the region's first stages evolved to
  their level. **Leaders** were tuned with a search over levels, members of the arena's
  type and one off-type move, scored like the balance guard (`tools/sim/test/balance.test.ts`,
  now run for every region with player-team presets); all 24 leader/starter pairs pass.
  The sim takes `--region` (starters named by type: `starter_water`, `starter_stone`,
  `starter_storm`), `pnpm sim:report --region svendborg` writes
  docs/regions/svendborg/BALANCE.md, and `pnpm spawn:report --region svendborg` checks the
  density. Sprites are drawn for every region's species (`allSpeciesIds`), and the
  franchise-term test reads every region. The e2e test `svendborg.e2e.ts` walks in from an
  Odense campaign, picks a Svendborg starter, plays arenas 1–8, beats a route trainer, shops,
  lands on Skarø (it opens) and walks back to an unchanged Odense campaign. It found three
  places that still read Odense's content in a Svendborg battle (legal actions, event
  playback, dev hooks), now fixed.
- **D182. Field guide by region; arena stamps on the Town Map** (owner request, GDD v1.20).
  The field guide no longer has district pages (a creature found in several districts was
  listed on each): it has one tab per playable region and a numbered list of that region's
  species in roster order (#001 starter lines first), each once. Seen and caught are read
  from the save's per-district lists, so anything seen or caught in any district counts;
  the save format is unchanged. A tab for a region the player isn't in reads that region's
  parked campaign and uses that region's names (`makeT(language, region)`). Every entry
  keeps its hints (where it spawns, a destination creature's homes), also before it is seen,
  and starters say how they are chosen. The Town Map draws arenas with the arena stamp
  (its done variant once won) instead of the badge, which was hard to read at map size and
  showed Odense's badges in Svendborg; badges stay on the Fyn map and the Badges screen.
  Places on the play map now do nothing while the player moves faster than 25 km/h (a
  press says so): before, a press acted while the card stayed hidden, which made CI's
  slower runs press twice and fail.
- **D183. Looking at another region's Town Map** (owner request, GDD v1.21). On the Fyn map
  a playable region other than the one being viewed opens its Town Map instead of the old
  "walk there" card. The Town Map keeps the viewed region in its own state and builds a
  view-only save: the save with that region's parked campaign spread over it (a new
  campaign before the first visit) and `region` set to it, so every rule (open zones,
  route progress, arena readiness, next route) reads that region; nothing is saved and the
  campaign doesn't switch. Texts come from `makeT(language, region)`, wild areas from that
  region's file (loaded lazily). The player marker and the Journal target are left out
  (they belong to the region being played); distances on cards are still straight lines
  from the player. A banner says play starts by walking there and has a "Back to …" button;
  the back gesture closes the Fyn map first, then returns to the own region, then closes
  the Town Map. The play map lists the places a press acts on (`data-reach`, empty while
  moving fast); the e2e helpers wait for it and press once (before, a card slower than
  400 ms on CI made them press a rest stop twice: "already healthy").
- **D184. Town Map icons at every zoom; route labels filter** (owner request, GDD v1.22).
  The zoom rules that hid route numbers, rest stops, markets and trainers (and destinations
  far out) are gone: icons hide only by the filter. Text labels drawn by the map (zone names,
  route names along the line) keep their zoom limits. The filter gains "Route labels" under
  "Routes": it hides the route number tags and the route-name layer; hiding routes hides
  them too, and its switch is then disabled and greyed out (no extra text). The banner on
  another region's Town Map (D183) is gone; the Fyn map and the back gesture lead back.
- **D185. Badges per region; the field guide's entry page** (owner request, GDD v1.23).
  `campaignView(save, region)` (packages/game) is the save as if that region were played,
  for looking only: the Town Map of another region, the badges screen and the field guide
  use it. The badges screen has region tabs (shared `RegionTabs` with the field guide) and
  opens on a given region from the Town Map's new badges button (rendered by the Town Map
  over itself; back closes it). The field guide list shows number, picture, name and
  seen/caught; a press opens the entry (types once seen, and where to find it). Hints for
  the same place, time and field ability in several districts merge into one line with the
  districts as runs ("Districts 1–3, 6"; all of the region's districts: "Every district").
- **D186. Heal and stat-lowering moves in the AI** (owner request, GDD v1.23). The set-up
  rule (leaders always, trainers half the time) gains two steps: a heal-only move below 50 %
  HP (before boosting), and a no-damage move that lowers the target's stats above 50 % HP
  when none of those stats is lowered yet (after boosting). Moves that heal and boost
  (Hunker Down) count as boosts. Wild creatures pick among moves that do something (no heal
  above half HP, no lowering a stat at −2 or raising one at +2; a mixed move always counts)
  and heal with a known heal move half the time below 35 % HP; the extra random number is
  only drawn when that heal is possible. The sim's player side uses the trainer tier, so
  it heals and lowers too. Leaders were re-tuned for both regions (with IVs, D187) by a search over
  member levels and moves the species knows by that level (throwaway scripts, not
  committed); see BALANCE.md and TEAMS.md. Svendborg arena 1's spirit leader lost Moonless
  Stare (Speed −2 took the storm starter's one edge, its speed). Svendborg arena 5's folk
  leader ends about 4 points outside its bands (inside the guard's 5-point slack; the sim
  is seeded, so the result is stable): to revisit with the next roster change.
- **D187. Individual values** (owner request, GDD v1.23). `CreatureInstance.ivs` (HP,
  Attack, Defence, 0–15) enters the stat formula as in the GDD; a creature without `ivs`
  counts as 7 each (`AVERAGE_IVS`): trainers' creatures, the sim's player teams and every
  creature saved before v1.23, so no save migration is needed (the fields are optional in
  the save schema). Wild creatures get `wildTraits(playerSeed, spawnId)` (packages/game,
  a hash of the player seed and spawn id into the engine's RNG), so the same spawn always
  has the same IVs for a player and a different player gets other ones; starters and the
  tutorial creature use `givenIvs(seed, key)`. Evolution and level-ups keep the IVs. The UI
  calls them "strengths" (Styrker), not a franchise term.
- **D188. Glimmer creatures** (owner request, GDD v1.23). `wildTraits` also decides
  `shiny` (1 in `SHINY_RATE` = 256): about 7 creatures per km and ~60 km per campaign give
  ~400 creatures, so about 4 in 5 players meet one (1 in 512 would leave half without).
  Player-facing name "Glimmer" (da and en), not the franchise word. The look is a CSS
  colour turn (hue 150°) and a gold sparkle on the battle sprite and in the team, so no new
  art is needed. It is revealed only when the battle begins (owner): map markers and the
  Nearby strip always show the normal form. The night battle
  background's decorative moon sat right behind the opponent's sprite and showed around it
  as a beige circle; it was removed.
- **D189. Glimmer forms in the field guide; save v12** (owner request, GDD v1.23). The
  campaign gains `glimmerSeen` (species ids met as a Glimmer creature; a campaign key, so
  each region has its own). `startWildBattle` adds the species when the wild creature is
  Glimmer. Save v12: the v11→v12 migration adds an empty list to the save and to every
  parked campaign (no Glimmer creature existed before). The entry page has a Normal /
  Glimmer switch (Glimmer disabled until seen) and previous / next buttons through the
  region's numbered list; a sparkle follows a Glimmer creature's name in battle, in team
  and storage rows and in its page title.
- **D190. Leaders heal and lower stats by chance** (owner request, GDD v1.24). The set-up
  rule's heal step and stat-lowering step take an optional AI rng; leaders pass it, and
  each step then fires only `LEADER_HEAL_MOVE_CHANCE` / `LEADER_LOWER_CHANCE` (0.5) of the
  time, otherwise the leader goes on down the rule (boost, status, best damage). Trainers
  already reach the set-up rule half of the time and wild creatures heal half of the time,
  so they are unchanged. Leaders that leaned on healing got easier and those whose lowering
  turns became attacks got harder; re-tuned with a level search (and, for Odense's water
  leader, fire and storm coverage swaps: kulingmaage and the second strømodder take
  thunder_squall, both strømodders take ember_hop against the grove starter):
  leader_water 17/7/23/20, svb_leader_folk 19/31/38/35, svb_leader_stone 32/41/40/49,
  svb_leader_grove 44/39/38/45/40. All 56 balance tests pass.
- **D191. Open regions; Odense first** (owner decisions on P28, GDD v1.25). `open` in a
  region's zones file (`Dex.open`). In an open region `isZoneOpen` is always true (so
  rares, layers, trainers, the Town Map and the Journal see no locks), `arenaReady` is
  always true and `trainerStatus` skips the badge n − 1 check; `openZones` and
  `arriveInZone` do nothing (no "is open" toasts; the save's zone list stays as it was). Rare creatures use the player's band
  (`spawnLevel(..., open)`), markets count badges (`marketStock`), and field abilities come
  from `arenas.json` `fieldAbility` (`fieldAbilityArena`; Odense: folk Sealbreaker, stone
  Runereader, water Angler, grove Forager, spirit Nightseer, storm Homing; validate checks
  each ability is taught by exactly one arena). The Journal suggests the nearest arena not
  won (`suggestedArena`, from the position each time, never stored) and drops the route
  step. The badge ceremony takes the save's badges (they come in any order) and names the
  ability learned and the new tier. Svendborg stays closed until Odense's version is
  deployed (owner).
- **D192. Leaders and trainers scale with badges** (P28). `scaledTeam(trainer, badges)` in
  `packages/game/src/scaling.ts`, used by `startTrainerBattle` and the sim (`leader@tier`).
  Tier = badges held, at most 7. A leader's `team` is its roster at full strength in the
  order members join; `tiers[t]` = { size, level, items }: the first `size` members, the
  strongest at `level`, the others as far below it as in the roster, sent out weakest
  first, each in the form its line has at that level (`formAtLevel`: back to the first
  stage, then evolve by level). A roster member's `coverage` move joins the moves learned
  by its level before `autoMoveset` picks four. Juniors and route trainers shift by the
  difference between the low ends of the player's band (district badges + 1) and their
  POI district's band, clamped to 2–50. Coins are paid for the team met (levels from the
  battle state). The v9 → v10 migration pays a tiered leader at tier arena − 1 (what it was
  on the old path), so old saves get what they always got.
- **D193. Open-region balance** (P28). The old presets were built to counter their own
  arena, so as generic teams they made every result swing on the teammates. An open
  region's preset arena n is a balanced team for n − 1 badges: the starter at the old
  starter level plus a wild Fire, Water and Grove creature and Folk ones one level lower
  (the one sharing the starter's type is left out, so presets list up to 6). One level per
  tier cannot put all three starters in their advantage / neutral / disadvantage bands at
  64 cells (searches showed it; the old game hand-made one team per arena), so open
  regions are guarded on what matters there: the mean over the starters 35–65 % (aimed at
  40–60) and every starter above 0 % and below 100 %; the class bands are a tie-breaker in
  the search. A lone starter could still beat a two-member tier-0 leader of a type it beats
  (one level moves tier-0 results by 30–60 points), so the owner's "never with the starter
  alone" is a rule instead: in an open region an arena takes a team of at least
  `ARENA_MIN_TEAM` = 3 creatures (`trainerStatus` → `smallTeam`; route trainers take
  anyone). Known swings to watch in Gate 3: at 5 badges (the starters' final forms) the fire
  starter wins about 95 % and the grove starter (grove/spirit) 1–7 % against the storm and
  water leaders. Rosters: each themed leader opens with a folk creature (or a folk dual type)
  so a two-member tier-0 team is no wall, and coverage moves aim at the starter that would
  otherwise win too easily. Roster members sit at the ace's level or one below (gaps made the top tiers
  too easy at the level cap). The balance test checks all 8 leaders at all 8 tiers with
  N = 300. Levels, sizes and items per
  tier come from a search with `pnpm sim` (results in docs/BALANCE.md).
- **D194. Route finds and extra creatures on finished routes** (P28). `noteRoutesWithFinds`:
  every 10th checkpoint reached for the first time is a find (`routeFind`, hash of seed,
  route and checkpoint: one in three an item from a pool that grows at 2 and 5 badges,
  otherwise 20 + 10 per badge + 0–10 coins); only in open regions; old checkpoints pay
  nothing. The map shows a toast; the Town Map route card says what walking it gives.
  `routeBonusSpawns`: for finished routes, the res-10 cells of their checkpoints within
  1.2 km get extra spawns from `computeSpawns` with `densityScale` 0.5, the seed
  `<save seed>|routes` and the id tag `route` (new optional inputs; shared spawns are
  unchanged, so no `SPAWN_ALGORITHM` bump). Worked out on the phone, nothing sent.
