import { router, Stack } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setupPatch, type SetupAnswers } from '../domain/training';
import type { HabitKind } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Button, Chip, Muted, Screen } from '../ui/components';
import { LevelStep, RhythmStep, StartStep, StyleStep, TrainingDetailsStep, TrainingGoalsStep, type RhythmValue, type TrainingDetails } from '../ui/profileSteps';
import { colors, font, space } from '../ui/theme';

type Step = 'level' | 'goals' | 'start' | 'details' | 'mark' | 'rhythm' | 'style';

/**
 * Quick setup for users who registered before the update (and to change answers later).
 * Existing habits, entries and settings are kept – only the new information is added.
 */
export default function Setup() {
  const { t } = useTranslation();
  const store = useStore();
  const p = store.data.profile;
  const habits = store.data.habits.filter((h) => h.status !== 'archived');
  const [step, setStep] = useState<Step>('level');
  const [level, setLevel] = useState(p.trainingLevel);
  const [goals, setGoals] = useState<string[]>(p.trainingGoals);
  const [start, setStart] = useState(p.startPreference);
  const [details, setDetails] = useState<TrainingDetails>({
    days: p.trainingDays, settings: p.trainingSettings, limitations: p.trainingLimitations, checkin: p.features.checkin,
  });
  const [kinds, setKinds] = useState<Record<string, HabitKind>>(() => Object.fromEntries(habits.map((h) => [h.id, h.kind])));
  const [rhythm, setRhythm] = useState<RhythmValue>({ rhythm: p.dayRhythm, anchors: p.anchors, dayStartHour: p.dayStartHour });
  const [style, setStyle] = useState(p.communicationStyle);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = ['level', 'goals', 'start', ...(start !== 'habits_only' ? ['details' as const] : []),
    ...(habits.length ? ['mark' as const] : []), 'rhythm', 'style'];
  const idx = steps.indexOf(step);
  const last = idx === steps.length - 1;

  async function save() {
    setBusy(true);
    const answers: SetupAnswers = {
      level, goals, start, days: details.days, settings: details.settings, limitations: details.limitations,
      checkin: details.checkin && start !== 'habits_only', style, rhythm: rhythm.rhythm, anchors: rhythm.anchors, dayStartHour: rhythm.dayStartHour,
    };
    let ok = await store.saveProfile(setupPatch(p, answers, new Date().toISOString()));
    for (const h of habits) {
      if (ok && kinds[h.id] !== h.kind) ok = await store.updateHabit(h.id, { kind: kinds[h.id] });
    }
    setBusy(false);
    if (ok) router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('level.setupTitle') }} />
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: space.xl }}>
        {steps.map((s, i) => <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= idx ? colors.accent : colors.surfaceRaised }} />)}
      </View>

      {step === 'level' && <LevelStep value={level} onChange={setLevel} />}
      {step === 'goals' && <TrainingGoalsStep value={goals} onChange={setGoals} />}
      {step === 'start' && <StartStep value={start} onChange={setStart} />}
      {step === 'details' && <TrainingDetailsStep value={details} onChange={setDetails} />}
      {step === 'mark' && (
        <>
          <Text style={[font.h1, { marginBottom: space.sm }]}>{t('level.markTraining')}</Text>
          <Muted style={{ marginBottom: space.lg }}>{t('level.markTrainingHint')}</Muted>
          {habits.map((h) => (
            <View key={h.id} style={{ marginBottom: space.md }}>
              <Text style={[font.body, { fontWeight: '600', marginBottom: 6 }]}>{h.name}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {(['habit', 'training', 'recovery'] as HabitKind[]).map((k) => (
                  <Chip key={k} testID={`mark-${h.name}-${k}`} label={t(`kind.${k}`)} selected={kinds[h.id] === k} onPress={() => setKinds({ ...kinds, [h.id]: k })} />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
      {step === 'rhythm' && <RhythmStep value={rhythm} onChange={setRhythm} />}
      {step === 'style' && <StyleStep value={style} onChange={setStyle} />}

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xl }}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" title={t('common.back')} onPress={() => (idx === 0 ? router.back() : setStep(steps[idx - 1]))} />
        </View>
        <View style={{ flex: 1 }}>
          {last
            ? <Button testID="setup-save" title={t('common.save')} onPress={save} loading={busy} />
            : <Button testID="setup-next" title={t('common.next')} onPress={() => setStep(steps[idx + 1])} />}
        </View>
      </View>
      {!last && (
        <Pressable testID="setup-skip" onPress={() => setStep(steps[idx + 1])} style={{ alignItems: 'center', marginTop: space.lg }}>
          <Text style={{ color: colors.textMuted }}>{t('level.skip')}</Text>
        </Pressable>
      )}
    </Screen>
  );
}
