import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isLocalDate, normalizeTime } from '../domain/dates';
import { defaultFieldsFor, expansionReady, GUIDED_START_LIMIT } from '../domain/phases';
import { currentStreak } from '../domain/stats';
import { PHASES, type FieldInput, type FieldType, type HabitInput, type Phase, type ScheduleType, type Weekday } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Badge, Button, Card, Chip, Field, Muted, Screen, SectionTitle, Segmented } from '../ui/components';
import { confirm } from '../ui/confirm';
import { CATEGORIES, colors, font, HABIT_ICONS, radius, space } from '../ui/theme';

const FIELD_TYPES: FieldType[] = ['number', 'duration_min', 'rating_1_5', 'time', 'boolean', 'text'];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export default function HabitEditor() {
  const { t } = useTranslation();
  const store = useStore();
  const params = useLocalSearchParams<{ id?: string; name?: string; fromBacklog?: string }>();
  const existing = store.data.habits.find((h) => h.id === params.id);
  const existingFields = existing ? store.data.fields.filter((f) => f.habitId === existing.id && !f.archived).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const usedKeys = new Set(store.data.entries.filter((e) => e.habitId === existing?.id).flatMap((e) => Object.keys(e.values)));

  const [form, setForm] = useState<HabitInput>(() => existing ?? {
    name: params.name ?? '', category: 'general', icon: 'ellipse-outline', description: '', goal: '', scheduleType: 'daily',
    weekdays: [...WEEKDAYS], timesPerWeek: 3, reminderTime: store.data.profile.defaultReminderTime,
    reminderEnabled: !!store.data.profile.defaultReminderTime, startDate: store.today, phase: 1, status: 'active',
    pausePeriods: [], sortOrder: store.data.habits.length,
  });
  const [fields, setFields] = useState<FieldInput[]>(() => existingFields.map((f) => ({ ...f })));
  const [timeText, setTimeText] = useState(form.reminderTime ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof HabitInput>(k: K, v: HabitInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const activeCount = store.data.habits.filter((h) => h.status === 'active').length;
  const guidedWarn = !existing && store.data.profile.mode === 'guided'
    && (activeCount >= GUIDED_START_LIMIT || !expansionReady(store.data.habits, store.data.entries, store.data.profile, store.today));

  async function save() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('errors.required');
    const time = timeText ? normalizeTime(timeText) : null;
    if (timeText && !time) errs.time = t('errors.invalid_time');
    if (form.reminderEnabled && !time) errs.time = t('errors.invalid_time');
    if (!isLocalDate(form.startDate)) errs.startDate = t('errors.invalid_date');
    if (form.scheduleType === 'weekdays' && form.weekdays.length === 0) errs.weekdays = t('errors.required');
    fields.forEach((f, i) => { if (!f.label.trim()) errs[`field${i}`] = t('errors.required'); });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const input: HabitInput = { ...form, reminderTime: time, name: form.name.trim(), timesPerWeek: form.scheduleType === 'times_per_week' ? form.timesPerWeek ?? 3 : form.timesPerWeek };
    let ok: boolean;
    if (existing) {
      const { phase, ...rest } = input;
      ok = await store.updateHabit(existing.id, rest, fields);
      if (ok && phase !== existing.phase) ok = await store.changePhase(existing.id, phase, 'user');
    } else {
      ok = !!(await store.createHabit(input, fields));
      if (ok && params.fromBacklog) {
        await store.saveProfile({ habitBacklog: store.data.profile.habitBacklog.filter((n) => n !== params.name) });
      }
    }
    setBusy(false);
    if (ok) router.back();
  }

  async function remove() {
    if (!existing) return;
    if (!(await confirm(t('habit.deleteConfirm', { name: existing.name })))) return;
    if (await store.deleteHabit(existing.id)) router.back();
  }

  const streak = existing ? currentStreak(existing, store.data.entries, store.today) : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? t('habit.editTitle') : t('habit.newTitle') }} />
      {guidedWarn && <Card style={{ marginBottom: space.lg }}><Muted>{t('habit.guidedHint')}</Muted></Card>}
      {existing && (
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          {existing.status !== 'active' && <Badge tone="warning" label={existing.status === 'paused' ? t('habit.statusPaused') : t('habit.statusArchived')} />}
          {streak > 0 && <Badge tone="success" label={t('habit.streak', { n: streak })} />}
        </View>
      )}

      <Field testID="habit-name" label={t('habit.name')} value={form.name} onChangeText={(v) => set('name', v)} placeholder={t('habit.namePlaceholder')} error={errors.name} maxLength={80} />

      <Text style={[font.label, { marginBottom: 6 }]}>{t('habit.icon')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }}>
        {HABIT_ICONS.map((ic) => (
          <Pressable key={ic} accessibilityLabel={ic} onPress={() => set('icon', ic)}
            style={{ width: 44, height: 44, borderRadius: radius.md, marginRight: space.sm, alignItems: 'center', justifyContent: 'center',
              backgroundColor: form.icon === ic ? colors.accentMuted : colors.surface, borderWidth: 1, borderColor: form.icon === ic ? colors.accent : colors.border }}>
            <Ionicons name={ic} size={20} color={form.icon === ic ? colors.accent : colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[font.label, { marginBottom: 6 }]}>{t('habit.category')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        {CATEGORIES.map((c) => <Chip key={c} label={t(`habit.categories.${c}`)} selected={form.category === c} onPress={() => set('category', c)} />)}
      </View>

      <Field label={t('habit.goal')} value={form.goal} onChangeText={(v) => set('goal', v)} placeholder={t('habit.goalPlaceholder')} maxLength={500} />
      <Field label={`${t('habit.description')} (${t('common.optional')})`} value={form.description} onChangeText={(v) => set('description', v)} multiline maxLength={1000} />

      <SectionTitle>{t('habit.schedule')}</SectionTitle>
      <Segmented<ScheduleType>
        options={[{ value: 'daily', label: t('habit.daily') }, { value: 'weekdays', label: t('habit.weekdays') }, { value: 'times_per_week', label: t('habit.timesPerWeek') }]}
        value={form.scheduleType} onChange={(v) => set('scheduleType', v)} />
      {form.scheduleType === 'weekdays' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md }}>
          {WEEKDAYS.map((d) => (
            <Chip key={d} label={t(`weekdaysShort.${d}`)} selected={form.weekdays.includes(d)}
              onPress={() => set('weekdays', form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d].sort())} />
          ))}
          {errors.weekdays && <Muted style={{ color: colors.danger, width: '100%' }}>{errors.weekdays}</Muted>}
        </View>
      )}
      {form.scheduleType === 'times_per_week' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} label={t('habit.timesPerWeekLabel', { n })} selected={form.timesPerWeek === n} onPress={() => set('timesPerWeek', n)} />)}
        </View>
      )}

      <SectionTitle>{t('habit.reminder')}</SectionTitle>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <Chip label={t('common.no')} selected={!form.reminderEnabled} onPress={() => set('reminderEnabled', false)} />
          <Chip label={t('common.yes')} selected={form.reminderEnabled} onPress={() => set('reminderEnabled', true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Field value={timeText} onChangeText={setTimeText} placeholder={t('habit.reminderTime')} error={errors.time} keyboardType="numbers-and-punctuation" />
        </View>
      </View>

      <Field label={t('habit.startDate')} value={form.startDate} onChangeText={(v) => set('startDate', v)} error={errors.startDate} autoCapitalize="none" />

      <SectionTitle>{t('habit.phase')}</SectionTitle>
      {PHASES.map((p) => (
        <Pressable key={p} onPress={() => set('phase', p)} accessibilityRole="radio" accessibilityState={{ selected: form.phase === p }}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: form.phase === p ? colors.accent : colors.border, marginRight: space.md, alignItems: 'center', justifyContent: 'center' }}>
            {form.phase === p && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.body}>{t('phase.label', { n: p, name: t(`phase.names.${p}`) })}</Text>
            <Muted>{t(`phase.desc.${p}`)}</Muted>
          </View>
        </Pressable>
      ))}

      <SectionTitle>{t('habit.fields')}</SectionTitle>
      <Muted style={{ marginBottom: space.md }}>{t('habit.fieldsHint')}</Muted>
      {fields.map((f, i) => {
        const locked = !!f.id && usedKeys.has(f.key);
        const update = (patch: Partial<FieldInput>) => setFields(fields.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <Card key={f.id ?? `new-${i}`} style={{ marginBottom: space.sm, padding: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 2 }}><Field testID={`fd-label-${i}`} label={t('habit.fieldLabel')} value={f.label} onChangeText={(v) => update({ label: v })} error={errors[`field${i}`]} maxLength={60} /></View>
              <View style={{ flex: 1 }}><Field label={t('habit.fieldUnit')} value={f.unit} onChangeText={(v) => update({ unit: v })} maxLength={20} /></View>
              <Pressable accessibilityLabel={t('common.delete')} onPress={() => setFields(fields.filter((_, j) => j !== i))} style={{ paddingTop: 28 }}>
                <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[font.label, { marginBottom: 6 }]}>{t('habit.fieldType')}</Text>
            {locked ? <Muted style={{ marginBottom: space.sm }}>{t(`habit.types.${f.type}`)} – {t('habit.lockedType')}</Muted> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {FIELD_TYPES.map((ty) => <Chip key={ty} label={t(`habit.types.${ty}`)} selected={f.type === ty} onPress={() => update({ type: ty })} />)}
              </View>
            )}
            <Text style={[font.label, { marginBottom: 6 }]}>{t('habit.fromPhase')}</Text>
            <View style={{ flexDirection: 'row' }}>
              {PHASES.map((p) => <Chip key={p} label={String(p)} selected={f.minPhase === p} onPress={() => update({ minPhase: p as Phase })} />)}
            </View>
          </Card>
        );
      })}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
        <Button testID="add-field" compact kind="secondary" icon="add" title={t('habit.addField')}
          onPress={() => setFields([...fields, { key: '', label: '', type: 'number', unit: '', minPhase: Math.max(2, form.phase) as Phase, sortOrder: fields.length, archived: false }])} />
        {fields.length === 0 && (['generic', 'training', 'endurance', 'sleep'] as const).map((tpl) => (
          <Button key={tpl} compact kind="ghost" title={`+ ${t(`habit.templates.${tpl}`)}`} onPress={() => setFields(defaultFieldsFor(tpl))} />
        ))}
      </View>

      <Button testID="habit-save" title={t('common.save')} onPress={save} loading={busy} />

      {existing && (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          {existing.status === 'active' && <Button kind="secondary" title={t('habit.pause')} onPress={async () => { if (await store.pauseHabit(existing.id)) router.back(); }} />}
          {existing.status === 'paused' && <Button kind="secondary" title={t('habit.resume')} onPress={async () => { if (await store.resumeHabit(existing.id)) router.back(); }} />}
          {existing.status !== 'archived'
            ? <Button kind="secondary" title={t('habit.archive')} onPress={async () => { if (await store.updateHabit(existing.id, { status: 'archived' })) router.back(); }} />
            : <Button kind="secondary" title={t('habit.unarchive')} onPress={async () => { if (await store.updateHabit(existing.id, { status: 'active' })) router.back(); }} />}
          <Button testID="habit-delete" kind="danger" title={t('common.delete')} onPress={remove} />
          <Muted style={{ textAlign: 'center' }}>{t('habit.deleteHint')}</Muted>
        </View>
      )}
    </Screen>
  );
}
