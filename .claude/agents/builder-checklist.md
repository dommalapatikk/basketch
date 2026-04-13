# Builder Pre-Ship Checklist

Before declaring any task done, the builder MUST verify these items.
This is not optional. Skipping this checklist is how bugs reach QA.

## Code Quality *(Torvalds, Uncle Bob, Metz)*
- [ ] Data structures and types defined before logic was written
- [ ] Every function does one thing and has a meaningful name
- [ ] No functions > 40 lines, no classes > 100 lines, no more than 4 parameters *(Metz rules)*
- [ ] No special-case `if` branches that a better structure would eliminate *(Torvalds "good taste")*
- [ ] Feature code and refactor code in separate commits *(Fowler Two Hats)*
- [ ] No premature abstractions — duplication tolerated until third occurrence *(Fowler Rule of Three)*
- [ ] No `any` types, no `@ts-ignore`, no swallowed exceptions

## State & Types *(Hejlsberg, Abramov)*
- [ ] Discriminated unions for state, not multiple booleans
- [ ] State colocated — not hoisted higher than necessary
- [ ] Supabase generated types used, not hand-written
- [ ] Zod validation at every external boundary

## After any UI component change *(Norman, Osmani, WCAG)*
- [ ] Every button/link has `min-h-[44px]` touch target
- [ ] Every interactive element has `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`
- [ ] Every error state has a recovery action (retry button, link to go back)
- [ ] Every component handles loading, error, and success states
- [ ] Semantic HTML used (ol/ul for lists, nav for navigation, main for content)
- [ ] Responsive: check layout makes sense at 320px, 375px, 768px
- [ ] Below-fold content lazy-loaded *(Osmani: import on interaction)*
- [ ] Information never encoded by color alone *(WCAG 2.2)*

## Performance *(Osmani, Grigorik)*
- [ ] `.select('columns')` not `.select('*')` on every query
- [ ] Batch operations — no loops with individual DB calls
- [ ] Sequential independent requests parallelised (`Promise.all`)
- [ ] Bundle size within budget — no unnecessary dependencies added
- [ ] Standard APIs: `fetch` over Axios, `URL` over custom parsers *(Dahl)*

## Security *(Troy Hunt)*
- [ ] No secrets in client-side code
- [ ] RLS enabled on affected tables
- [ ] Input validation (Zod) on all boundaries
- [ ] Auth via Supabase Auth only

## Observability *(Charity Majors, Cantrill)*
- [ ] Structured events emitted for key operations (not `console.log`)
- [ ] Error events include context (input, step, exception)
- [ ] High-cardinality fields present (job_id, user_id, deploy_sha)

## Testing *(Fowler, Beck)*
- [ ] Test pyramid respected (many unit, some integration, few E2E)
- [ ] Fakes preferred over mocks where feasible
- [ ] Writes are idempotent — safe to re-run (UPSERT not INSERT)
- [ ] Edge cases from use-cases.md covered

## After any pipeline run or data migration
- [ ] Query each affected product group and verify every product belongs there
- [ ] Test with real user searches: bananen, milch, brot, eier, butter, poulet
- [ ] Check for known false-positive patterns: substring matches, brand name collisions
- [ ] Count products with NULL product_group — has it increased?
- [ ] Don't just count rows — read the actual product names

## After any feature that depends on data
- [ ] Verify the underlying data is correct BEFORE building the feature
- [ ] Test the feature with real queries, not just "does it compile"
- [ ] If data is wrong, fix data first, then build feature

## Root cause rule *(Will Larson: fix the system)*
- If fixing a bug, ask: "Will this same class of bug happen again?"
- If yes, fix the root cause (matching logic, defaults, component library), not just this instance
- Three migrations for the same bug class = you didn't fix it properly
- Add a lint rule, test pattern, or DB constraint to prevent the class of bug

## Post-deploy *(Charity Majors)*
- [ ] CI status checked (`gh run list --limit 1`)
- [ ] Vercel deployment status confirmed ("Ready")
- [ ] Never say "should be live" until both CI and Vercel show success
