import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays } from '../../domain/dates';
import { habitStats } from '../../domain/stats';
import type { Habit } from '../../domain/types';
import { useStore } from '../../state/AppStore';
import { Badge, Button, Card, HabitIcon, Muted, ProgressBar, Screen, SectionTitle } from '../../ui/components';
import { pct } from '../../ui/format';
import { colors, font, space } from '../../ui/theme';

export default function Habits() {
  const { t } = useTranslation();
  const { data, today, saveProfile } = useStore();
  const groups: { key: Habit['status']; title: string }[] = [
    { key: 'active', title: t('habit.active') },
    { key: 'paused', title: t('habit.statusPaused') },
    { key: 'archived', title: t('habit.statusArchived') },
  ];

  const scheduleLabel = (h: Habit) =>
    h.scheduleType === 'daily' ? t('habit.daily')
      : h.scheduleType === 'weekdays' ? h.weekdays.map((d) => t(`weekdaysShort.${d}`)).join(' ')
        : t('habit.timesPerWeekLabel', { n: h.timesPerWeek });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={font.h1}>{t('tabs.habits')}</Text>
        <Button testID="new-habit" compact icon="add" title={t('common.add')} onPress={() => router.push('/habit')} />
      </View>
      {data.profile.mode === 'guided' && <Muted style={{ marginTop: space.sm }}>{t('habit.guidedHint')}</Muted>}

      {data.habits.length === 0 && (
        <Card style={{ marginTop: space.xl }}>
          <Muted style={{ marginBottom: space.md }}>{t('habit.empty')}</Muted>
          <Button title={t('habit.create')} onPress={() => router.push('/habit')} />
        </Card>
      )}

      {groups.map((g) => {
        const list = data.habits.filter((h) => h.status === g.key).sort((a, b) => a.sortOrder - b.sortOrder);
        if (!list.length) return null;
        return (
          <View key={g.key}>
            <SectionTitle>{g.title}</SectionTitle>
            {list.map((h) => {
              const s = habitStats(h, data.entries, addDays(today, -data.profile.phaseWindowDays), today, today);
              return (
                <Card key={h.id} testID={`habit-${h.name}`} onPress={() => router.push({ pathname: '/habit', params: { id: h.id } })} style={{ marginBottom: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <HabitIcon name={h.icon} />
                    <View style={{ flex: 1, marginLeft: space.md }}>
                      <Text style={[font.body, { fontWeight: '600' }]}>{h.name}</Text>
                      <Muted>{scheduleLabel(h)}{h.reminderEnabled && h.reminderTime ? ` · ${h.reminderTime}` : ''}</Muted>
                    </View>
                    <Badge tone="accent" label={t('phase.label', { n: h.phase, name: t(`phase.names.${h.phase}`) })} />
                  </View>
                  {g.key === 'active' && (
                    <View style={{ marginTop: space.md }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Muted>{t('progress.rate')} · {data.profile.phaseWindowDays} T</Muted>
                        <Muted>{pct(s.rate)}</Muted>
                      </View>
                      <ProgressBar value={s.rate} height={4} />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        );
      })}

      {data.profile.habitBacklog.length > 0 && (
        <>
          <SectionTitle>{t('habit.backlog')}</SectionTitle>
          {data.profile.habitBacklog.map((name) => (
            <Card key={name} style={{ marginBottom: space.sm, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[font.body, { flex: 1 }]}>{name}</Text>
              <Button compact kind="secondary" title={t('habit.startNow')}
                onPress={() => router.push({ pathname: '/habit', params: { name, fromBacklog: '1' } })} />
              <Pressable accessibilityLabel={t('common.delete')} style={{ marginLeft: space.md }}
                onPress={() => saveProfile({ habitBacklog: data.profile.habitBacklog.filter((n) => n !== name) })}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
