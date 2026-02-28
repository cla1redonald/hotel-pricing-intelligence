import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url) throw new Error('SUPABASE_URL environment variable is required');
    if (!key) throw new Error('SUPABASE_ANON_KEY environment variable is required');
    _client = createClient(url, key);
  }
  return _client;
}

// Backward-compatible named export for existing imports
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabaseClient(), prop);
  },
});
