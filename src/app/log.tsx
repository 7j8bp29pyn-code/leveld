import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, isLocalDate, isTimeOfDay, normalizeTime } from '../domain/dates';
import { normalizeFieldValue, ValidationError } from '../domain/entries';
import { visibleFields } from '../domain/schedule';
import type { EntryStatus, FieldDefinition, FieldValue } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Button, Chip, Field, Muted, Screen, SectionTitle, Segmented } from '../ui/components';
import { formatDate, relativeDay } from '../ui/format';
import { colors, font, space } from '../ui/theme';

export default function LogScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ habitId: string; date?: string }>();
  const store = useStore();
  const date = params.date && isLocalDate(params.date) ? params.date : store.today;
  const habit = store.data.habits.find((h) => h.id === params.habitId);
  const entry = store.data.entries.find((e) => e.habitId === params.habitId && e.localDate === date) ?? null;

  const fields = habit ? visibleFields(habit, store.data.fields) : [];
  // also show previously recorded values of fields that are now hidden/archived, so they can be corrected
  const extraFields = entry && habit
    ? store.data.fields.filter((f) => f.habitId === habit.id && entry.values[f.key] !== undefined && !fields.includes(f))
    : [];
  const allFields = [...fields, ...extraFields];

  const [status, setStatus] = useState<EntryStatus>(entry?.status ?? 'done');
  const [postponeTo, setPostponeTo] = useState(entry?.postponedTo ?? addDays(date, 1));
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(Object.entries(entry?.values ?? {}).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v ?? '')])),
  );
  const [note, setNote] = useState(entry?.note ?? '');
  const [rpe, setRpe] = useState<number | null>(entry?.rpe ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!habit) {
    return <Screen><Muted>{t('common.noData')}</Muted></Screen>;
  }

  async function save() {
    const errs: Record<string, string> = {};
    const out: Record<string, FieldValue> = {};
    for (const f of allFields) {
      let raw: unknown = values[f.key];
      if (f.type === 'time' && typeof raw === 'string' && raw) raw = normalizeTime(raw) ?? raw;
      try {
        out[f.key] = normalizeFieldValue(f, raw);
      } catch (e) {
        if (e instanceof ValidationError) errs[f.key] = t(`errors.${e.message}`);
      }
    }
    if (status === 'postponed' && (!isLocalDate(postponeTo) || postponeTo <= date)) errs.postpone = t('errors.postpone_target_must_be_later');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const ok = await store.setEntry({
      habitId: habit!.id, localDate: date, status, postponedTo: status === 'postponed' ? postponeTo : null, values: out, note,
      rpe: measured ? rpe : null,
    });
    setBusy(false);
    if (ok) router.back();
  }

  async function remove() {
    setBusy(true);
    const ok = await store.clearEntry(habit!.id, date);
    setBusy(false);
    if (ok) router.back();
  }

  const measured = status === 'done' || status === 'adapted';
  const isTraining = habit.kind === 'training';
  const showRpe = isTraining && store.data.profile.features.rpe && measured;
  // recovery-aware statuses for training: adapted / recovery / health reasons
  const trainingStatuses: EntryStatus[] = isTraining ? ['adapted', 'recovery', 'health_pause'] : [];
  const statusOptions: { value: EntryStatus; label: string }[] = [
    { value: 'done', label: t('log.markDone') },
    { value: 'skipped', label: t('log.skip') },
    { value: 'paused', label: t('log.pauseDay') },
    { value: 'postponed', label: t('log.postpone') },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: habit.name }} />
      <Text style={font.h2}>{habit.name}</Text>
      <Muted>{relativeDay(date, store.today)} · {formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}</Muted>
      {entry && entry.habitNameSnapshot !== habit.name && <Muted>({entry.habitNameSnapshot})</Muted>}

      <SectionTitle>{t('log.status')}</SectionTitle>
      <Segmented testID="log-status" options={statusOptions} value={status} onChange={setStatus} />
      {trainingStatuses.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>
          {trainingStatuses.map((st) => (
            <Chip key={st} testID={`status-${st}`} label={t(`today.status.${st}`)} selected={status === st} onPress={() => setStatus(st)} />
          ))}
        </View>
      )}
      {status !== 'done' && <Muted style={{ marginTop: space.sm }}>{t('log.notFailure')}</Muted>}

      {status === 'postponed' && (
        <>
          <SectionTitle>{t('log.postponeTo')}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[1, 2, 7].map((n) => {
              const d = addDays(date, n);
              return <Chip key={n} label={relativeDay(d, store.today)} selected={postponeTo === d} onPress={() => setPostponeTo(d)} />;
            })}
          </View>
          <Field label={t('log.customDate')} value={postponeTo} onChangeText={setPostponeTo} error={errors.postpone} autoCapitalize="none" />
        </>
      )}

      {showRpe && (
        <>
          <SectionTitle>{t('log.rpe')}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <Chip key={n} testID={`rpe-${n}`} label={String(n)} selected={rpe === n} onPress={() => setRpe(rpe === n ? null : n)} />
            ))}
          </View>
          <Muted>{t('log.rpeHint')}</Muted>
        </>
      )}

      {measured && (
        <>
          <SectionTitle>{t('log.fields')}</SectionTitle>
          {allFields.length === 0 && <Muted>{t('log.noFields')}</Muted>}
          {allFields.map((f) => (
            <FieldInputRow key={f.id} def={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => setValues({ ...values, [f.key]: v })} />
          ))}
        </>
      )}

      <SectionTitle>{t('log.note')}</SectionTitle>
      <Field value={note} onChangeText={setNote} placeholder={t('log.notePlaceholder')} multiline maxLength={2000} />

      <Button testID="log-save" title={t('common.save')} onPress={save} loading={busy} />
      {entry && (
        <View style={{ marginTop: space.md }}>
          <Button testID="log-remove" kind="ghost" title={t('log.removeEntry')} onPress={remove} disabled={busy} />
        </View>
      )}
    </Screen>
  );
}

function FieldInputRow({ def, value, onChange, error }: { def: FieldDefinition; value: string | boolean | undefined; onChange: (v: string | boolean) => void; error?: string }) {
  const { t } = useTranslation();
  const label = def.unit ? `${def.label} (${def.unit})` : def.label;
  if (def.type === 'boolean') {
    return (
      <View style={{ marginBottom: space.md }}>
        <Text style={[font.label, { marginBottom: 6 }]}>{label}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label={t('common.yes')} selected={value === true} onPress={() => onChange(true)} />
          <Chip label={t('common.no')} selected={value === false} onPress={() => onChange(false)} />
        </View>
      </View>
    );
  }
  if (def.type === 'rating_1_5') {
    return (
      <View style={{ marginBottom: space.md }}>
        <Text style={[font.label, { marginBottom: 6 }]}>{label}</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${def.label} ${n}`} onPress={() => onChange(value === String(n) ? '' : String(n))}
              style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                borderColor: value === String(n) ? colors.accent : colors.border, backgroundColor: value === String(n) ? colors.accentMuted : 'transparent' }}>
              <Text style={{ color: value === String(n) ? colors.accent : colors.textMuted, fontWeight: '600' }}>{n}</Text>
            </Pressable>
          ))}
        </View>
        {error && <Muted style={{ color: colors.danger }}>{error}</Muted>}
      </View>
    );
  }
  const str = typeof value === 'string' ? value : '';
  return (
    <Field
      testID={`field-${def.key}`}
      label={label}
      value={str}
      onChangeText={onChange}
      error={error ?? (def.type === 'time' && str && !isTimeOfDay(normalizeTime(str) ?? '') ? t('errors.invalid_time') : null)}
      keyboardType={def.type === 'number' || def.type === 'duration_min' ? 'decimal-pad' : def.type === 'time' ? 'numbers-and-punctuation' : 'default'}
      placeholder={def.type === 'time' ? 'HH:MM' : undefined}
    />
  );
}
