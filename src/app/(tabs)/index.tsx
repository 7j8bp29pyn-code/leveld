import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, compareDates } from '../../domain/dates';
import { expansionReady, phaseSuggestion, type PhaseSuggestion } from '../../domain/phases';
import { assessReadiness, statusForOption, type Assessment, type TrainingOption } from '../../domain/readiness';
import { itemsForDay, nextItem, type TodayItem } from '../../domain/schedule';
import { currentCycle, deloadHint, isPlannedRestDay, NO_PROGRESSION_PHASES } from '../../domain/training';
import { FULFILLED, type Readiness } from '../../domain/types';
import { ReadinessAdvice, TrainingOptions } from '../../ui/readinessViews';
import { todosForDay } from '../../domain/todos';
import { stepsForDay } from '../../domain/steps';
import { TodoRow } from '../../ui/todoViews';
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
  // skipped / paused / postponed / health_pause leave the day's total – never a failure
  const counted = items.filter((i) => !i.entry || FULFILLED.includes(i.entry.status));
  const done = items.filter((i) => i.entry && FULFILLED.includes(i.entry.status)).length;
  const total = counted.length;
  const isToday = day === today;
  const next = isToday ? nextItem(items, nowTime()) : null;

  const todoItems = todosForDay(data.todos, day, today, data.profile.dayStartHour);
  const stepsToday = stepsForDay(data.steps, day);
  const features = data.profile.features;
  const checkin = features.checkin ? data.checkins.find((c) => c.localDate === day) ?? null : null;
  const assessment = assessReadiness(checkin);
  const cycle = features.cycles ? currentCycle(data.cycles, day) : null;
  const restDay = isPlannedRestDay(cycle, day);
  const deload = isToday && features.cycles && features.checkin ? deloadHint(data.cycles, data.checkins, today) : null;
  const openTraining = items.filter((i) => i.habit.kind === 'training' && !i.entry);
  // no automatic progression for training on tired/ill days or in deload/maintenance phases
  const holdTraining = !!assessment?.suppressProgression || (!!cycle && NO_PROGRESSION_PHASES.includes(cycle.phase));

  const suggestions = isToday
    ? data.habits
      .filter((h) => !(holdTraining && h.kind === 'training'))
      .map((h) => phaseSuggestion(h, data.entries, data.profile, today)).filter((x): x is PhaseSuggestion => !!x)
    : [];

  // quick setup for users from before the update (dismissible, remembered on this device)
  const [setupDismissed, setSetupDismissed] = useState(true);
  useEffect(() => { AsyncStorage.getItem('leveld.setupDismissed').then((v) => setSetupDismissed(v === '1')); }, []);
  const showSetup = !data.profile.trainingLevel && !setupDismissed;
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

      <Card testID="steps-card" onPress={() => router.push('/steps')} style={{ marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Ionicons name="footsteps-outline" size={22} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={font.body}>
            {t('steps.title')}: {stepsToday !== null ? stepsToday.toLocaleString('de-DE') : '–'}
            <Text style={{ color: colors.textMuted }}> / {data.profile.stepSettings.goal.toLocaleString('de-DE')}</Text>
          </Text>
          <View style={{ marginTop: 6 }}><ProgressBar value={stepsToday === null ? null : stepsToday / data.profile.stepSettings.goal} height={4} /></View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>

      {showSetup && (
        <Card testID="setup-card" style={{ marginTop: space.md, borderColor: colors.accent }}>
          <Text style={font.h3}>{t('level.setupCardTitle')}</Text>
          <Muted style={{ marginTop: 4, marginBottom: space.md }}>{t('level.setupCardText')}</Muted>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button testID="setup-open" compact title={t('level.setupCta')} onPress={() => router.push('/setup')} /></View>
            <View style={{ flex: 1 }}>
              <Button compact kind="secondary" title={t('phase.dismiss')}
                onPress={() => { setSetupDismissed(true); AsyncStorage.setItem('leveld.setupDismissed', '1').catch(() => undefined); }} />
            </View>
          </View>
        </Card>
      )}

      {isToday && data.profile.startPreference === 'existing_plan' && data.trainingPlans.length === 0 && store.repoKind === 'supabase' && (
        <Card testID="plan-card" style={{ marginTop: space.md }}>
          <Text style={font.h3}>{t('plans.cardTitle')}</Text>
          <Muted style={{ marginTop: 4, marginBottom: space.md }}>{t('plans.cardText')}</Muted>
          <Button compact kind="secondary" icon="document-attach-outline" title={t('plans.title')} onPress={() => router.push('/plans')} />
        </Card>
      )}

      {cycle && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
          <Badge tone="accent" label={t('cycles.current', { phase: t(`cycles.phases.${cycle.phase}`) })} />
          <Muted>{t('cycles.until', { date: formatDate(cycle.endDate) })}</Muted>
        </View>
      )}
      {restDay && <Muted style={{ marginTop: space.sm, color: colors.success }}>{t('readiness.restDay')}</Muted>}

      {features.checkin && isToday && (
        <CheckinCard day={day} assessment={assessment} hasCheckin={!!checkin} openTraining={openTraining} />
      )}

      {deload && (
        <Card testID="deload-hint" style={{ marginTop: space.md }}>
          <Text style={font.h3}>{t('cycles.deloadTitle')}</Text>
          <Muted style={{ marginTop: 4, marginBottom: space.md }}>{t('cycles.deloadText', { n: deload.exhaustedDays, days: deload.windowDays })}</Muted>
          <Button compact kind="secondary" title={t('cycles.deloadCta')} onPress={() => router.push({ pathname: '/cycles', params: { deload: '1' } })} />
        </Card>
      )}

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

      {(todoItems.length > 0 || isToday) && (
        <SectionTitle right={isToday ? (
          <Pressable testID="todo-goto" onPress={() => router.push('/habits')}><Text style={{ color: colors.accent }}>+ {t('todos.add')}</Text></Pressable>
        ) : undefined}>{t('todos.title')}</SectionTitle>
      )}
      {todoItems.map((x) => <TodoRow key={x.todo.id} todo={x.todo} overdue={x.overdue} />)}
      {isToday && todoItems.length === 0 && <Muted>{t('todos.empty')}</Muted>}
    </Screen>
  );
}

function HabitRow({ item, day, onToggle }: { item: TodayItem; day: string; onToggle: () => void }) {
  const { t } = useTranslation();
  const { habit, entry } = item;
  const done = !!entry && FULFILLED.includes(entry.status);
  const subtitle: string[] = [];
  if (habit.kind !== 'habit') subtitle.push(t(`kind.${habit.kind}`));
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
      <CheckButton
        testID={`check-${habit.name}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }} aria-checked={done}
        accessibilityLabel={done ? t('today.uncheckA11y', { name: habit.name }) : t('today.checkA11y', { name: habit.name })}
        onPress={onToggle}
        done={done}
      />
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

/** Check circle with a subtle confirmation pulse. */
function CheckButton({ done, onPress, testID, accessibilityLabel }: {
  done: boolean; onPress: () => void; testID: string; accessibilityRole?: string; accessibilityState?: object; accessibilityLabel: string;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const press = () => {
    if (!done) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 110, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
    onPress();
  };
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked: done }} aria-checked={done} accessibilityLabel={accessibilityLabel} onPress={press} hitSlop={8}>
      <Animated.View style={[st.check, done && { backgroundColor: colors.success, borderColor: colors.success }, { transform: [{ scale }] }]}>
        {done && <Ionicons name="checkmark" size={20} color={colors.onAccent} />}
      </Animated.View>
    </Pressable>
  );
}

const QUICK: Readiness[] = ['fit', 'tired', 'exhausted', 'sick'];

/** Short check-in before planned training + adapted options for each open training. */
function CheckinCard({ day, assessment, hasCheckin, openTraining }: { day: string; assessment: Assessment | null; hasCheckin: boolean; openTraining: TodayItem[] }) {
  const { t } = useTranslation();
  const store = useStore();
  const [busy, setBusy] = useState(false);

  const quick = async (r: Readiness) => {
    setBusy(true);
    await store.saveCheckin({ localDate: day, readiness: r, sleepHours: null, sleepQuality: null, stress: null, soreness: null, symptoms: [], redFlags: [], note: '' });
    setBusy(false);
  };
  const choose = async (item: TodayItem, o: TrainingOption) => {
    if (o === 'as_planned') return store.toggleDone(item.habit.id, day);
    setBusy(true);
    const st = statusForOption(o);
    await store.setEntry({ habitId: item.habit.id, localDate: day, status: st, postponedTo: st === 'postponed' ? addDays(day, 1) : null });
    setBusy(false);
  };

  return (
    <Card testID="checkin-card" style={{ marginTop: space.md }}>
      {!hasCheckin ? (
        <>
          <Text style={font.h3}>{t('checkin.title')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {QUICK.map((r) => (
              <Pressable key={r} testID={`quick-${r}`} disabled={busy} onPress={() => quick(r)}
                style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }}>
                <Text style={{ color: colors.text, fontWeight: '500' }}>{t(`checkin.readiness.${r}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => router.push({ pathname: '/checkin', params: { date: day } })} style={{ marginTop: space.md }}>
            <Text style={{ color: colors.accent }}>+ {t('checkin.more')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ReadinessAdvice assessment={assessment} />
          {assessment && assessment.state !== 'A' && openTraining.map((item) => (
            <View key={item.habit.id} style={{ marginTop: space.lg }}>
              <Text style={[font.body, { fontWeight: '600' }]}>{item.habit.name}</Text>
              <TrainingOptions assessment={assessment} busy={busy} onChoose={(o) => choose(item, o)} />
            </View>
          ))}
          <Pressable testID="checkin-edit" onPress={() => router.push({ pathname: '/checkin', params: { date: day } })} style={{ marginTop: space.md }}>
            <Text style={{ color: colors.accent }}>{t('checkin.edit')}</Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}
