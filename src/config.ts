/**
 * Runtime configuration. Only PUBLIC values belong here (EXPO_PUBLIC_*).
 * The Supabase anon key is public by design – data is protected by RLS.
 * AI provider keys must NEVER be put here; they live in Supabase Edge Function secrets.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const backendMode: 'supabase' | 'local' = config.supabaseUrl && config.supabaseAnonKey ? 'supabase' : 'local';
