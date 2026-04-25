import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { captureMessage } from '@/lib/observability'

// POST /api/revalidate
// Headers: Authorization: Bearer ${REVALIDATE_SECRET}
// Body: { "tag": "deals" }  (defaults to "deals" if omitted)
//
// Called by basketch/pipeline at the end of every successful run so the
// cached snapshot picks up the fresh week's data immediately instead of
// waiting for the cacheLife('hours') safety belt to expire.
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

  // Next 16 signature: revalidateTag(tag, profile). Pass 'hours' to match
  // the cacheLife profile used by getWeeklySnapshot in src/server/data/snapshot.ts.
  revalidateTag(tag, 'hours')
  captureMessage('cache.revalidate', { tag, at: new Date().toISOString() })
  return NextResponse.json({ revalidated: true, tag, at: new Date().toISOString() })
}
