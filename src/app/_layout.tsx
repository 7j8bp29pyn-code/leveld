import '../i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../services/auth';
import { AppStoreProvider, useStore } from '../state/AppStore';
import { Button, Loading, ToastHost } from '../ui/components';
import { colors, font, space } from '../ui/theme';
import { useNotificationDeepLinks } from '../ui/useNotificationDeepLinks';

export default function RootLayout() {
  const auth = useAuth();
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {auth.status === 'loading' ? (
        <Loading />
      ) : (
        <AppStoreProvider auth={auth}>
          <Gate signedIn={auth.status !== 'signedOut'} />
          <ToastHost />
        </AppStoreProvider>
      )}
    </SafeAreaProvider>
  );
}

function Gate({ signedIn }: { signedIn: boolean }) {
  const { status, data, reload } = useStore();
  const { t } = useTranslation();
  useNotificationDeepLinks(signedIn && status === 'ready' && data.profile.onboardingCompleted);

  if (signedIn && status === 'loading') return <Loading />;
  if (signedIn && status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <Text style={[font.body, { marginBottom: space.lg, textAlign: 'center' }]}>{t('errors.loadFailed')}</Text>
        <Button title={t('common.retry')} onPress={reload} />
      </View>
    );
  }
  const onboarded = data.profile.onboardingCompleted;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: t('common.back'),
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="habit" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="log" options={{ presentation: 'modal', title: t('log.title') }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal', title: t('checkin.title') }} />
        <Stack.Screen name="setup" options={{ title: t('level.setupTitle') }} />
        <Stack.Screen name="rhythm" options={{ title: t('rhythm.title') }} />
        <Stack.Screen name="cycles" options={{ title: t('cycles.title') }} />
        <Stack.Screen name="plans" options={{ title: t('plans.title') }} />
      </Stack.Protected>
    </Stack>
  );
}
