import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, compareDates } from '../../domain/dates';
import { expansionReady, phaseSuggestion, type PhaseSuggestion } from '../../domain/phases';
import { itemsForDay, nextItem, type TodayItem } from '../../domain/schedule';
import { useStore } from '../../state/AppStore';
import { Badge, Button, Card, HabitIcon, Muted, ProgressBar, Screen, SectionTitle } from '../../ui/components';
import { formatDate, nowTime, relativeDay } from '../../ui/format';
import { colors, font, radius, space } from '../../ui/theme';

export default function Today() {
  const { t } = useTranslation();
  const store = useStore();
  const { data, today } = store;
  // null = follow "today" (also across midnight); otherwise a picked past day
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const setDay = (d: string) => setPicked(d === today ? null : d);

  const items = useMemo(() => itemsForDay(data.habits, data.entries, day), [data.habits, data.entries, day]);
  const counted = items.filter((i) => i.entry?.status !== 'skipped' && i.entry?.status !== 'paused' && i.entry?.status !== 'postponed');
  const done = items.filter((i) => i.entry?.status === 'done').length;
  const total = counted.length;
  const isToday = day === today;
  const next = isToday ? nextItem(items, nowTime()) : null;

  const suggestions = useMemo(
    () => (isToday ? data.habits.map((h) => phaseSuggestion(h, data.entries, data.profile, today)).filter((x): x is PhaseSuggestion => !!x) : []),
    [isToday, data.habits, data.entries, data.profile, today],
  );
  const showExpansion = isToday && data.profile.mode === 'guided' && data.habits.some((h) => h.status === 'active')
    && expansionReady(data.habits, data.entries, data.profile, today);

  const hour = new Date().getHours();
  const greeting = t(`today.greeting.${hour < 11 ? 'morning' : hour < 18 ? 'day' : 'evening'}`);

  const toggle = (item: TodayItem) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
    store.toggleDone(item.habit.id, day);
  };

  return (
    <Screen>
      <Text style={font.small}>{formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <Text style={[font.h1, { marginTop: 2 }]}>{greeting}{data.profile.displayName ? `, ${data.profile.displayName}` : ''}</Text>

      <View style={st.dayNav}>
        <Pressable accessibilityLabel="previous day" testID="day-prev" onPress={() => setDay(addDays(day, -1))} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
        </Pressable>
        <Text testID="day-label" style={font.h3}>{relativeDay(day, today)}</Text>
        <Pressable accessibilityLabel="next day" testID="day-next" disabled={compareDates(day, today) >= 0} onPress={() => setDay(addDays(day, 1))} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={compareDates(day, today) >= 0 ? colors.border : colors.textMuted} />
        </Pressable>
      </View>
      {!isToday && (
        <Pressable onPress={() => setDay(today)} style={{ alignSelf: 'center', marginBottom: space.md }}>
          <Text style={{ color: colors.accent }}>{t('today.viewingPast')} {t('today.backToToday')}</Text>
        </Pressable>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm }}>
          <Text testID="today-progress" style={font.h3}>{total ? t('today.progress', { done, total }) : t('today.nothingPlanned')}</Text>
          {total > 0 && <Text style={[font.h3, { color: colors.accent }]}>{Math.round((done / total) * 100)} %</Text>}
        </View>
        <ProgressBar value={total ? done / total : null} />
        {next && (
          <Pressable onPress={() => router.push({ pathname: '/log', params: { habitId: next.habit.id, date: day } })} style={st.next}>
            <Text style={font.label}>{t('today.next')}</Text>
            <Text style={[font.body, { marginTop: 2 }]}>
              {next.habit.name}{next.habit.reminderTime ? ` · ${t('today.at', { time: next.habit.reminderTime })}` : ''}
            </Text>
          </Pressable>
        )}
        {total > 0 && done === total && <Muted style={{ marginTop: space.md, color: colors.success }}>{t('today.allDone')}</Muted>}
      </Card>

      {suggestions.map((sg) => <SuggestionCard key={sg.habitId} sg={sg} />)}
      {showExpansion && (
        <Card style={{ marginTop: space.md }}>
          <Text style={font.h3}>{t('phase.expansionTitle')}</Text>
          <Muted style={{ marginTop: 4, marginBottom: space.md }}>{t('phase.expansionText')}</Muted>
          <Button kind="secondary" compact title={t('habit.create')} onPress={() => router.push('/habits')} />
        </Card>
      )}

      <SectionTitle>{relativeDay(day, today)}</SectionTitle>
      {items.length === 0 && (
        <Card>
          <Muted style={{ marginBottom: space.md }}>{t('today.nothingPlanned')}</Muted>
          <Button testID="add-first" kind="secondary" title={t('today.addFirst')} onPress={() => router.push('/habit')} />
        </Card>
      )}
      {items.map((item) => <HabitRow key={item.habit.id} item={item} day={day} onToggle={() => toggle(item)} />)}
    </Screen>
  );
}

function HabitRow({ item, day, onToggle }: { item: TodayItem; day: string; onToggle: () => void }) {
  const { t } = useTranslation();
  const { habit, entry } = item;
  const done = entry?.status === 'done';
  const subtitle: string[] = [];
  if (entry && entry.status !== 'done') {
    subtitle.push(entry.status === 'postponed' ? t('today.status.postponed', { date: formatDate(entry.postponedTo!) }) : t(`today.status.${entry.status}`));
  }
  if (item.weekly) subtitle.push(t('today.flexible', { done: item.weekly.done, target: item.weekly.target }));
  if (item.postponedFrom.length) subtitle.push(t('today.postponedFrom', { date: formatDate(item.postponedFrom[0]) }));
  if (item.kind === 'postponed_in' && !item.postponedFrom.length) subtitle.push(t('today.extra'));
  if (habit.reminderTime) subtitle.push(habit.reminderTime);
  const valueSummary = entry && done ? entry.fieldSnapshot.map((f) => `${entry.values[f.key]}${f.unit ? ' ' + f.unit : ''}`).join(' · ') : '';

  return (
    <View style={[st.row, entry && !done && { opacity: 0.6 }]}>
      <Pressable
        testID={`row-${habit.name}`}
        style={st.rowMain}
        onPress={() => router.push({ pathname: '/log', params: { habitId: habit.id, date: day } })}
      >
        <HabitIcon name={habit.icon} done={done} />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={[font.body, { fontWeight: '600' }, done && { color: colors.textMuted }]} numberOfLines={1}>{habit.name}</Text>
          <Muted>{[...subtitle, valueSummary].filter(Boolean).join(' · ') || t('phase.label', { n: habit.phase, name: t(`phase.names.${habit.phase}`) })}</Muted>
        </View>
        {habit.phase === 1 && !entry && <Badge label={t('today.building')} />}
      </Pressable>
      <Pressable
        testID={`check-${habit.name}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? t('today.uncheckA11y', { name: habit.name }) : t('today.checkA11y', { name: habit.name })}
        onPress={onToggle}
        hitSlop={8}
        style={[st.check, done && { backgroundColor: colors.success, borderColor: colors.success }]}
      >
        {done && <Ionicons name="checkmark" size={20} color={colors.onAccent} />}
      </Pressable>
    </View>
  );
}

function SuggestionCard({ sg }: { sg: PhaseSuggestion }) {
  const { t } = useTranslation();
  const store = useStore();
  const habit = store.data.habits.find((h) => h.id === sg.habitId)!;
  const total = sg.stats.done + sg.stats.undocumented;
  return (
    <Card testID={`suggestion-${habit.name}`} style={{ marginTop: space.md, borderColor: colors.accent }}>
      <Text style={font.h3}>{t('phase.suggestTitle', { name: habit.name })}</Text>
      <Muted style={{ marginTop: 4 }}>
        {t('phase.suggestText', {
          pct: Math.round((sg.stats.rate ?? 0) * 100), days: store.data.profile.phaseWindowDays, done: sg.stats.done, total,
          to: sg.to, toName: t(`phase.names.${sg.to}`),
        })}
      </Muted>
      <Muted style={{ marginTop: 4, fontSize: 11 }}>{t('phase.suggestNote', { threshold: Math.round(store.data.profile.phaseThreshold * 100) })}</Muted>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <View style={{ flex: 1 }}><Button compact title={t('phase.accept')} onPress={() => store.changePhase(habit.id, sg.to, 'suggestion_accepted')} /></View>
        <View style={{ flex: 1 }}><Button compact kind="secondary" title={t('phase.dismiss')} onPress={() => store.dismissSuggestion(habit.id)} /></View>
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.lg },
  next: { marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: space.sm,
    paddingRight: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: space.md, gap: 0 },
  check: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.textFaint, alignItems: 'center', justifyContent: 'center' },
});
