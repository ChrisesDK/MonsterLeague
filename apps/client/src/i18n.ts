import { i18nFor, type Locale, type RegionId } from '@oml/data';

export type { Locale };
export const LOCALES: Locale[] = ['da', 'en'];

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const tables = new Map<RegionId, ReturnType<typeof i18nFor>>();

/**
 * Looks up a key in the locale table and fills `{param}` placeholders. Falls back to the key.
 * P27: the table is the shared UI texts plus the region's own (its creatures, places, zones…),
 * so a campaign only ever shows its own region's names.
 */
export function makeT(locale: Locale, region: RegionId = 'odense'): Translate {
  let all = tables.get(region);
  if (!all) tables.set(region, (all = i18nFor(region)));
  const table = all[locale];
  const en = all.en;
  return (key, params) => {
    const template = table[key] ?? en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, name: string) =>
      params[name] !== undefined ? String(params[name]) : m,
    );
  };
}
