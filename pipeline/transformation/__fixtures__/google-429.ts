// A real-shaped Google Generative Language 429 body.
//
// WHY THIS FIXTURE EXISTS: the two fields that decide what we do next sit a
// long way into the payload.
//
//   ~char 460   quotaId "...PerDayPerProjectPerModel-FreeTier"  → rate-limited-daily
//   ~char 900   "retryDelay": "37s"                             → the provider's own instruction
//
// Truncating the error body at 200 characters threw both away, so every 429
// looked like a generic short rate limit and we backed off on a guess. The
// shape is Google's; only the project id and model name are anonymised.

const body = (quotaId: string, quotaValue: string) =>
  JSON.stringify({
    error: {
      code: 429,
      message:
        'You exceeded your current quota, please check your plan and billing details. For more information on this error, visit https://ai.google.dev/gemini-api/docs/rate-limits.',
      status: 'RESOURCE_EXHAUSTED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
              quotaId,
              quotaDimensions: { model: 'gemini-3.5-flash', location: 'global' },
              quotaValue,
            },
          ],
        },
        {
          '@type': 'type.googleapis.com/google.rpc.Help',
          links: [
            { description: 'Learn more about Gemini API quotas', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' },
          ],
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '37s',
        },
      ],
    },
  })

/** The 20-requests-per-day cap that produced two meaningless benchmark scores on 2026-09-10. */
export const GOOGLE_429_BODY = body('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '20')

/** The recoverable one: a per-minute cap, where retryDelay is the instruction to obey. */
export const GOOGLE_429_PER_MINUTE_BODY = body('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '15')

/** Where the load-bearing fields actually sit, asserted in tests so the fixture cannot drift into being easy. */
export const RETRY_DELAY_OFFSET = GOOGLE_429_BODY.indexOf('retryDelay')
export const PER_DAY_OFFSET = GOOGLE_429_BODY.indexOf('PerDay')
