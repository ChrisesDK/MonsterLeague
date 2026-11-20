/**
 * Franchise-term deny-list (CLAUDE.md hard rule 1, GDD v1.2 accepted proposal P1).
 *
 * Odense Monster League is an original game in the monster-RPG genre. Its content must
 * never reuse the Pokémon brand words or the names of the Pokémon field moves ("HMs"),
 * which a player would immediately recognise. This short, hand-written list is checked
 * by franchise-terms.test.ts in CI. It is NOT taken from any Pokémon dataset, and it
 * should stay small: generic words only belong here if they are franchise-specific
 * terms in our context.
 *
 * Matching: names and ids must not equal a term; i18n strings must not contain a term as
 * a whole word (case-insensitive). Note that this also blocks the Danish word "fly"
 * (aeroplane) on its own; "flyve", "flygte" etc. are fine.
 */
export const DENIED_TERMS: readonly string[] = [
  // Brand words
  'Pokemon',
  'Pokémon',
  'Pokeball',
  'Pokéball',
  'Poke Ball',
  'Poké Ball',
  'Pokedex',
  'Pokédex',
  // Field-move names and the term for them
  'Cut',
  'Fly',
  'Surf',
  'Strength',
  'Rock Smash',
  'Flash',
  'Waterfall',
  'Whirlpool',
  'Dive',
  'Defog',
  'Rock Climb',
  'HM',
];

const normalise = (s: string) =>
  s
    .normalize('NFC')
    .toLocaleLowerCase('en')
    .replace(/[_\s]+/g, ' ')
    .trim();

/** Exact match: a whole name (or id, with "_" read as a space) equal to a denied term. */
export function deniedName(name: string): string | null {
  const n = normalise(name);
  return DENIED_TERMS.find((t) => normalise(t) === n) ?? null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = DENIED_TERMS.map(
  (t) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${escape(normalise(t)).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`,
      'iu',
    ),
);

/** Whole-word match anywhere in a text, case-insensitive (Unicode letters count as word characters). */
export function deniedWords(text: string): string[] {
  const n = normalise(text);
  return DENIED_TERMS.filter((_, i) => WORD[i]!.test(n));
}
