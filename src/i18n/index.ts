import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de';
import en from './en';
import type { Locale } from '../domain/types';

/**
 * German is the default. Polish and Russian are prepared: add `pl.ts` / `ru.ts`
 * with the same shape as `en.ts` and register them below. Until then they fall back to English.
 */
export const LOCALES: { code: Locale; label: string; ready: boolean }[] = [
  { code: 'de', label: 'Deutsch', ready: true },
  { code: 'en', label: 'English', ready: true },
  { code: 'pl', label: 'Polski', ready: false },
  { code: 'ru', label: 'Русский', ready: false },
];

i18n.use(initReactI18next).init({ // eslint-disable-line import/no-named-as-default-member
  resources: { de: { translation: de }, en: { translation: en }, pl: { translation: {} }, ru: { translation: {} } },
  lng: 'de',
  fallbackLng: { pl: ['en'], ru: ['en'], default: ['de'] },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const dateLocale = (l: Locale) => ({ de: 'de-DE', en: 'en-GB', pl: 'pl-PL', ru: 'ru-RU' })[l];

export default i18n;
