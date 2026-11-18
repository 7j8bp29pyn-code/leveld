import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays } from '../domain/dates';
import { ValidationError } from '../domain/entries';
import { currentCycle } from '../domain/training';
import type { CycleInput, CyclePhase, TrainingCycle, Weekday } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Badge, Button, Card, Chip, Field, Muted, Screen, SectionTitle } from '../ui/components';
import { confirm } from '../ui/confirm';
import { formatDate } from '../ui/format';
import { colors, font, space } from '../ui/theme';

const PHASES: CyclePhase[] = ['build', 'load', 'deload', 'maintain'];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Manually configured training blocks (build / load / deload / maintenance). */
export default function CyclesScreen() {
  const { t } = useTranslation();
  const store = useStore();
  const params = useLocalSearchParams<{ deload?: string }>();
  const today = store.today;
  const blank = (phase: CyclePhase): CycleInput => ({
    name: phase === 'deload' ? t('cycles.phases.deload') : '', goal: '', phase, startDate: today, endDate: addDays(today, phase === 'deload' ? 6 : 27),
    sessionsPerWeek: null, restWeekdays: [], notes: '', confirmedBy: 'user',
  });
  const [editing, setEditing] = useState<{ id?: string; form: CycleInput } | null>(params.deload ? { form: blank('deload') } : null);
  const [error, setError] = useState<string | null>(null);
  const cycles = [...store.data.cycles].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const cur = currentCycle(store.data.cycles, today);

  async function save() {
    if (!editing) return;
    setError(null);
    if (!editing.form.name.trim()) return setError(t('errors.required'));
    if (editing.form.endDate < editing.form.startDate) return setError(t('errors.end_before_start'));
    const ok = await store.saveCycle(editing.form, editing.id);
    if (ok) setEditing(null);
  }

  const edit = (c: TrainingCycle) => {
    const { id, createdAt: _c, updatedAt: _u, ...form } = c;
    setEditing({ id, form });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('cycles.title') }} />
      <Muted style={{ marginBottom: space.lg }}>{t('cycles.manual')}</Muted>

      {editing ? (
        <Card>
          <Text style={[font.h3, { marginBottom: space.md }]}>{editing.id ? t('cycles.edit') : t('cycles.add')}</Text>
          <Field testID="cycle-name" label={t('cycles.name')} value={editing.form.name} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, name: v } })} maxLength={80} />
          <Field label={t('cycles.goal')} value={editing.form.goal} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, goal: v } })} maxLength={500} />
          <Text style={[font.label, { marginBottom: 6 }]}>{t('cycles.phase')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {PHASES.map((ph) => (
              <Chip key={ph} testID={`cphase-${ph}`} label={t(`cycles.phases.${ph}`)} selected={editing.form.phase === ph}
                onPress={() => setEditing({ ...editing, form: { ...editing.form, phase: ph } })} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Field label={t('cycles.start')} value={editing.form.startDate} autoCapitalize="none"
              onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, startDate: v } })} /></View>
            <View style={{ flex: 1 }}><Field label={t('cycles.end')} value={editing.form.endDate} autoCapitalize="none"
              onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, endDate: v } })} /></View>
          </View>
          <Text style={[font.label, { marginBottom: 6 }]}>{t('cycles.sessions')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} label={String(n)} selected={editing.form.sessionsPerWeek === n}
                onPress={() => setEditing({ ...editing, form: { ...editing.form, sessionsPerWeek: editing.form.sessionsPerWeek === n ? null : n } })} />
            ))}
          </View>
          <Text style={[font.label, { marginBottom: 6 }]}>{t('cycles.restDays')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {WEEKDAYS.map((d) => {
              const r = editing.form.restWeekdays;
              return <Chip key={d} label={t(`weekdaysShort.${d}`)} selected={r.includes(d)}
                onPress={() => setEditing({ ...editing, form: { ...editing.form, restWeekdays: r.includes(d) ? r.filter((x) => x !== d) : [...r, d].sort() } })} />;
            })}
          </View>
          <Text style={[font.label, { marginBottom: 6 }]}>{t('cycles.confirmedBy')}</Text>
          <View style={{ flexDirection: 'row' }}>
            {(['user', 'coach'] as const).map((c) => (
              <Chip key={c} label={t(`cycles.${c}`)} selected={editing.form.confirmedBy === c} onPress={() => setEditing({ ...editing, form: { ...editing.form, confirmedBy: c } })} />
            ))}
          </View>
          <Field label={t('cycles.notes')} value={editing.form.notes} multiline maxLength={2000} onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, notes: v } })} />
          {error && <Muted style={{ color: colors.danger, marginBottom: space.sm }}>{error}</Muted>}
          <View style={{ gap: space.sm }}>
            <Button testID="cycle-save" title={t('common.save')} onPress={() => save().catch((e) => setError(e instanceof ValidationError ? t(`errors.${e.message}`) : String(e)))} />
            <Button kind="ghost" title={t('common.cancel')} onPress={() => setEditing(null)} />
          </View>
        </Card>
      ) : (
        <Button testID="cycle-add" icon="add" title={t('cycles.add')} onPress={() => setEditing({ form: blank('build') })} />
      )}

      <SectionTitle>{t('cycles.title')}</SectionTitle>
      {cycles.length === 0 && <Muted>{t('cycles.empty')}</Muted>}
      {cycles.map((c) => (
        <Card key={c.id} onPress={() => edit(c)} style={{ marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={[font.body, { fontWeight: '600', flex: 1 }]}>{c.name}</Text>
            <Badge tone={cur?.id === c.id ? 'accent' : 'neutral'} label={t(`cycles.phases.${c.phase}`)} />
          </View>
          <Muted>{formatDate(c.startDate)} – {formatDate(c.endDate)}{c.sessionsPerWeek ? ` · ${c.sessionsPerWeek}×/Woche` : ''}{c.confirmedBy === 'coach' ? ` · ${t('cycles.coach')}` : ''}</Muted>
          <Pressable accessibilityLabel={t('common.delete')} style={{ marginTop: space.sm }}
            onPress={async () => { if (await confirm(`${c.name}?`)) await store.deleteCycle(c.id); }}>
            <Text style={{ color: colors.textMuted }}>{t('common.delete')}</Text>
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}
