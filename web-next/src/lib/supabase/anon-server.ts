import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cookie-free server-side Supabase client. Safe to call inside 'use cache'
// functions — Cache Components forbids cookies()/headers() in cached scopes.
// All reads here are anon-key + RLS-protected.

const URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL'
const KEY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/**
 * Unreachable by construction (.invalid is reserved by RFC 2606, so DNS fails
 * immediately rather than hanging). Used only when the real config is absent.
 */
const UNCONFIGURED_URL = 'https://unconfigured.invalid'

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env[URL_VAR] && process.env[KEY_VAR])
}

let warned = false

/**
 * Never throws on missing configuration.
 *
 * WHY: pages prerender at build time and call this. Previously the env vars
 * were read with `!`, so an unset variable surfaced as Supabase's generic
 * "supabaseUrl is required" thrown from inside the client constructor — four
 * frames deep in a prerender, naming neither the variable nor where to set it.
 * That failed every Vercel Preview build, because Preview is a separate
 * environment scope from Production.
 *
 * Callers already fail soft on query errors (supabase-provider returns an empty
 * snapshot; concepts returns []). Returning a client whose queries fail lets
 * that existing handling do its job, so a missing config degrades to an empty
 * page instead of a broken build — and says so loudly in the log.
 */
export function createAnonClient() {
  const url = process.env[URL_VAR]
  const key = process.env[KEY_VAR]

  if (!url || !key) {
    if (!warned) {
      warned = true
      const missing = [!url && URL_VAR, !key && KEY_VAR].filter(Boolean).join(', ')
      console.error(
        `[supabase] ${missing} is not set — returning empty data.\n` +
          '[supabase] Set it in Vercel > Settings > Environment Variables for the ' +
          'environment being built (Production AND Preview), or in web-next/.env.local for local dev.',
      )
    }
    return createSupabaseClient(UNCONFIGURED_URL, 'unconfigured', {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' },
    })
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
}
