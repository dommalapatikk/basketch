import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { captureMessage } from '@/lib/observability'

// POST /api/revalidate
// Headers: Authorization: Bearer ${REVALIDATE_SECRET}
// Body: { "tag": "deals" }  (defaults to "deals" if omitted)
//
// Called by basketch/pipeline at the end of every successful run so the
// cached snapshot picks up the fresh week's data immediately.
//
// D3, docs/rca/2026-09-27-tech-lead-stale-expired-deals.md §6 F2 /
// docs/rca/2026-09-27-architect-stale-expired-deals.md §6 D3: this used to
// call `revalidateTag(tag, 'hours')`, which is stale-while-revalidate — the
// visitor immediately after a pipeline run could still be served the
// PREVIOUS run's data while a fresh copy rebuilt in the background. A
// webhook from an external system (the pipeline) telling the site new data
// exists is exactly the case Next 16's own docs name for `{ expire: 0 }`
// (`revalidateTag.md`: "for webhooks ... that need immediate expiration").
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'REVALIDATE_SECRET not configured' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let tag = 'deals'
  try {
    const body = (await request.json()) as { tag?: string }
    if (body?.tag) tag = body.tag
  } catch {
    // empty body is fine — default to 'deals'
  }

  revalidateTag(tag, { expire: 0 })
  captureMessage('cache.revalidate', { tag, at: new Date().toISOString() })
  return NextResponse.json({ revalidated: true, tag, at: new Date().toISOString() })
}
