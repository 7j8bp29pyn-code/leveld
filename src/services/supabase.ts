import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { config, backendMode } from '../config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (backendMode !== 'supabase') throw new Error('Supabase is not configured');
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce', // required for the native OAuth (Google) code exchange
      },
    });
  }
  return client;
}
