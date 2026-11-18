import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isLocalDate } from '../domain/dates';
import type { Readiness, RedFlag, Symptom } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Badge, Button, Card, Chip, Field, Muted, Screen, SectionTitle } from '../ui/components';
import { CheckinConsent } from '../ui/profileSteps';
import { ReadinessAdvice } from '../ui/readinessViews';
import { colors, font, space } from '../ui/theme';

const READINESS: Readiness[] = ['fit', 'tired', 'exhausted', 'sick'];
const SYMPTOMS: Symptom[] = ['sore_throat', 'fever', 'cough', 'other_symptoms', 'pain_injury'];
const RED_FLAGS: RedFlag[] = ['chest_pain', 'breathlessness', 'circulation'];

function Scale({ label, value, onChange, from, to, labels, testID }: {
  label: string; value: number | null; onChange: (v: number | null) => void; from: number; to: number; labels?: Record<number, string>; testID?: string;
}) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[font.label, { marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
          <Chip key={n} testID={testID ? `${testID}-${n}` : undefined} label={labels?.[n] ?? String(n)} selected={value === n} onPress={() => onChange(value === n ? null : n)} />
        ))}
      </View>
    </View>
  );
}

/** Short, optional daily health & recovery check-in. Only the first question is needed. */
export default function CheckinScreen() {
  const { t } = useTranslation();
  const store = useStore();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && isLocalDate(params.date) ? params.date : store.today;
  const existing = store.data.checkins.find((c) => c.localDate === date);
  const enabled = store.data.profile.features.checkin && !!store.data.profile.healthConsentAt;

  const [readiness, setReadiness] = useState<Readiness | null>(existing?.readiness ?? null);
  const [more, setMore] = useState(!!existing && (existing.symptoms.length > 0 || existing.sleepHours !== null));
  const [sleepHours, setSleepHours] = useState(existing?.sleepHours != null ? String(existing.sleepHours) : '');
  const [sleepQuality, setSleepQuality] = useState<number | null>(existing?.sleepQuality ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [symptoms, setSymptoms] = useState<Symptom[]>(existing?.symptoms ?? []);
  const [redFlags, setRedFlags] = useState<RedFlag[]>(existing?.redFlags ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!enabled) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('checkin.title') }} />
        <Muted style={{ marginBottom: space.md }}>{t('checkin.notEnabled')}</Muted>
        <CheckinConsent value={consent} onChange={setConsent} />
        <View style={{ marginTop: space.lg }}>
          <Button testID="checkin-enable" title={t('checkin.enable')} disabled={!consent}
            onPress={() => store.saveProfile({ features: { ...store.data.profile.features, checkin: true }, healthConsentAt: new Date().toISOString() })} />
        </View>
      </Screen>
    );
  }

  const hours = sleepHours.trim() ? Number(sleepHours.replace(',', '.')) : null;
  const hoursInvalid = hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24);
  const draft = readiness ? {
    id: '', createdAt: '', updatedAt: '', localDate: date, readiness, sleepHours: hoursInvalid ? null : hours, sleepQuality, stress, soreness, symptoms, redFlags, note,
  } : null;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    if (!draft || hoursInvalid) return;
    setBusy(true);
    const { id: _i, createdAt: _c, updatedAt: _u, ...input } = draft;
    const ok = await store.saveCheckin(input);
    setBusy(false);
    if (ok) router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('checkin.title') }} />
      <View style={{ marginBottom: space.md }}>
        <Badge tone="warning" label={t('level.sensitive')} />
      </View>
      {READINESS.map((r) => (
        <Card key={r} testID={`readiness-${r}`} onPress={() => setReadiness(r)}
          style={{ marginBottom: space.sm, padding: space.md, borderWidth: 1, borderColor: readiness === r ? colors.accent : colors.border }}>
          <Text style={[font.body, { fontWeight: '600' }, readiness === r && { color: colors.accent }]}>{t(`checkin.readiness.${r}`)}</Text>
        </Card>
      ))}

      <Pressable testID="checkin-more" onPress={() => setMore(!more)} style={{ marginTop: space.md }}>
        <Text style={{ color: colors.accent }}>{more ? '–' : '+'} {t('checkin.more')}</Text>
      </Pressable>
      <Muted>{t('checkin.optional')}</Muted>

      {more && (
        <>
          <SectionTitle>{t('checkin.symptoms')}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {SYMPTOMS.map((s) => <Chip key={s} testID={`symptom-${s}`} label={t(`checkin.symptomList.${s}`)} selected={symptoms.includes(s)} onPress={() => setSymptoms(toggle(symptoms, s))} />)}
          </View>
          <Text style={[font.label, { marginTop: space.sm, marginBottom: 6, color: colors.danger }]}>{t('checkin.redFlagsTitle')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {RED_FLAGS.map((s) => <Chip key={s} testID={`redflag-${s}`} label={t(`checkin.redFlagList.${s}`)} selected={redFlags.includes(s)} onPress={() => setRedFlags(toggle(redFlags, s))} />)}
          </View>
          <Field testID="sleep-hours" label={t('checkin.sleepHours')} value={sleepHours} onChangeText={setSleepHours} keyboardType="decimal-pad"
            error={hoursInvalid ? t('errors.out_of_range') : null} />
          <Scale label={t('checkin.sleepQuality')} value={sleepQuality} onChange={setSleepQuality} from={1} to={5} />
          <Scale label={t('checkin.stress')} value={stress} onChange={setStress} from={1} to={5} />
          <Scale label={t('checkin.soreness')} value={soreness} onChange={setSoreness} from={0} to={3}
            labels={{ 0: t('checkin.sorenessLevels.0'), 1: t('checkin.sorenessLevels.1'), 2: t('checkin.sorenessLevels.2'), 3: t('checkin.sorenessLevels.3') }} />
          <Field label={t('checkin.note')} value={note} onChangeText={setNote} multiline maxLength={2000} />
        </>
      )}

      {draft && <View style={{ marginTop: space.lg }}><ReadinessAdvice checkin={draft} /></View>}

      <View style={{ marginTop: space.lg }}>
        <Button testID="checkin-save" title={t('checkin.save')} onPress={save} disabled={!readiness || hoursInvalid} loading={busy} />
      </View>
      {existing && (
        <View style={{ marginTop: space.sm }}>
          <Button kind="ghost" title={t('checkin.remove')} onPress={async () => { if (await store.deleteCheckin(date)) router.back(); }} />
        </View>
      )}
      <Muted style={{ marginTop: space.lg, fontSize: 11 }}>{t('checkin.disclaimer')}</Muted>
    </Screen>
  );
}
