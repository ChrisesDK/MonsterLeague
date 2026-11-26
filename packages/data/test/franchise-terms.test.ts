import { describe, expect, it } from 'vitest';
import { i18nFor, REGION_IDS, regions } from '../src/index';
import { deniedName, deniedWords } from './franchise-terms';

describe('franchise-term matcher', () => {
  it('matches exact names case-insensitively, with ids read as words', () => {
    expect(deniedName('cut')).toBe('Cut');
    expect(deniedName('ROCK SMASH')).toBe('Rock Smash');
    expect(deniedName('rock_smash')).toBe('Rock Smash');
    expect(deniedName('Pokédex')).toBe('Pokédex');
    expect(deniedName('Cobble Toss')).toBe(null);
    expect(deniedName('Cutlass')).toBe(null);
  });

  it('matches whole words only', () => {
    expect(deniedWords('Teach it Rock  Smash now')).toEqual(['Rock Smash']);
    expect(deniedWords('a POKÉ BALL!')).toEqual(['Poké Ball']);
    expect(deniedWords('needs Cut.')).toEqual(['Cut']);
    expect(deniedWords('Shortcut, cutting, flygt, Flashlight, divers, Strengthen')).toEqual([]);
    expect(deniedWords('Lygtemand og Bøgevætte')).toEqual([]);
  });
});

describe.each(REGION_IDS)('%s content uses no franchise terms', (region) => {
  const content = regions[region];
  const i18n = i18nFor(region);
  const names: { where: string; name: string }[] = [];
  const add = (kind: string, ids: string[], key: (id: string) => string) => {
    for (const id of ids) {
      names.push({ where: `${kind} id`, name: id });
      for (const locale of ['en', 'da'] as const) {
        names.push({ where: `${kind} name (${locale})`, name: i18n[locale][key(id)] ?? '' });
      }
    }
  };
  add('species', Object.keys(content.species), (id) => `species.${id}.name`);
  add('move', Object.keys(content.moves), (id) => `move.${id}.name`);
  add('item', Object.keys(content.items), (id) => `item.${id}.name`);
  add('field ability', Object.keys(content.fieldAbilities), (id) => `fieldAbility.${id}.name`);

  it('no species, move, item or field-ability name or id is a denied term', () => {
    const hits = names.flatMap(({ where, name }) => {
      const term = deniedName(name);
      return term ? [`${where} "${name}" = ${term}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it('no da/en i18n string contains a denied term as a whole word', () => {
    const hits = (['en', 'da'] as const).flatMap((locale) =>
      Object.entries(i18n[locale]).flatMap(([key, text]) =>
        deniedWords(text).map((term) => `${locale} ${key}: "${text}" contains "${term}"`),
      ),
    );
    expect(hits).toEqual([]);
  });
});
