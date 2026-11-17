import i18n, { dateLocale } from '../i18n';
import type { Locale, LocalDate } from '../domain/types';
import { addDays } from '../domain/dates';

const loc = () => dateLocale((i18n.language as Locale) || 'de');

/** Formats a local calendar date without any time-zone shifting. */
export function formatDate(d: LocalDate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Intl.DateTimeFormat(loc(), { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, day)));
}

export function relativeDay(d: LocalDate, today: LocalDate): string {
  if (d === today) return i18n.t('common.today');
  if (d === addDays(today, -1)) return i18n.t('common.yesterday');
  if (d === addDays(today, 1)) return i18n.t('common.tomorrow');
  return formatDate(d);
}

export const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)} %`);

export function nowTime(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}
