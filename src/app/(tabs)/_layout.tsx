import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../../ui/theme';

type Glyph = keyof typeof Ionicons.glyphMap;
function icon(name: Glyph) {
  return function TabBarIcon({ color, size }: { color: unknown; size: number }) {
    return <Ionicons name={name} color={color as string} size={size - 2} />;
  };
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.today'), tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="habits" options={{ title: t('tabs.habits'), tabBarIcon: icon('layers-outline') }} />
      <Tabs.Screen name="progress" options={{ title: t('tabs.progress'), tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="more" options={{ title: t('tabs.more'), tabBarIcon: icon('ellipsis-horizontal') }} />
    </Tabs>
  );
}
