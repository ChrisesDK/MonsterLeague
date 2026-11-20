import { i18n, type Locale } from '@oml/data';

export type { Locale };
export const LOCALES: Locale[] = ['da', 'en'];

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Looks up a key in the locale table and fills `{param}` placeholders. Falls back to the key. */
export function makeT(locale: Locale): Translate {
  const table = i18n[locale];
  return (key, params) => {
    const template = table[key] ?? i18n.en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, name: string) =>
      params[name] !== undefined ? String(params[name]) : m,
    );
  };
}
