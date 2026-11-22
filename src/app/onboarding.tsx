import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { normalizeTime } from '../domain/dates';
import { GUIDED_START_LIMIT } from '../domain/phases';
import { LEVEL_DEFAULTS, setupPatch, type SetupAnswers } from '../domain/training';
import { DEFAULT_PROFILE, type Mode, type ReminderAnchor } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Button, Card, Chip, Field, Muted, Screen } from '../ui/components';
import { ACTIVITY_PRESETS, habitFromName } from '../ui/presets';
import {
  LevelStep, RhythmStep, StartStep, StyleStep, TrainingDetailsStep, TrainingGoalsStep, type RhythmValue, type TrainingDetails,
} from '../ui/profileSteps';
import { colors, font, space } from '../ui/theme';

type Step = 'welcome' | 'name' | 'level' | 'goals' | 'start' | 'details' | 'activities' | 'rhythm' | 'reminder' | 'mode';
const REMINDER_TIMES = ['07:00', '12:00', '18:00', '20:00'];
const RELATIVE: { anchor: ReminderAnchor; offset: number }[] = [
  { anchor: 'wake', offset: 15 }, { anchor: 'first_meal', offset: 0 }, { anchor: 'work_end', offset: 15 }, { anchor: 'bedtime', offset: -30 },
];
/** Steps whose answers are optional – they offer "Überspringen". */
const SKIPPABLE: Step[] = ['name', 'level', 'goals', 'start', 'details', 'activities', 'rhythm', 'reminder'];

interface Pick { name: string; preset: string | null }
type Reminder = { kind: 'none' } | { kind: 'fixed'; time: string } | { kind: 'relative'; anchor: ReminderAnchor; offset: number };

export default function Onboarding() {
  const { t } = useTranslation();
  const store = useStore();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [level, setLevel] = useState<SetupAnswers['level']>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [start, setStart] = useState<SetupAnswers['start']>(null);
  const [details, setDetails] = useState<TrainingDetails>({ days: [], settings: [], limitations: '', checkin: false });
  const [picks, setPicks] = useState<Pick[]>([]);
  const [customActivity, setCustomActivity] = useState('');
  const [rhythm, setRhythm] = useState<RhythmValue>({ rhythm: 'standard', anchors: DEFAULT_PROFILE.anchors, dayStartHour: DEFAULT_PROFILE.dayStartHour });
  const [reminder, setReminder] = useState<Reminder>({ kind: 'none' });
  const [customTime, setCustomTime] = useState('');
  const [mode, setMode] = useState<Mode>('guided');
  const [style, setStyle] = useState<SetupAnswers['style']>('supportive');
  const [busy, setBusy] = useState(false);

  // detail questions only when training is part of the plan
  const steps: Step[] = ['welcome', 'name', 'level', 'goals', 'start', ...(start && start !== 'habits_only' ? ['details' as const] : []),
    'activities', 'rhythm', 'reminder', 'mode'];
  const idx = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(steps.length - 1, idx + 1)]);
  const back = () => setStep(steps[Math.max(0, idx - 1)]);
  const startLimit = level ? LEVEL_DEFAULTS[level].startLimit : GUIDED_START_LIMIT;
  // a training habit is created when training is planned but none was picked
  const addTraining = (start === 'existing_plan' || start === 'generate_plan')
    && !picks.some((p) => ACTIVITY_PRESETS.find((x) => x.key === p.preset)?.kind === 'training');
  const totalHabits = picks.length + (addTraining ? 1 : 0);
  const toggle = <T,>(list: T[], item: T, eq: (a: T, b: T) => boolean) =>
    list.some((x) => eq(x, item)) ? list.filter((x) => !eq(x, item)) : [...list, item];

  async function finish() {
    setBusy(true);
    const answers: SetupAnswers = {
      level, goals, start, days: details.days, settings: details.settings, limitations: details.limitations,
      checkin: details.checkin && !!start && start !== 'habits_only', style, rhythm: rhythm.rhythm, anchors: rhythm.anchors, dayStartHour: rhythm.dayStartHour,
    };
    const patch = setupPatch(store.data.profile, answers, new Date().toISOString());
    const all: Pick[] = addTraining ? [{ name: t('kind.training'), preset: null }, ...picks] : picks;
    const active = mode === 'guided' ? all.slice(0, startLimit) : all;
    const later = mode === 'guided' ? all.slice(startLimit).map((p) => p.name) : [];
    const profilePatch = {
      ...patch, displayName: name.trim(), habitBacklog: later, mode,
      defaultReminderTime: reminder.kind === 'fixed' ? reminder.time : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
    };
    // 1) save the profile first: if this fails, nothing else has been created yet
    if (!(await store.saveProfile({ ...profilePatch, onboardingCompleted: false }))) { setBusy(false); return; }
    // 2) create habits – skipping any that already exist (e.g. from an interrupted earlier attempt)
    const existing = new Set(store.data.habits.map((h) => h.name.trim().toLowerCase()));
    for (const [i, p] of active.entries()) {
      if (existing.has(p.name.trim().toLowerCase())) continue;
      const isGeneratedTraining = addTraining && i === 0;
      const h = habitFromName(p.name, p.preset, {
        startDate: store.today, sortOrder: i, level, features: patch.features, trainingDays: details.days,
        kind: isGeneratedTraining ? 'training' : undefined,
        reminderTime: reminder.kind === 'fixed' ? reminder.time : null,
        reminderAnchor: reminder.kind === 'relative' ? reminder.anchor : null,
        reminderOffsetMin: reminder.kind === 'relative' ? reminder.offset : 0,
      });
      const id = await store.createHabit(h.input, h.fields);
      if (!id) { setBusy(false); return; }
      existing.add(p.name.trim().toLowerCase());
    }
    // 3) only now mark the onboarding as completed
    const ok = await store.saveProfile({ onboardingCompleted: true });
    if (!ok) setBusy(false);
  }

  return (
    <Screen>
      {idx > 0 && (
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: space.xl }}>
          {steps.slice(1).map((s, i) => (
            <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < idx ? colors.accent : colors.surfaceRaised }} />
          ))}
        </View>
      )}

      {step === 'welcome' && (
        <View style={{ marginTop: space.xxl * 2 }}>
          <Text style={[font.h1, { fontSize: 40, letterSpacing: 6 }]}>LEVELD</Text>
          <Text style={[font.h2, { color: colors.accent, marginTop: space.sm }]}>{t('app.claim')}</Text>
          <Text style={[font.body, { color: colors.textMuted, marginTop: space.xl, marginBottom: space.xxl }]}>{t('onboarding.welcomeText')}</Text>
          <Button testID="ob-start" title={t('onboarding.start')} onPress={next} />
        </View>
      )}

      {step === 'name' && (
        <>
          <Text style={[font.h1, { marginBottom: space.xl }]}>{t('onboarding.nameTitle')}</Text>
          <Field testID="ob-name" value={name} onChangeText={setName} placeholder={t('onboarding.namePlaceholder')} autoFocus maxLength={80} onSubmitEditing={next} />
        </>
      )}

      {step === 'level' && <LevelStep value={level} onChange={setLevel} />}
      {step === 'goals' && <TrainingGoalsStep value={goals} onChange={setGoals} />}
      {step === 'start' && <StartStep value={start} onChange={setStart} />}
      {step === 'details' && <TrainingDetailsStep value={details} onChange={setDetails} />}

      {step === 'activities' && (
        <>
          <Text style={[font.h1, { marginBottom: space.sm }]}>{t('onboarding.activitiesTitle')}</Text>
          <Muted style={{ marginBottom: space.lg }}>{t('onboarding.activitiesHint')}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {ACTIVITY_PRESETS.map((p) => {
              const label = t(`onboarding.activities.${p.key}`);
              return (
                <Chip key={p.key} testID={`ob-act-${p.key}`} label={label} selected={picks.some((x) => x.preset === p.key)}
                  onPress={() => setPicks(toggle(picks, { name: label, preset: p.key }, (a, b) => a.preset === b.preset && a.name === b.name))} />
              );
            })}
            {picks.filter((p) => !p.preset).map((p) => (
              <Chip key={p.name} label={p.name} selected onPress={() => setPicks(picks.filter((x) => x !== p))} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Field testID="ob-custom-activity" value={customActivity} onChangeText={setCustomActivity} placeholder={t('onboarding.customActivity')} maxLength={80}
                onSubmitEditing={() => { const n = customActivity.trim(); if (n && !picks.some((p) => p.name === n)) setPicks([...picks, { name: n, preset: null }]); setCustomActivity(''); }} />
            </View>
            <Button testID="ob-custom-activity-add" kind="secondary" title={t('common.add')} disabled={!customActivity.trim()}
              onPress={() => { const n = customActivity.trim(); if (n && !picks.some((p) => p.name === n)) setPicks([...picks, { name: n, preset: null }]); setCustomActivity(''); }} />
          </View>
        </>
      )}

      {step === 'rhythm' && <RhythmStep value={rhythm} onChange={setRhythm} />}

      {step === 'reminder' && (
        <>
          <Text style={[font.h1, { marginBottom: space.sm }]}>{t('onboarding.reminderTitle')}</Text>
          <Muted style={{ marginBottom: space.lg }}>{t('onboarding.reminderHint')}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label={t('onboarding.noReminder')} selected={reminder.kind === 'none'} onPress={() => setReminder({ kind: 'none' })} />
            {RELATIVE.filter((r) => r.anchor !== 'work_end' || rhythm.anchors.workEnd).map((r) => (
              <Chip key={r.anchor} testID={`ob-rem-${r.anchor}`} label={t(`reminderMode.${r.anchor}`)}
                selected={reminder.kind === 'relative' && reminder.anchor === r.anchor} onPress={() => setReminder({ kind: 'relative', ...r })} />
            ))}
            {REMINDER_TIMES.map((o) => (
              <Chip key={o} label={o} selected={reminder.kind === 'fixed' && reminder.time === o} onPress={() => setReminder({ kind: 'fixed', time: o })} />
            ))}
          </View>
          <Field label={t('habit.reminderTime')} value={customTime} placeholder="HH:MM"
            onChangeText={(v) => { setCustomTime(v); const n = normalizeTime(v); if (n) setReminder({ kind: 'fixed', time: n }); }}
            error={customTime && !normalizeTime(customTime) ? t('errors.invalid_time') : null} />
        </>
      )}

      {step === 'mode' && (
        <>
          <Text style={[font.h1, { marginBottom: space.xl }]}>{t('onboarding.modeTitle')}</Text>
          {(['guided', 'custom'] as Mode[]).map((m) => (
            <Card key={m} testID={`ob-mode-${m}`} onPress={() => setMode(m)}
              style={{ marginBottom: space.md, borderColor: mode === m ? colors.accent : colors.border, borderWidth: 1 }}>
              <Text style={font.h3}>{t(`onboarding.${m}Title`)}</Text>
              <Muted style={{ marginTop: 4 }}>{t(`onboarding.${m}Text`, { n: startLimit })}</Muted>
            </Card>
          ))}
          {mode === 'guided' && totalHabits > startLimit && (
            <Muted style={{ color: colors.warning, marginBottom: space.md }}>{t('onboarding.guidedLimit', { n: startLimit })}</Muted>
          )}
          <View style={{ marginTop: space.md }}><StyleStep value={style} onChange={setStyle} /></View>
          <Muted style={{ marginVertical: space.lg }}>{t('onboarding.switchLater')}</Muted>
          <Button testID="ob-finish" title={t('onboarding.finish')} onPress={finish} loading={busy} />
        </>
      )}

      {idx > 0 && step !== 'mode' && (
        <>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xl }}>
            <View style={{ flex: 1 }}><Button kind="secondary" title={t('common.back')} onPress={back} /></View>
            <View style={{ flex: 1 }}><Button testID="ob-next" title={t('common.next')} onPress={next} /></View>
          </View>
          {SKIPPABLE.includes(step) && (
            <Pressable testID="ob-skip" onPress={next} style={{ alignItems: 'center', marginTop: space.lg }}>
              <Text style={{ color: colors.textMuted }}>{t('level.skip')}</Text>
            </Pressable>
          )}
        </>
      )}
      {step === 'mode' && (
        <Pressable onPress={back} style={{ alignItems: 'center', marginTop: space.lg }}>
          <Text style={{ color: colors.textMuted }}>{t('common.back')}</Text>
        </Pressable>
      )}
    </Screen>
  );
}
