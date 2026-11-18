import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, compareDates, diffDays, isLocalDate, startOfIsoWeek, startOfMonth } from '../../domain/dates';
import { combineStats, currentStreak, dailySeries, habitStats } from '../../domain/stats';
import { useStore } from '../../state/AppStore';
import { BarChart } from '../../ui/BarChart';
import { Card, Chip, Field, HabitIcon, Muted, ProgressBar, Screen, SectionTitle, Segmented } from '../../ui/components';
import { formatDate, pct } from '../../ui/format';
import { colors, font, space } from '../../ui/theme';

type Period = 'week' | 'month' | 'd90' | 'custom';

export default function Progress() {
  const { t } = useTranslation();
  const { data, today } = useStore();
  const [period, setPeriod] = useState<Period>('week');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState<string | null>(null);

  const range = useMemo((): { start: string; end: string; error?: string } => {
    if (period === 'week') return { start: startOfIsoWeek(today), end: addDays(startOfIsoWeek(today), 6) };
    if (period === 'month') return { start: startOfMonth(today), end: today };
    if (period === 'd90') return { start: addDays(today, -89), end: today };
    if (!isLocalDate(from) || !isLocalDate(to)) return { start: today, end: today, error: t('errors.invalid_date') };
    if (compareDates(from, to) > 0) return { start: to, end: from };
    return { start: from, end: to };
  }, [period, from, to, today, t]);

  const habits = data.habits.filter((h) => h.status !== 'archived' && (!filter || h.id === filter));
  const perHabit = habits.map((h) => ({ h, s: habitStats(h, data.entries, range.start, range.end, today), streak: currentStreak(h, data.entries, today) }));
  const total = combineStats(perHabit.map((x) => x.s));
  const span = diffDays(range.start, range.end) + 1;
  const series = span <= 92 ? dailySeries(habits, data.entries, range.start, range.end, today) : [];

  if (!data.habits.length) {
    return <Screen><Text style={font.h1}>{t('progress.title')}</Text><Muted style={{ marginTop: space.lg }}>{t('progress.noHabits')}</Muted></Screen>;
  }

  return (
    <Screen>
      <Text style={[font.h1, { marginBottom: space.lg }]}>{t('progress.title')}</Text>
      <Segmented<Period> testID="period" value={period} onChange={setPeriod}
        options={[{ value: 'week', label: t('progress.week') }, { value: 'month', label: t('progress.month') }, { value: 'd90', label: t('progress.d90') }, { value: 'custom', label: t('progress.custom') }]} />
      {period === 'custom' && (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <View style={{ flex: 1 }}><Field label={t('progress.from')} value={from} onChangeText={setFrom} autoCapitalize="none" /></View>
          <View style={{ flex: 1 }}><Field label={t('progress.to')} value={to} onChangeText={setTo} autoCapitalize="none" /></View>
        </View>
      )}
      {range.error && <Muted style={{ color: colors.danger, marginTop: space.sm }}>{range.error}</Muted>}
      <Muted style={{ marginTop: space.sm }}>{formatDate(range.start)} – {formatDate(range.end)}</Muted>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md }}>
        <Chip label={t('progress.all')} selected={!filter} onPress={() => setFilter(null)} />
        {data.habits.filter((h) => h.status !== 'archived').map((h) => <Chip key={h.id} label={h.name} selected={filter === h.id} onPress={() => setFilter(h.id)} />)}
      </View>

      <Card style={{ marginTop: space.md }}>
        <Text style={font.label}>{t('progress.rate')}</Text>
        <Text testID="overall-rate" style={[font.h1, { fontSize: 40, marginVertical: space.sm }]}>{pct(total.rate)}</Text>
        <ProgressBar value={total.rate} />
        <View style={{ flexDirection: 'row', marginTop: space.lg }}>
          <Stat label={t('progress.completed')} value={total.done + total.extra} />
          <Stat label={t('progress.undocumented')} value={total.undocumented} />
          <Stat label={t('progress.notCounted')} value={total.skipped + total.paused + total.postponed + total.healthPause} />
        </View>
        {total.adapted + total.recovery > 0 && (
          <Muted testID="recovery-stats" style={{ marginTop: space.md }}>
            {t('today.status.adapted')}: {total.adapted} · {t('today.status.recovery')}: {total.recovery}
          </Muted>
        )}
        <Muted style={{ marginTop: space.md, fontSize: 11 }}>{t('progress.rateExplain')}</Muted>
      </Card>

      {series.length > 0 && (
        <>
          <SectionTitle>{t('progress.daily')}</SectionTitle>
          <Card>
            <BarChart
              testID="daily-chart"
              bars={series.map((p) => ({
                label: span <= 7 ? formatDate(p.date, { weekday: 'short' }) : formatDate(p.date, { day: 'numeric' }),
                value: compareDates(p.date, today) > 0 || (p.rate === null && p.done === 0) ? null : p.done,
              }))}
              labelEvery={span <= 7 ? 1 : span <= 31 ? 5 : 15}
            />
            <Muted style={{ marginTop: space.sm, fontSize: 11 }}>{t('progress.missingNote')}</Muted>
          </Card>
        </>
      )}

      <SectionTitle>{t('progress.perHabit')}</SectionTitle>
      {perHabit.map(({ h, s, streak }) => (
        <Card key={h.id} style={{ marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
            <HabitIcon name={h.icon} size={16} />
            <Text style={[font.body, { flex: 1, marginLeft: space.md, fontWeight: '600' }]}>{h.name}</Text>
            <Text style={[font.h3, { color: s.rate === null ? colors.textFaint : colors.text }]}>{pct(s.rate)}</Text>
          </View>
          <ProgressBar value={s.rate} height={4} />
          <Muted style={{ marginTop: space.sm }}>
            {s.done}/{s.done + s.undocumented} · {t('progress.undocumented')}: {s.undocumented}
            {s.skipped + s.paused + s.postponed + s.healthPause ? ` · ${t('progress.notCounted')}: ${s.skipped + s.paused + s.postponed + s.healthPause}` : ''}
            {streak ? ` · ${t('habit.streak', { n: streak })}` : ''}
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={font.h2}>{value}</Text>
      <Muted style={{ fontSize: 11 }}>{label}</Muted>
    </View>
  );
}
