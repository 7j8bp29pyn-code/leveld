import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { backendMode } from '../config';
import i18n from '../i18n';
import { getSupabase } from './supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'local' } // no account – on-device mode
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(backendMode === 'local' ? { status: 'local' } : { status: 'loading' });
  useEffect(() => {
    if (backendMode === 'local') return;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) =>
      setState(data.session ? { status: 'signedIn', session: data.session } : { status: 'signedOut' }),
    );
    const { data } = sb.auth.onAuthStateChange((_e, session) =>
      setState(session ? { status: 'signedIn', session } : { status: 'signedOut' }),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Returns true if the user must confirm their email first. */
export async function signUp(email: string, password: string): Promise<boolean> {
  // the confirmation link opens the app again (auth-callback) and signs the user in
  const { oauthRedirectUrl } = await import('./socialAuth');
  const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: oauthRedirectUrl() } });
  if (error) throw error;
  return !data.session;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

/** Re-send the sign-up confirmation email. */
export async function resendConfirmation(email: string) {
  const { oauthRedirectUrl } = await import('./socialAuth');
  const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: oauthRedirectUrl() } });
  if (error) throw error;
}

const KNOWN = ['invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'weak_password', 'over_email_send_rate_limit'];

/** Maps Supabase auth errors to understandable messages. */
export function authErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err.code && KNOWN.includes(err.code)) return i18n.t(`auth.errors.${err.code}`);
  if (/provider is not enabled|unsupported provider/i.test(err.message ?? '')) return i18n.t('auth.errors.provider_disabled');
  if (/network|fetch/i.test(err.message ?? '')) return i18n.t('errors.network');
  return i18n.t('auth.errors.unknown', { msg: err.message ?? String(e) });
}
