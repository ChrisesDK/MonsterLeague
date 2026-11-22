# Gate 3: district walk test (facilitator script)

**Question:** does walking to fights feel good?

**Pass if** (GDD Development plan: "spawn density on target; testers want to keep walking"):

- **Density:** metres walked per battle-able spawn, over all sessions, between **150 and
  500 m** (`pnpm gate3:report` marks ✓/✗). The GDD target is 150–300 m in green areas and
  300–500 m on city streets, and this route mixes both.
- **Fun:** the median answer to "How fun was this walk?" is **≥ 4/5**.
- **Want to keep walking:** at least **two-thirds of testers** say yes in the interview
  to "Did you ever walk somewhere just for the game?" or "Would you take this walk again
  tomorrow?".

**Watch, but don't gate on:**

- leader battle length (the GDD asks whether 30–40 turns is acceptable outdoors);
- battles per km;
- how many testers reach badge 1 in one walk.

## Before the day

- **Recruit 6–10 testers**, as for Gate 2: a mix of Android and iOS, at least 2 who
  don't play monster RPGs. Testers choose their own short code (e.g. T03); write down who
  chose which code on paper, never in the app.
- **Consent.** Tell them what is recorded:
  - the tester code;
  - the distance walked (one number, added up on the phone);
  - counts of creatures seen, battles, catches, trainers and rest-stop visits;
  - battle times;
  - the rating and an optional comment.

  No location is stored or sent: not even the route. They can delete everything by
  deleting the save in Settings.

- **Check the live build** at the start of the route:
  - open <https://www.christianrasmussen.dk/MonsterLeague/> on Wi-Fi so it is
    cached;
  - allow location;
  - check that creatures appear.
- **Testers start fresh.** Ask them to open the link at home first, but not to choose a
  starter yet: onboarding is part of the test.
- **Bring:** a spare charged phone with the app loaded, a power bank, this sheet, a pen,
  and a small torch for the after-dark session.

## Route (2–3 km, about 60–75 min)

**Odense station → Kongens Have → old town and back.** All POIs are `verified: false`:
walk the route yourself first, and move any POI that is not on public, step-free ground
(see the POI table in the M2b report).

1. **Odense Banegård** (main entrance).
   - Onboarding happens here: safety screen, location, starter.
   - The tutorial creature appears 100–200 m away.
   - The trainer at Banegårdspladsen is right outside.
2. **Hovedbiblioteket rest stop** (inside the station centre): first heal and restock.
3. **Kongens Have:**
   - the trainer by Landsarkivet;
   - the arena (junior trainer, then the Folk leader) in the middle of the park;
   - wild creatures on the lawns.
4. **Jernbanegade rest stop**, south of the park: heal before or after the arena.
5. **Old town via Gravene and Kongensgade:**
   - two more trainers;
   - city-street spawns (less dense, by design).
6. **Back to the station**, or end at Flakhaven.

**Sessions:**

- at least one in **daylight**;
- **one after dark** (sunset in Odense in December is about 15:40). Testers walk in
  pairs after dark and stay on lit streets; nothing in the game needs a dark park.

## Session steps

1. **Start (2 min).** In Settings → Walk test, the tester enters their code and taps
   _Start walk test_. Then they go back to the map. Say: "Play as you like. Walk where you
   want; I'll follow."
2. **Walk (45–60 min).**
   - Don't steer them; only stop them at the agreed end time or end point.
   - If they ask how something works, answer briefly and note the question.
3. **End (3 min).**
   - Settings → Walk test → _End walk_.
   - The tester gives the 1–5 rating and an optional comment.
   - Then _Send test results (JSON)_ to you (AirDrop, mail or a chat of their choice).
4. **Interview (5–10 min)**, see below.

## Observation notes (one sheet per tester)

| What to note                                                                   | Notes |
| ------------------------------------------------------------------------------ | ----- |
| Did they look up from the phone while walking? Often / sometimes / rarely      |       |
| Moments they stopped in an unsafe spot (kerb, cycle lane, crossing)            |       |
| Times they changed direction **because of the game** (a creature, POI, arrow)  |       |
| Times they ignored a creature or trainer they could see; why?                  |       |
| Confusion: onboarding, tutorial catch, arrows, POI cards, rest stops, too wild |       |
| Losses: did they understand that the team stays fainted and where to heal?     |       |
| Leader battle: turns, and did they lose interest standing up?                  |       |
| Battery and GPS problems (weak GPS banner, jumps)                              |       |
| After dark: did they feel comfortable? Anything they avoided?                  |       |

## Interview questions

1. Did you ever walk somewhere just for the game? Where, and what drew you?
2. Would you take this walk again tomorrow? What would make you?
3. Were there too many creatures, too few, or about right? Where did it feel empty?
4. How did the trainers and the arena feel compared with the wild battles?
5. Was it clear where to go next? (Arrows, the rest-stop hint after losing.)
6. Was there a moment you felt unsafe or had to stop in an awkward place?
7. After dark: did the game feel different? Would you play it at night?
8. One thing you would change.

## After the day

1. Put all exported files in one folder (outside the repo, or in `/gate3/`, which git
   ignores).
2. Run `pnpm gate3:report <folder>`. It shows:
   - the median distance per session;
   - metres per battle-able spawn (✓/✗ against 150–500 m);
   - battles and catches per km;
   - the rating distribution and median (✓/✗ against 4);
   - leader turns, active time per battle kind;
   - all comments.
3. Count the interview "yes" answers for keep-walking.
4. **Decision.**
   - **Pass:** all three pass conditions are met. Go on to M3.
   - **Density fails:** retune `DENSITY` in `packages/spawn` with `pnpm spawn:report`,
     record the change in DECISIONS and repeat one walk.
   - **Fun or keep-walking fails:** write up the notes and the top three complaints as
     GDD proposals before M3.
5. Record the result in docs/PLAN.md and send the report to the GDD owner.
