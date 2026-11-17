import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { normalizeTime } from '../domain/dates';
import { GUIDED_START_LIMIT } from '../domain/phases';
import type { Mode } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Button, Card, Chip, Field, Muted, Screen } from '../ui/components';
import { ACTIVITY_PRESETS, GOAL_KEYS, habitFromName } from '../ui/presets';
import { colors, font, space } from '../ui/theme';

const STEPS = ['welcome', 'name', 'goals', 'activities', 'reminder', 'mode'] as const;
const REMINDER_OPTIONS = ['07:00', '08:00', '12:00', '18:00', '20:00', '21:30'];

interface Pick { name: string; preset: string | null }

export default function Onboarding() {
  const { t } = useTranslation();
  const store = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [customActivity, setCustomActivity] = useState('');
  const [reminder, setReminder] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [mode, setMode] = useState<Mode>('guided');
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];
  const toggle = <T,>(list: T[], item: T, eq: (a: T, b: T) => boolean) =>
    list.some((x) => eq(x, item)) ? list.filter((x) => !eq(x, item)) : [...list, item];

  async function finish() {
    setBusy(true);
    const active = mode === 'guided' ? picks.slice(0, GUIDED_START_LIMIT) : picks;
    const later = mode === 'guided' ? picks.slice(GUIDED_START_LIMIT).map((p) => p.name) : [];
    for (const [i, p] of active.entries()) {
      const h = habitFromName(p.name, p.preset, { startDate: store.today, reminderTime: reminder, sortOrder: i });
      const id = await store.createHabit(h.input, h.fields);
      if (!id) { setBusy(false); return; }
    }
    const ok = await store.saveProfile({
      displayName: name.trim(), goals, habitBacklog: later, mode, defaultReminderTime: reminder,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin', onboardingCompleted: true,
    });
    if (!ok) setBusy(false);
  }

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  return (
    <Screen>
      {step > 0 && (
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: space.xl }}>
          {STEPS.slice(1).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < step ? colors.accent : colors.surfaceRaised }} />
          ))}
        </View>
      )}

      {current === 'welcome' && (
        <View style={{ marginTop: space.xxl * 2 }}>
          <Text style={[font.h1, { fontSize: 40, letterSpacing: 6 }]}>LEVELD</Text>
          <Text style={[font.h2, { color: colors.accent, marginTop: space.sm }]}>{t('app.claim')}</Text>
          <Text style={[font.body, { color: colors.textMuted, marginTop: space.xl, marginBottom: space.xxl }]}>{t('onboarding.welcomeText')}</Text>
          <Button testID="ob-start" title={t('onboarding.start')} onPress={next} />
        </View>
      )}

      {current === 'name' && (
        <>
          <Text style={[font.h1, { marginBottom: space.xl }]}>{t('onboarding.nameTitle')}</Text>
          <Field testID="ob-name" value={name} onChangeText={setName} placeholder={t('onboarding.namePlaceholder')} autoFocus maxLength={80} onSubmitEditing={next} />
        </>
      )}

      {current === 'goals' && (
        <>
          <Text style={[font.h1, { marginBottom: space.sm }]}>{t('onboarding.goalsTitle')}</Text>
          <Muted style={{ marginBottom: space.lg }}>{t('onboarding.goalsHint')}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[...GOAL_KEYS.map((k) => t(`onboarding.goals.${k}`)), ...goals.filter((g) => !GOAL_KEYS.some((k) => t(`onboarding.goals.${k}`) === g))].map((g) => (
              <Chip key={g} label={g} selected={goals.includes(g)} onPress={() => setGoals(toggle(goals, g, (a, b) => a === b))} />
            ))}
          </View>
          <AddRow value={customGoal} onChange={setCustomGoal} placeholder={t('onboarding.customGoal')}
            onAdd={() => { const g = customGoal.trim(); if (g && !goals.includes(g)) setGoals([...goals, g]); setCustomGoal(''); }} />
        </>
      )}

      {current === 'activities' && (
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
          <AddRow testID="ob-custom-activity" value={customActivity} onChange={setCustomActivity} placeholder={t('onboarding.customActivity')}
            onAdd={() => { const n = customActivity.trim(); if (n && !picks.some((p) => p.name === n)) setPicks([...picks, { name: n, preset: null }]); setCustomActivity(''); }} />
        </>
      )}

      {current === 'reminder' && (
        <>
          <Text style={[font.h1, { marginBottom: space.sm }]}>{t('onboarding.reminderTitle')}</Text>
          <Muted style={{ marginBottom: space.lg }}>{t('onboarding.reminderHint')}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label={t('onboarding.noReminder')} selected={reminder === null} onPress={() => setReminder(null)} />
            {REMINDER_OPTIONS.map((o) => <Chip key={o} label={o} selected={reminder === o} onPress={() => setReminder(o)} />)}
          </View>
          <Field label={t('habit.reminderTime')} value={customTime} onChangeText={(v) => { setCustomTime(v); const n = normalizeTime(v); if (n) setReminder(n); }}
            placeholder="HH:MM" error={customTime && !normalizeTime(customTime) ? t('errors.invalid_time') : null} />
        </>
      )}

      {current === 'mode' && (
        <>
          <Text style={[font.h1, { marginBottom: space.xl }]}>{t('onboarding.modeTitle')}</Text>
          {(['guided', 'custom'] as Mode[]).map((m) => (
            <Card key={m} testID={`ob-mode-${m}`} onPress={() => setMode(m)}
              style={{ marginBottom: space.md, borderColor: mode === m ? colors.accent : colors.border, borderWidth: 1 }}>
              <Text style={font.h3}>{t(`onboarding.${m}Title`)}</Text>
              <Muted style={{ marginTop: 4 }}>{t(`onboarding.${m}Text`)}</Muted>
            </Card>
          ))}
          {mode === 'guided' && picks.length > GUIDED_START_LIMIT && (
            <Muted style={{ color: colors.warning, marginBottom: space.md }}>{t('onboarding.guidedLimit', { n: GUIDED_START_LIMIT })}</Muted>
          )}
          <Muted style={{ marginBottom: space.xl }}>{t('onboarding.switchLater')}</Muted>
          <Button testID="ob-finish" title={t('onboarding.finish')} onPress={finish} loading={busy} />
        </>
      )}

      {step > 0 && current !== 'mode' && (
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xl }}>
          <View style={{ flex: 1 }}><Button kind="secondary" title={t('common.back')} onPress={() => setStep(step - 1)} /></View>
          <View style={{ flex: 1 }}><Button testID="ob-next" title={t('common.next')} onPress={next} /></View>
        </View>
      )}
      {current === 'mode' && (
        <Pressable onPress={() => setStep(step - 1)} style={{ alignItems: 'center', marginTop: space.lg }}>
          <Text style={{ color: colors.textMuted }}>{t('common.back')}</Text>
        </Pressable>
      )}
    </Screen>
  );
}

function AddRow({ value, onChange, onAdd, placeholder, testID }: { value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string; testID?: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
      <View style={{ flex: 1 }}>
        <Field testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} onSubmitEditing={onAdd} maxLength={80} />
      </View>
      <View><Button testID={testID ? `${testID}-add` : undefined} kind="secondary" title={t('common.add')} onPress={onAdd} disabled={!value.trim()} /></View>
    </View>
  );
}
