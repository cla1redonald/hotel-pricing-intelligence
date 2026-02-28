import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

// Backward-compatible named export for existing imports
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabaseClient(), prop);
  },
});
