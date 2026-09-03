import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import te from '../../messages/te.json';

/**
 * §6.3: every UI string goes through the i18n layer from day one. English is
 * complete; Hindi and Telugu carry the keys that are ready and fall back to
 * English for the rest, so a partial translation never blanks a screen.
 */

export const LOCALES = ['en', 'hi', 'te'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'khata_locale';

export interface Messages {
  [key: string]: string | Messages;
}

const CATALOGUES: Record<AppLocale, Messages> = { en, hi, te } as unknown as Record<AppLocale, Messages>;

function mergeDeep(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      existing && typeof existing === 'object' && typeof value === 'object'
        ? mergeDeep(existing, value)
        : value;
  }
  return out;
}

export function isAppLocale(value: string | undefined): value is AppLocale {
  return LOCALES.includes(value as AppLocale);
}

export function getMessages(locale: string): Messages {
  if (!isAppLocale(locale) || locale === 'en') return CATALOGUES.en;
  return mergeDeep(CATALOGUES.en, CATALOGUES[locale]);
}
