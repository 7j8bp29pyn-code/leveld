import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { authErrorMessage, resendConfirmation, signIn, signUp } from '../services/auth';
import { appleAvailable, AuthCancelled, signInWithApple, signInWithGoogle } from '../services/socialAuth';
import { Button, Field, Muted, Screen } from '../ui/components';
import { colors, font, radius, space } from '../ui/theme';

export default function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'apple' | 'google' | 'resend'>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [apple, setApple] = useState(false);
  useEffect(() => { appleAvailable().then(setApple).catch(() => setApple(false)); }, []);

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof AuthCancelled)) {
        setMsg({ text: authErrorMessage(e), tone: 'error' });
        if ((e as { code?: string }).code === 'email_not_confirmed') setShowResend(true);
      }
    } finally {
      setBusy(null);
    }
  }

  const submit = () => run('email', async () => {
    if (mode === 'in') await signIn(email, password);
    else if (await signUp(email, password)) {
      setMsg({ text: t('auth.checkMail'), tone: 'info' });
      setShowResend(true);
      setMode('in');
    }
  });

  return (
    <Screen>
      <View style={{ marginTop: space.xxl * 2, marginBottom: space.xxl }}>
        <Text style={[font.h1, { fontSize: 36, letterSpacing: 4 }]}>LEVELD</Text>
        <Muted>{t('app.claim')}</Muted>
      </View>

      {apple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.md}
          style={{ height: 48, marginBottom: space.md }}
          onPress={() => run('apple', signInWithApple)}
        />
      )}
      <Button kind="secondary" icon="logo-google" title={t('auth.withGoogle')} loading={busy === 'google'} disabled={!!busy}
        onPress={() => run('google', signInWithGoogle)} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: space.xl }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Muted style={{ marginHorizontal: space.md }}>{t('auth.or')}</Muted>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry hint={t('auth.passwordHint')}
        autoComplete={mode === 'in' ? 'password' : 'new-password'} />
      {msg && <Text style={[font.small, { color: msg.tone === 'error' ? colors.danger : colors.success, marginBottom: space.md }]}>{msg.text}</Text>}
      <Button title={mode === 'in' ? t('auth.signIn') : t('auth.signUp')} onPress={submit} disabled={!valid || !!busy} loading={busy === 'email'} />
      {showResend && /\S+@\S+\.\S+/.test(email) && (
        <View style={{ marginTop: space.sm }}>
          <Button kind="ghost" title={t('auth.resend')} loading={busy === 'resend'}
            onPress={() => run('resend', async () => { await resendConfirmation(email); setMsg({ text: t('auth.resent'), tone: 'info' }); })} />
        </View>
      )}
      <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }} style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Text style={{ color: colors.accent }}>{mode === 'in' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}</Text>
      </Pressable>
    </Screen>
  );
}
