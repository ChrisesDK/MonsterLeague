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
  enforces one leader per arena. `content/player-teams.json` holds one preset per arena:
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
  - `content/spawns.json` is empty until M2.
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

- **D55. Field abilities as data.** `content/field-abilities.json` holds
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
- **D64. Region file** `packages/data/region/region.odense.json`.
  - **Format:** `{region, version, h3Res 10, coarseRes 7, bbox, biomes[], osmTimestamp,
districts[{id, wildLevels, draft}], cells{h3: [district, noSpawn, …shares %]}}`.
  - One cell per line, shares as integer percent.
  - Cells without a district or any biome are dropped.
  - Validated by `pnpm validate` (schema, districts 1–8, stale-file check).
  - Size: 7,562 cells, 316 KB raw / 47 KB gzip.
- **D65. Districts** (`packages/data/content/districts.odense.geojson`, hand-editable).
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
- **D68. Spawn tables** for districts 1–2 (`content/spawns.json`).
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

- **D102. Districts 1–8 drawn on real borders** (`content/districts.odense.geojson`,
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
- **D113. Routes** (`content/routes.odense.json`, `pnpm routes:build`): Dijkstra over the
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
  - **Arena sites** (`content/arenas.odense.json`): all 8 arena locations for routes, the
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
  - **Side goals** (`content/goals.json`): explore (300 m in the district's wild areas),
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
