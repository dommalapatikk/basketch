# basketch — Human Tester Guide

**Version:** 1.0  
**Date:** 21 April 2026  
**Live URL:** https://basketch.vercel.app  
**For:** Friends and colleagues testing the app before wider release

---

## What is basketch?

basketch tells you which of your regular grocery items are on promotion this week across 7 Swiss supermarkets — before you leave the house. Browse this week's deals, tap + to build your personal list, and share it with your shopping partner.

**No account needed. No app to install. Works on any phone browser.**

---

## How to test — 3 steps

### Step 1: Browse deals

Go to: **https://basketch.vercel.app/deals**

You should see:
- A list of this week's deals from all 7 stores (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg)
- Category tabs at the top (All / Fresh / Long-life / Household)
- Store filter pills below (tap to filter by store)
- Each deal card shows: product image (if available), store badge, product name, price, discount %, and valid dates

**Try:**
1. Tap the "Fresh" tab — only fresh products should appear
2. Tap "🥬 Fruits & Vegetables" pill — only that sub-category
3. Tap/deselect store pills to add or remove stores
4. Tap the **+** button on any deal — it should turn green (item added to your list)
5. Tap the **green checkmark** on the same deal — it should remove the item (toggle off)
6. After adding 3+ items, a **sticky bar** should appear at the bottom: "X items in your list →"

**Expected result:**
- + turns green immediately when tapped
- Tapping again removes the item (reverts to grey +)
- Sticky bar shows the correct count
- Tapping the sticky bar link takes you to your comparison page

---

### Step 2: View your comparison

After adding items in Step 1, tap the sticky bar link **"X items in your list →"** or go to:

**https://basketch.vercel.app/compare/[your-basket-id]**

(Your basket ID appears in the URL after clicking the sticky bar)

You should see:
- Your tracked items grouped by category (e.g., Fruits & Vegetables, Dairy & Eggs)
- For each category: all deals from all stores that week — not just exact matches
- Each deal card shows: image, store badge, price, discount %, and valid dates
- A sticky bar at the bottom with Copy link and Share buttons
- An "Edit my list" button

**Try:**
1. Check that your added items appear in the right categories
2. Tap + on a deal you haven't added yet — it should add to your list
3. Tap the green checkmark to remove it
4. Tap "Copy link" — paste it in WhatsApp or another tab to verify it works
5. Tap "Edit my list" — goes to the edit screen

---

### Step 3: Check the homepage

Go to: **https://basketch.vercel.app**

You should see:
- A weekly verdict: which store leads in Fresh / Long-life / Household
- Deal category cards with top deals
- A "Browse all deals" button → goes to /deals
- If you already have a list: "Your personal comparison is ready → View my list"
- If no list yet: "Browse deals and tap + to build your personal list → Browse"

**Try:**
1. Navigate to the homepage — the verdict should load in under 3 seconds
2. If you added items in Step 1, the homepage should show "View my list"
3. Tap "Deals" in the nav bar — should go to /deals
4. Tap "My List" in the nav bar:
   - If you have items: goes to your comparison page
   - If no items: goes to /deals (not an onboarding form)

---

## Test scenarios — pass/fail

| # | Scenario | Steps | Expected | Pass/Fail |
|---|----------|-------|----------|-----------|
| T1 | Add item from Deals page | Go to /deals, tap + on any deal | Button turns green, sticky bar appears | |
| T2 | Remove item from Deals page | Tap green checkmark on same deal | Button returns to grey +, count decreases | |
| T3 | Sticky bar count is correct | Add 3 items | Sticky bar shows "3 items in your list" | |
| T4 | Navigate to comparison via sticky bar | Tap the sticky bar link | Opens /compare/:id with your items | |
| T5 | Comparison shows deals by category | View /compare/:id | Items grouped into categories (e.g. Fruits & Vegetables) | |
| T6 | Valid dates on deal cards | Check any deal card | Shows "Valid 21–27 Apr" or similar | |
| T7 | Share link works | Tap Copy link, paste in new tab | Same comparison page loads | |
| T8 | "My List" nav → new user | Clear browser storage, tap "My List" | Goes to /deals (not an onboarding form) | |
| T9 | "My List" nav → returning user | With items saved, tap "My List" | Goes to your /compare/:id page | |
| T10 | Homepage verdict loads | Open homepage | Weekly verdict visible within 3 seconds | |
| T11 | Category filter works | Tap "Fresh" tab on Deals | Only fresh products shown | |
| T12 | Store filter works | Deselect Migros | Migros deals hidden | |
| T13 | Remove item from edit screen | Go to /onboarding?edit=, tap × | Item disappears from list | |
| T14 | Empty list → browse CTA | Remove all items from edit screen | "Browse deals to add items" button appears | |
| T15 | Mobile layout | Test on phone | No horizontal scroll, touch targets work | |

---

## Known issues (as of 21 April 2026)

| Issue | Where | Workaround |
|-------|-------|------------|
| Remove (×) on edit screen occasionally fails silently | /onboarding?edit= | A toast message now shows the error — please report the exact text you see |
| Some products have no image | Deal cards everywhere | Shows store initial letter as placeholder — expected |
| Category assignment is automatic — some items may be miscategorised | Comparison page | Tap the category label under the item name to correct it manually |
| Deals data updates every Thursday evening — may show last week's data until then | Everywhere | A "data freshness" indicator shows when it was last updated |

---

## What to report

Please note for each issue:
1. Which page / URL you were on
2. What you tapped or did
3. What you expected to happen
4. What actually happened
5. Device and browser (e.g. iPhone 15, Safari)

Send to Kiran via WhatsApp or email.

---

## The 3 URLs to test

| URL | What it is |
|-----|-----------|
| https://basketch.vercel.app | Homepage — weekly verdict |
| https://basketch.vercel.app/deals | Deals page — browse and add items |
| https://basketch.vercel.app/compare/f9195c8a-f254-4b61-b04b-485bcf510034 | Example comparison page (Kiran's list) |

---

## Quick flow summary

```
Open /deals
    ↓
Browse deals by category / store
    ↓
Tap + on items you buy regularly
    ↓
Sticky bar appears: "X items in your list →"
    ↓
Tap it → your /compare/:id page
    ↓
Bookmark that page for next week
    ↓
Share via Copy link or Share button
```

---

*Thank you for testing! Your feedback directly shapes what gets built next.*
