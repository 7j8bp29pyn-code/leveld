import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, startOfIsoWeek, startOfMonth } from '../domain/dates';
import { averageChange, previousPeriod, stepSeries, stepStats, stepsForDay } from '../domain/steps';
import { useStore } from '../state/AppStore';
import { BarChart } from '../ui/BarChart';
import { Button, Card, Chip, Field, Muted, ProgressBar, Screen, SectionTitle, Segmented } from '../ui/components';
import { formatDate, relativeDay } from '../ui/format';
import { colors, font, space } from '../ui/theme';

const GOALS = [5000, 6000, 8000, 10000, 12000];
const THRESHOLDS = [2000, 3000, 5000, 8000];
const fmt = (n: number) => n.toLocaleString('de-DE');

/** Steps & everyday movement: manual entry, goal, week/month overview, auto-tick habits. */
export default function StepsScreen() {
  const { t } = useTranslation();
  const store = useStore();
  const { data, today } = store;
  const settings = data.profile.stepSettings;
  const [day, setDay] = useState(today);
  const current = stepsForDay(data.steps, day);
  const [text, setText] = useState(current !== null ? String(current) : '');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [busy, setBusy] = useState(false);

  const start = period === 'week' ? startOfIsoWeek(today) : startOfMonth(today);
  const end = period === 'week' ? addDays(start, 6) : today;
  const stats = stepStats(data.steps, start, today, settings.goal);
  const prev = previousPeriod(start, end);
  const change = averageChange(stats, stepStats(data.steps, prev.start, prev.end, settings.goal));
  const series = stepSeries(data.steps, start, end);
  const value = Number(text.replace(/\D/g, ''));
  const invalid = !!text && (!Number.isFinite(value) || value > 200000);

  const pick = (d: string) => {
    setDay(d);
    const v = stepsForDay(data.steps, d);
    setText(v !== null ? String(v) : '');
  };
  const save = async () => {
    if (!text || invalid) return;
    setBusy(true);
    await store.saveSteps(day, value);
    setBusy(false);
  };
  const setRule = (habitId: string, minSteps: number | null) => {
    const rest = settings.autoHabits.filter((r) => r.habitId !== habitId);
    store.saveProfile({ stepSettings: { ...settings, autoHabits: minSteps === null ? rest : [...rest, { habitId, minSteps }] } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('steps.title') }} />
      <Card>
        <Text style={font.label}>{relativeDay(day, today)}</Text>
        <Text testID="steps-value" style={[font.h1, { fontSize: 40, marginVertical: space.sm }]}>{current !== null ? fmt(current) : '–'}</Text>
        <Muted style={{ marginBottom: space.sm }}>{current === null ? t('steps.noData') : t('steps.of', { goal: fmt(settings.goal) })}</Muted>
        <ProgressBar value={current === null ? null : current / settings.goal} />
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <View style={{ flex: 1 }}>
            <Field testID="steps-input" value={text} onChangeText={setText} keyboardType="number-pad" placeholder={t('steps.input')}
              error={invalid ? t('errors.out_of_range') : null} onSubmitEditing={save} />
          </View>
          <Button testID="steps-save" title={t('steps.save')} onPress={save} disabled={!text || invalid} loading={busy} />
        </View>
      </Card>
      <Muted style={{ marginTop: space.sm }}>{t('steps.health')}</Muted>

      <SectionTitle>{t('steps.recent')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map((d) => {
          const v = stepsForDay(data.steps, d);
          return <Chip key={d} label={`${relativeDay(d, today)}${v !== null ? ` · ${fmt(v)}` : ''}`} selected={d === day} onPress={() => pick(d)} />;
        })}
      </View>

      <SectionTitle>{t('steps.title')}</SectionTitle>
      <Segmented<'week' | 'month'> value={period} onChange={setPeriod} options={[{ value: 'week', label: t('steps.week') }, { value: 'month', label: t('steps.month') }]} />
      <Card style={{ marginTop: space.md }}>
        <BarChart testID="steps-chart" max={Math.max(settings.goal, ...series.map((x) => x.steps ?? 0))}
          bars={series.map((x) => ({ label: period === 'week' ? formatDate(x.date, { weekday: 'short' }) : formatDate(x.date, { day: 'numeric' }), value: x.date > today ? null : x.steps }))}
          labelEvery={period === 'week' ? 1 : 5} />
        <Muted style={{ marginTop: space.sm, fontSize: 11 }}>{t('steps.missing')}</Muted>
        <View style={{ flexDirection: 'row', marginTop: space.md }}>
          <View style={{ flex: 1 }}><Text style={font.h2}>{stats.average !== null ? fmt(stats.average) : '–'}</Text><Muted style={{ fontSize: 11 }}>{t('steps.average')}</Muted></View>
          <View style={{ flex: 1 }}><Text style={font.h2}>{fmt(stats.total)}</Text><Muted style={{ fontSize: 11 }}>{t('steps.total')}</Muted></View>
        </View>
        <Muted style={{ marginTop: space.sm }}>{t('steps.goalDays', { n: stats.daysGoalReached })}</Muted>
        <Muted testID="steps-change">{change !== null ? t('steps.vsPrev', { pct: change > 0 ? `+${change}` : String(change) }) : t('steps.vsPrevNone')}</Muted>
      </Card>

      <SectionTitle>{t('steps.goal')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {GOALS.map((g) => <Chip key={g} label={fmt(g)} selected={settings.goal === g} onPress={() => store.saveProfile({ stepSettings: { ...settings, goal: g } })} />)}
      </View>

      <SectionTitle>{t('steps.auto')}</SectionTitle>
      <Muted style={{ marginBottom: space.md }}>{t('steps.autoHint')}</Muted>
      {data.habits.filter((h) => h.status === 'active').map((h) => {
        const rule = settings.autoHabits.find((r) => r.habitId === h.id);
        return (
          <View key={h.id} style={{ marginBottom: space.md }}>
            <Text style={[font.body, { fontWeight: '600', marginBottom: 6 }]}>{h.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip label={t('steps.autoNone')} selected={!rule} onPress={() => setRule(h.id, null)} />
              {THRESHOLDS.map((n) => (
                <Chip key={n} testID={`steprule-${h.name}-${n}`} label={`≥ ${fmt(n)}`} selected={rule?.minSteps === n} onPress={() => setRule(h.id, n)} />
              ))}
            </View>
          </View>
        );
      })}
      <Pressable onPress={() => pick(today)} style={{ marginTop: space.md }}>
        {day !== today && <Text style={{ color: colors.accent }}>{t('today.backToToday')}</Text>}
      </Pressable>
    </Screen>
  );
}
