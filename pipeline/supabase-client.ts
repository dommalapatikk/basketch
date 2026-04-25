// Shared Supabase client for the pipeline. Service role key — never used
// in frontend / web. Single instance reused across run.ts, store.ts,
// resolve-taxonomy.ts. Loaded from .env via dotenv.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
