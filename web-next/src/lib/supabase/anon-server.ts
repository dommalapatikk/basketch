import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cookie-free server-side Supabase client. Safe to call inside 'use cache'
// functions — Cache Components forbids cookies()/headers() in cached scopes.
// All reads here are anon-key + RLS-protected.
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' },
    },
  )
}
