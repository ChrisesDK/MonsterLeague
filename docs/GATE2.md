# Gate 2: outdoor battle test (facilitator script)

**Question:** are battles fun standing on a street?
**Pass if:**

- median rating ≥ 4/5;
- median active time: wild < 2 min, trainer < 3 min, arena < 8 min.

**Not tested here:** the map, GPS and spawning (that's M2).

## Before the day

- **Recruit 6–10 testers.** Aim for 12+ players of handheld monster RPGs with a mix of
  Android and iOS phones, and at least 2 who don't play these games. Testers make up their
  own short code in the app (e.g. T03 or FOX7); they don't need one from you, and no
  names go into the app. Note which code each person chose on paper, not in the app.
- **Consent.** Tell them what is recorded: tester code, battle times, turns, ratings,
  comments. Nothing about location. They can delete their results in the app.
- **Deploy and check** the build (see [DEPLOY.md](DEPLOY.md)). Send the link and ask
  testers to open it once on Wi-Fi beforehand, so it works offline outside.
- **Bring:** a spare charged phone with the app loaded, a power bank, this sheet and a pen.

## Where to stand

- A wide pavement, square or park path: off the cycle lane, back to a wall or bench, out
  of the flow of people.
- In Odense, for example Flakhaven or the paths in Kongens Have. Not at kerbs or crossings.
- Try at least one spot in **bright daylight** (glare) and, if possible, one in the
  shade or at dusk.
- Testers stand (no sitting) and hold the phone in one hand, as they would on a walk.

## Session (about 25–30 min per tester)

1. **Start screen (2 min).**
   - The tester enters their code, picks a language, starter and speed (default
     _Normal_), and reads the safety note.
   - Don't explain the game. Say: "Play as you would on a walk; think aloud if you like."
2. **Battles, in the order the app shows.** Testers may redo any battle.
   1. Wild creature 1 (random, L8–10). Catching is allowed.
   2. Wild creature 2.
   3. Route trainer.
   4. Arena 1 leader.
   5. _(Optional, if time and energy)_ Arena 2 leader.
3. After each battle the app asks for a **1–5 rating**, "too long / about right / too
   short" and an optional comment. Don't help with the answers.
4. **Interview (5 min)**, then results export (below).

You may suggest _Fast_ speed after the first two battles if they look impatient; note it.

## What to watch and note (per battle)

| Look for                                                   | Note as                      |
| ---------------------------------------------------------- | ---------------------------- |
| Pauses before choosing a move (> 5 s), re-reading the log  | **H** hesitation, + where    |
| Wrong taps, missed buttons, thumb stretching to the top    | **F** finger, + which button |
| Tilting the phone, shading the screen, squinting           | **G** glare                  |
| "What does … mean?", confusion about types/switching/items | **C** confusion, + quote     |
| Looking up at surroundings / stepping aside for people     | **A** awareness (good!)      |
| Smiles, "ooh", fist pumps vs. sighs, eye-rolls             | **+ / −**                    |
| Pressing Pause, switching apps                             | **P** pause                  |

Write the tester code at the top of each page and the battle number in the margin.

## Interview: three questions

1. "Which battle was the most fun, and which one dragged? Why?"
2. "Was there a moment where you didn't know what to do or what happened?"
3. "Would you stop on a walk to fight one of these? Which kind, and for how long at most?"

## Collecting results

1. On the tester's phone: menu → **Send results** → **Share files**. That sends the
   `.json` and `.csv` to you by AirDrop, Messenger, mail or Nearby Share.
   - If sharing fails, use **Download JSON** and have them send the file, or **Copy as
     text** into a message to you.
2. Save all files into one folder, e.g. `gate2/2026-11-28/`. Duplicates don't matter: the
   report merges them by record id.
3. Optional: once you have the files, the tester may tap **Delete my results**.
4. Run the report:

   ```sh
   pnpm gate2:report gate2/2026-11-28
   ```

   It prints:
   - median active time per battle kind against the target;
   - the rating distribution (mean and median);
   - "too long / about right / too short" counts;
   - all comments.

   _Active time_ excludes pauses and time with the app in the background. The raw files
   also hold wall-clock start/end times, turns, switches, items and catches.

## Deciding

- **Pass:** median rating ≥ 4 and all three time targets met → go to M2.
- **Fun but too long** (≥ 4/5, times over target or many "too long"):
  - first shorten text and animation (try _Fast_ as the default);
  - then the numbers (HP formula, leader levels), as the GDD says.
- **Below 4/5:** read the comments and your H/C notes first. Unclear decisions and missed
  taps usually matter more than balance at this stage.
- Write a short summary into the GDD (via a proposal in
  [GDD-PROPOSALS.md](GDD-PROPOSALS.md) if it changes design).
