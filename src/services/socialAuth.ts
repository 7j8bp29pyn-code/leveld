import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getSupabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** Deep link Supabase redirects back to after Google sign-in (must be in Supabase's redirect allow list). */
export const oauthRedirectUrl = () => Linking.createURL('auth-callback');

export class AuthCancelled extends Error {
  constructor() {
    super('auth_cancelled');
  }
}

/** Native "Sign in with Apple" (iOS only) → Supabase ID-token sign-in. */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AuthCancelled();
    throw e;
  }
  if (!credential.identityToken) throw new Error('apple_no_token');
  const { error } = await getSupabase().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
}

/** Google via Supabase OAuth (PKCE) in the system browser sheet. */
export async function signInWithGoogle() {
  const sb = getSupabase();
  if (Platform.OS === 'web') {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return;
  }
  const redirectTo = oauthRedirectUrl();
  const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new AuthCancelled();
  const params = new URL(result.url.replace('#', '?')).searchParams;
  const errDesc = params.get('error_description');
  if (errDesc) throw new Error(errDesc);
  const code = params.get('code');
  if (!code) throw new Error('oauth_no_code');
  const { error: exErr } = await sb.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
}
