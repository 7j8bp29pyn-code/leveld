import React, { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { normalizeTime } from '../domain/dates';
import { RHYTHM_PRESETS } from '../domain/rhythm';
import type { CommunicationStyle, DayAnchors, DayRhythm, StartPreference, TrainingLevel, Weekday } from '../domain/types';
import { Badge, Card, Chip, Field, Muted } from './components';
import { colors, font, space } from './theme';

/**
 * Building blocks shared by the onboarding and the later "quick setup" for existing users,
 * so there is exactly one implementation of each question.
 */

export const LEVELS: TrainingLevel[] = ['beginner', 'occasional', 'regular', 'structured'];
export const TRAINING_GOALS = ['habits', 'muscle', 'fatloss', 'strength', 'fitness', 'endurance', 'mobility', 'sleep', 'stress'] as const;
export const STARTS: StartPreference[] = ['existing_plan', 'generate_plan', 'habits_only'];
export const SETTINGS = ['gym', 'home', 'outdoor', 'club'] as const;
export const RHYTHMS: DayRhythm[] = ['standard', 'early', 'late', 'night', 'rotating', 'custom'];
export const STYLES: CommunicationStyle[] = ['supportive', 'humorous', 'factual', 'gym'];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function OptionCard({ title, text, selected, onPress, testID }: { title: string; text?: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Card testID={testID} onPress={onPress} style={{ marginBottom: space.sm, borderWidth: 1, borderColor: selected ? colors.accent : colors.border }}>
      <Text style={[font.h3, selected && { color: colors.accent }]}>{title}</Text>
      {text ? <Muted style={{ marginTop: 2 }}>{text}</Muted> : null}
    </Card>
  );
}

export function LevelStep({ value, onChange }: { value: TrainingLevel | null; onChange: (v: TrainingLevel) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={[font.h1, { marginBottom: space.sm }]}>{t('level.title')}</Text>
      <Muted style={{ marginBottom: space.lg }}>{t('level.hint')}</Muted>
      {LEVELS.map((l) => (
        <OptionCard key={l} testID={`level-${l}`} title={t(`level.${l}`)} text={t(`level.${l}Text`)} selected={value === l} onPress={() => onChange(l)} />
      ))}
    </>
  );
}

export function TrainingGoalsStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState('');
  const labels = TRAINING_GOALS.map((g) => t(`level.goals.${g}`));
  const toggle = (g: string) => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g]);
  return (
    <>
      <Text style={[font.h1, { marginBottom: space.sm }]}>{t('level.goalsTitle')}</Text>
      <Muted style={{ marginBottom: space.lg }}>{t('level.goalsHint')}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[...labels, ...value.filter((g) => !labels.includes(g))].map((g) => (
          <Chip key={g} testID={`goal-${g}`} label={g} selected={value.includes(g)} onPress={() => toggle(g)} />
        ))}
      </View>
      <Field value={custom} onChangeText={setCustom} placeholder={t('level.customGoal')} maxLength={80}
        onSubmitEditing={() => { const g = custom.trim(); if (g && !value.includes(g)) onChange([...value, g]); setCustom(''); }} />
    </>
  );
}

export function StartStep({ value, onChange }: { value: StartPreference | null; onChange: (v: StartPreference) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={[font.h1, { marginBottom: space.lg }]}>{t('level.startTitle')}</Text>
      {STARTS.map((s) => (
        <OptionCard key={s} testID={`start-${s}`} title={t(`level.${s}`)} text={t(`level.${s}Text`)} selected={value === s} onPress={() => onChange(s)} />
      ))}
    </>
  );
}

export interface TrainingDetails {
  days: Weekday[];
  settings: string[];
  limitations: string;
  checkin: boolean;
}

export function TrainingDetailsStep({ value, onChange }: { value: TrainingDetails; onChange: (v: TrainingDetails) => void }) {
  const { t } = useTranslation();
  const set = (p: Partial<TrainingDetails>) => onChange({ ...value, ...p });
  return (
    <>
      <Text style={[font.h1, { marginBottom: space.sm }]}>{t('level.detailsTitle')}</Text>
      <Muted style={{ marginBottom: space.lg }}>{t('level.detailsHint')}</Muted>
      <Text style={[font.label, { marginBottom: 6 }]}>{t('level.days')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {WEEKDAYS.map((d) => (
          <Chip key={d} testID={`tday-${d}`} label={t(`weekdaysShort.${d}`)} selected={value.days.includes(d)}
            onPress={() => set({ days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort() })} />
        ))}
      </View>
      <Text style={[font.label, { marginBottom: 6, marginTop: space.sm }]}>{t('level.settings')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {SETTINGS.map((s) => (
          <Chip key={s} label={t(`level.settingOptions.${s}`)} selected={value.settings.includes(s)}
            onPress={() => set({ settings: value.settings.includes(s) ? value.settings.filter((x) => x !== s) : [...value.settings, s] })} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, marginBottom: 6 }}>
        <Text style={font.label}>{t('level.limitations')}</Text>
        <Badge tone="warning" label={t('level.sensitive')} />
      </View>
      <Field value={value.limitations} onChangeText={(v) => set({ limitations: v })} placeholder={t('level.limitationsPlaceholder')}
        hint={t('level.limitationsHint')} maxLength={1000} multiline />
      <CheckinConsent value={value.checkin} onChange={(v) => set({ checkin: v })} />
    </>
  );
}

/** Opt-in for the health check-in with explicit consent text (Art. 9 GDPR – to be reviewed legally). */
export function CheckinConsent({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Card style={{ marginTop: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <Text style={[font.h3, { flex: 1 }]}>{t('level.checkinTitle')}</Text>
        <Badge tone="warning" label={t('level.sensitive')} />
      </View>
      <Muted style={{ marginBottom: space.md }}>{t('level.checkinText')}</Muted>
      <Pressable testID="checkin-consent" accessibilityRole="switch" accessibilityState={{ checked: value }} aria-checked={value} onPress={() => onChange(!value)}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} />
        <Muted style={{ flex: 1 }}>{t('level.consent')}</Muted>
      </Pressable>
    </Card>
  );
}

export interface RhythmValue {
  rhythm: DayRhythm;
  anchors: DayAnchors;
  dayStartHour: number;
}

export function RhythmStep({ value, onChange, compact }: { value: RhythmValue; onChange: (v: RhythmValue) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const pick = (r: DayRhythm) => {
    const preset = r in RHYTHM_PRESETS ? RHYTHM_PRESETS[r as keyof typeof RHYTHM_PRESETS] : null;
    setTexts({});
    onChange(preset ? { rhythm: r, anchors: { ...preset.anchors }, dayStartHour: preset.dayStartHour } : { ...value, rhythm: r });
  };
  const anchorKeys: (keyof DayAnchors)[] = ['wake', 'firstMeal', 'workEnd', 'bedtime'];
  return (
    <>
      {!compact && <Text style={[font.h1, { marginBottom: space.sm }]}>{t('rhythm.title')}</Text>}
      <Muted style={{ marginBottom: space.lg }}>{t('rhythm.hint')}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {RHYTHMS.map((r) => <Chip key={r} testID={`rhythm-${r}`} label={t(`rhythm.${r}`)} selected={value.rhythm === r} onPress={() => pick(r)} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
        {anchorKeys.map((k) => {
          const shown = texts[k] ?? value.anchors[k] ?? '';
          const invalid = !!shown && !normalizeTime(shown);
          return (
            <View key={k} style={{ width: '47%' }}>
              <Field testID={`anchor-${k}`} label={t(`rhythm.${k}`)} value={shown} placeholder={k === 'workEnd' ? t('rhythm.noWork') : 'HH:MM'}
                error={invalid ? t('errors.invalid_time') : null}
                onChangeText={(v) => {
                  setTexts({ ...texts, [k]: v });
                  const n = normalizeTime(v);
                  if (n || (k === 'workEnd' && !v.trim())) onChange({ ...value, anchors: { ...value.anchors, [k]: n ?? null } });
                }} />
            </View>
          );
        })}
      </View>
      <Text style={[font.label, { marginBottom: 6 }]}>{t('rhythm.dayStart')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[0, 2, 3, 4, 6, 12, 14].map((h) => (
          <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} selected={value.dayStartHour === h} onPress={() => onChange({ ...value, dayStartHour: h })} />
        ))}
      </View>
      <Muted>{t('rhythm.dayStartHint')}</Muted>
    </>
  );
}

export function StyleStep({ value, onChange }: { value: CommunicationStyle; onChange: (v: CommunicationStyle) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={[font.h3, { marginBottom: space.sm }]}>{t('style.title')}</Text>
      {STYLES.map((s) => (
        <OptionCard key={s} testID={`style-${s}`} title={t(`style.${s}`)} text={t(`motivation.${s}.done.1`, { name: t('kind.training') })} selected={value === s} onPress={() => onChange(s)} />
      ))}
    </>
  );
}
