import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { backendMode } from '../config';
import { authErrorMessage } from '../services/auth';
import { getSupabase } from '../services/supabase';
import { Button, Loading } from '../ui/components';
import { colors, font, space } from '../ui/theme';

/**
 * Deep-link target after e-mail confirmation (and Google on Android).
 * Exchanges the PKCE `code` for a session; then the root gate takes over.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [state, setState] = useState<'working' | 'done' | string>(params.code && backendMode === 'supabase' ? 'working' : 'done');

  useEffect(() => {
    if (!params.code || backendMode !== 'supabase') return;
    getSupabase().auth.exchangeCodeForSession(params.code).then(
      ({ error }) => setState(error ? authErrorMessage(error) : 'done'),
      (e) => setState(authErrorMessage(e)),
    );
  }, [params.code]);

  if (state === 'working') return <Loading />;
  if (state === 'done' && !params.error_description) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xl }}>
      <Text style={[font.body, { color: colors.danger, marginBottom: space.lg }]}>{params.error_description ?? state}</Text>
      <Button title={t('auth.signIn')} onPress={() => router.replace('/')} />
    </View>
  );
}
