import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays } from '../domain/dates';
import { SHIFT_PRESETS } from '../domain/rhythm';
import type { ShiftType } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Button, Card, Chip, Muted, Screen, SectionTitle } from '../ui/components';
import { formatDate, relativeDay } from '../ui/format';
import { RhythmStep, type RhythmValue } from '../ui/profileSteps';
import { font, space } from '../ui/theme';

const SHIFTS: Exclude<ShiftType, 'custom'>[] = ['early', 'late', 'night', 'off'];

/** Daily rhythm defaults + per-day shift plan for rotating shifts. */
export default function RhythmScreen() {
  const { t } = useTranslation();
  const store = useStore();
  const p = store.data.profile;
  const [value, setValue] = useState<RhythmValue>({ rhythm: p.dayRhythm, anchors: p.anchors, dayStartHour: p.dayStartHour });
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 14 }, (_, i) => addDays(store.today, i));

  async function save() {
    setBusy(true);
    await store.saveProfile({ dayRhythm: value.rhythm, anchors: value.anchors, dayStartHour: value.dayStartHour });
    setBusy(false);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('rhythm.title') }} />
      <RhythmStep value={value} onChange={setValue} compact />
      <View style={{ marginTop: space.lg }}>
        <Button testID="rhythm-save" title={t('common.save')} onPress={save} loading={busy} />
      </View>

      {(p.dayRhythm === 'rotating' || p.dayRhythm === 'custom' || value.rhythm === 'rotating') && (
        <>
          <SectionTitle>{t('rhythm.plan')}</SectionTitle>
          <Muted style={{ marginBottom: space.md }}>{t('rhythm.planHint')}</Muted>
          {days.map((d) => {
            const current = store.data.daySchedules.find((s) => s.localDate === d);
            return (
              <Card key={d} style={{ marginBottom: space.sm, padding: space.md }}>
                <Text style={[font.body, { fontWeight: '600', marginBottom: 6 }]}>{relativeDay(d, store.today)} · {formatDate(d, { day: 'numeric', month: 'short' })}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Chip label={t('rhythm.none')} selected={!current} onPress={() => current && store.deleteDaySchedule(d)} />
                  {SHIFTS.map((sh) => (
                    <Chip key={sh} testID={`shift-${d}-${sh}`} label={t(`rhythm.shifts.${sh}`)} selected={current?.shift === sh}
                      onPress={() => store.saveDaySchedule({ localDate: d, shift: sh, anchors: SHIFT_PRESETS[sh] })} />
                  ))}
                </View>
                {current && (
                  <Muted>
                    {t('rhythm.wake')} {current.anchors.wake} · {t('rhythm.workEnd')} {current.anchors.workEnd ?? '–'} · {t('rhythm.bedtime')} {current.anchors.bedtime}
                  </Muted>
                )}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
