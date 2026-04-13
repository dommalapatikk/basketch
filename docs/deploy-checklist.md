# Deploy Checklist: basketch

Step-by-step checklist for deploying basketch to production.

---

## 1. Pre-Deploy Checks

- [ ] All TypeScript tests pass: `cd pipeline && npx vitest run`
- [ ] All frontend tests pass: `cd web && npx vitest run`
- [ ] All Python tests pass: `cd pipeline/coop && python -m pytest`
- [ ] Type-check pipeline: `cd pipeline && npx tsc --noEmit`
- [ ] Type-check frontend: `cd web && npx tsc --noEmit`
- [ ] Frontend build succeeds: `cd web && npm run build`
- [ ] No secrets in committed code (search for `SUPABASE_SERVICE_ROLE_KEY` in web/)
- [ ] `.env` is in `.gitignore` (never committed)

---

## 2. Supabase Setup

Run these in order on a new Supabase project (supabase.com, free tier):

- [ ] Create Supabase project (choose EU West region for Swiss users)
- [ ] Run SQL: create `product_groups` table (referenced by other tables)
- [ ] Run SQL: create `products` table
- [ ] Run SQL: create `deals` table (with `product_id` FK)
- [ ] Run SQL: create `pipeline_runs`, `starter_packs`, `favorites`, `favorite_items` tables
- [ ] Run SQL: create all indexes
- [ ] Run SQL: enable RLS and create all row-level policies
- [ ] Run SQL: create `updated_at` trigger
- [ ] Seed `product_groups` with ~37 rows
- [ ] Seed `starter_packs` with 5 starter packs
- [ ] Copy API URL from Project Settings > API
- [ ] Copy `anon` key (safe for frontend)
- [ ] Copy `service_role` key (pipeline only, NEVER in frontend)

---

## 3. Vercel Setup

- [ ] Install Vercel CLI: `npm i -g vercel`
- [ ] Log in: `vercel login`
- [ ] Link project from repo root: `vercel link`
- [ ] Verify root directory is set to the repo root (not `web/`)
- [ ] Verify build command: `cd web && npm install && npm run build`
- [ ] Verify output directory: `web/dist`
- [ ] Verify framework: Vite

### Environment Variables (Vercel Dashboard > Project > Settings > Environment Variables)

- [ ] `VITE_SUPABASE_URL` = your Supabase project URL
- [ ] `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

Note: Pipeline env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) go in GitHub Actions secrets, NOT in Vercel.

### Deploy

- [ ] Preview deploy: `vercel deploy`
- [ ] Check preview URL loads correctly
- [ ] Production deploy: `vercel --prod`

---

## 4. GitHub Actions Secrets

For the weekly pipeline cron (`.github/workflows/pipeline.yml`):

- [ ] `SUPABASE_URL` added to repo Settings > Secrets > Actions
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added to repo Settings > Secrets > Actions

---

## 5. Post-Deploy Verification

### Pages

- [ ] Home page loads with verdict banner
- [ ] Deals page shows current promotions (or empty state if pipeline hasn't run)
- [ ] Onboarding flow works end-to-end (select starter pack, build list)
- [ ] Compare page renders for a valid comparison ID
- [ ] Compare page shows error for invalid ID
- [ ] About page loads
- [ ] 404 page shows for unknown routes
- [ ] All navigation links work

### OG Tags (Social Sharing)

Test with these tools:
- Facebook: https://developers.facebook.com/tools/debug/
- Twitter: https://cards-dev.twitter.com/validator
- LinkedIn: https://www.linkedin.com/post-inspector/

- [ ] Home page shows correct OG title and description
- [ ] Deals page shows correct OG title and description
- [ ] Compare page shows default OG tags
- [ ] OG image loads (og-image.png in public/)

### Security Headers

Check with: `curl -I https://basketch.vercel.app`

- [ ] `X-Frame-Options: DENY` present
- [ ] `X-Content-Type-Options: nosniff` present
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` present

### Performance

- [ ] Lighthouse score > 90 (Performance, Accessibility, Best Practices)
- [ ] html2canvas is NOT in the main bundle (check Network tab, should load on share button click only)
- [ ] Static assets have `Cache-Control: public, max-age=31536000, immutable`

### Mobile

- [ ] Test on iOS Safari (or simulator)
- [ ] Test on Android Chrome (or emulator)
- [ ] Touch targets are at least 44px
- [ ] No horizontal scroll on any page

---

## 6. Pipeline First Run

After deployment, the data pipeline needs to run at least once to populate deals:

- [ ] Run pipeline manually: trigger GitHub Actions workflow (Actions tab > pipeline > Run workflow)
- [ ] Verify `pipeline_runs` table has a new row with `status: 'success'`
- [ ] Verify `deals` table has rows for both Migros and Coop
- [ ] Verify `products` table has been populated
- [ ] Refresh the frontend -- deals should now appear

---

## 7. Monitoring Setup

- [ ] Verify GitHub Actions cron schedule (pipeline.yml) is set for weekly off-peak
- [ ] Check Vercel deployment logs for any warnings
- [ ] Bookmark Supabase dashboard for checking data freshness
- [ ] Set up Vercel deployment notifications (Slack or email) if desired
- [ ] Monitor `pipeline_runs` table for failed runs after first week
