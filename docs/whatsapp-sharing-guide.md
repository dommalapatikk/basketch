# WhatsApp Sharing: How It Works for basketch

A plain-English guide for the PM. No code, just concepts and decisions.

---

## 1. What happens today when someone shares a basketch link on WhatsApp (without OG tags)?

Right now, if Sarah copies `basketch.ch/compare/abc-123` and pastes it into her family WhatsApp group, everyone sees this:

```
basketch.ch/compare/abc-123
```

That's it. A bare, ugly, meaningless URL. No preview. No image. No context.

Nobody in the group knows what they're looking at. Nobody taps it. The message gets buried under the next photo of Oma's garden.

**This is the default for any website that doesn't set up "previews."** WhatsApp doesn't know what your page is about, so it shows nothing.

---

## 2. What happens when OG tags are added?

OG tags ("Open Graph tags") are invisible labels you put on each page. They tell WhatsApp (and every other messaging app, plus Facebook, LinkedIn, Twitter) three things:

- **Title** -- what the page is called
- **Description** -- one sentence about what's on the page
- **Image** -- a picture to show in the preview (1200x630 pixels, the standard size)

Once these are in place, when Sarah shares `basketch.ch/compare/abc-123`, her group sees:

```
┌─────────────────────────────────────────┐
│  [Image: basketch logo + "Your weekly   │
│   grocery deals, compared"]             │
│                                         │
│  Sarah's Weekly Deals -- basketch       │
│  This week: 14 Migros deals, 11 Coop   │
│  deals across your favorites.           │
│                                         │
│  basketch.ch                            │
└─────────────────────────────────────────┘
```

Now it's a rich preview card. There's context. There's a picture. There's a reason to tap.

**This is already in your PRD** (the "Social sharing (OG meta tags)" requirement). It's standard practice. Every serious website does this.

---

## 3. The "Wordle card" idea -- what is it?

### How Wordle went viral

Wordle didn't go viral because people shared links. It went viral because people shared **screenshots**.

After completing the daily puzzle, Wordle showed you a grid of colored squares:

```
Wordle 892  4/6

⬜🟨⬜⬜⬜
⬜⬜🟩⬜🟨
🟩🟩🟩⬜🟩
🟩🟩🟩🟩🟩
```

This little card was designed to be screenshotted. People posted it in WhatsApp groups, on Twitter, on Instagram Stories. The genius:

- **You see the result without tapping anything.** The information IS the share.
- **It's visual and glanceable.** Green squares = good. You get it instantly.
- **It invites comparison.** "I got it in 3!" "I needed 5..." People start competing.
- **It's branded.** Everyone knows what those colored squares mean. It's unmistakably Wordle.

### What the basketch equivalent would look like

Imagine Sarah opens basketch and sees her weekly verdict. Below the verdict, there's a card designed specifically to look good as a screenshot:

```
┌──────────────────────────────────────────────┐
│                                              │
│  basketch -- This Week's Verdict             │
│  Week of 7 April 2026                        │
│                                              │
│  🟠 MIGROS leads Fresh                       │
│     12 deals  |  avg 28% off                 │
│                                              │
│  🔴 COOP leads Household                     │
│     8 deals  |  avg 35% off                  │
│                                              │
│  ⚖️  Tied on Snacks & Drinks                 │
│     5 deals each                             │
│                                              │
│  basketch.ch -- your weekly grocery deals    │
│                                              │
└──────────────────────────────────────────────┘
```

Sarah screenshots this. She posts it in her family WhatsApp group with "Check this out -- Coop is killing it on cleaning products this week!"

Her mother sees the card. She doesn't need to tap a link. She doesn't need to visit a website. The information is right there in the image. But the branding "basketch.ch" is on the card, so anyone curious can find the site.

---

## 4. The two sharing approaches

There are two fundamentally different ways people share things on WhatsApp. They serve different purposes.

### Approach A: Link sharing

**How it works:**
1. Sarah taps a "Share" button on basketch
2. Her phone's share menu opens (WhatsApp, Messages, Email, etc.)
3. She picks WhatsApp and picks her family group
4. The link is sent -- and thanks to OG tags, it shows a rich preview card
5. Her mother taps the link and opens basketch in her browser

**What the recipient gets:** A preview card that acts as an invitation. They must tap to see the full content.

**The key behavior:** The link is the hook. The website is the payoff. You're driving traffic back to basketch.

### Approach B: Screenshot sharing (the "Wordle card")

**How it works:**
1. Sarah sees her weekly verdict on basketch
2. The verdict is displayed as a beautiful, self-contained visual card
3. Sarah takes a screenshot (or taps a "Copy card" button)
4. She posts the screenshot image in her WhatsApp group
5. Everyone in the group sees the verdict without tapping anything

**What the recipient gets:** The actual information, right there in the image. No tapping required.

**The key behavior:** The image IS the content. The basketch branding on the card is the only bridge back to the website.

---

## 5. What needs to be built for each?

### For link sharing (Approach A)

Two things:

1. **OG meta tags on every page** -- Already in your PRD. These are the invisible labels that tell WhatsApp what to show in the preview. Title, description, image. Standard web practice.

2. **A "Share" button** -- Uses something called the "Web Share API," which is a built-in phone feature. When the user taps it, their phone's native share menu appears (WhatsApp, Messages, etc.). No special WhatsApp integration needed -- the phone handles it.

**Effort:** Small. This is standard website work. Every web developer knows how to do it.

### For screenshot sharing (Approach B -- the Wordle card)

This needs more design thinking:

1. **A "verdict card" component** -- A visual summary of the weekly verdict, designed as a standalone card. It needs to:
   - Have specific dimensions that look good on phone screens
   - Use high contrast colors (it will be compressed by WhatsApp's image compression)
   - Include basketch branding (so people know where it came from)
   - Be readable at small sizes (WhatsApp shrinks images in group chats)
   - Look good on both light and dark backgrounds

2. **The card needs to be self-contained** -- Someone seeing only the screenshot (no link, no website) should understand: what store is winning, in what category, by how much. The information stands on its own.

3. **Optional: a "Copy card" button** -- Instead of requiring a screenshot, you could let users tap a button that copies the card image to their clipboard. Then they just paste into WhatsApp. Slightly more polished than screenshotting.

**Effort:** Medium. The hard part is design, not engineering. The card needs to look great, be readable after WhatsApp compression, and contain enough info to be useful without being cluttered.

---

## 6. Which is more powerful for growth, and why?

**Screenshot sharing (the Wordle card) is significantly more powerful.** Here's why:

### Link sharing has a conversion problem

With link sharing, the journey is:
1. Sarah shares a link (she's already engaged -- good)
2. Her mother sees the preview in WhatsApp
3. Her mother must **decide to tap the link** (friction point)
4. The browser opens basketch (loading time, possible confusion)
5. Her mother sees the comparison page

Every step loses people. Industry data says only 10-20% of people who see a shared link actually tap it. In a family WhatsApp group where messages fly by, it's probably lower.

### Screenshot sharing has zero friction

With screenshot sharing, the journey is:
1. Sarah posts a screenshot of her verdict card
2. Everyone in the group **sees the information immediately**

That's it. There's no step 3. No tapping, no loading, no conversion funnel. The information is consumed the moment they glance at the image.

### Why this matters specifically for basketch

Think about what basketch delivers: **"Who's winning this week -- Migros or Coop?"**

This is inherently shareable *as a statement*, not as a link. It's like the weather or a sports score. You don't share a link to the weather app -- you say "It's going to rain tomorrow." Similarly, the verdict card says "Migros is winning on fresh this week" and that IS the value.

### The Wordle lesson

Wordle's screenshot sharing created three things that link sharing never could:

1. **Ambient awareness** -- People who never played Wordle saw the green squares everywhere. They knew it existed. For basketch: people who never visit the site see the verdict card in their family group and learn that Migros vs Coop comparisons exist.

2. **Social ritual** -- Wordle became a daily group ritual. For basketch: the weekly verdict card could become a Sunday evening ritual in Swiss family groups. "Here's this week's deals before you shop."

3. **Effortless distribution** -- The person sharing does minimal work (screenshot and send). The recipients do zero work (just look at the image). For basketch: Sarah screenshots in 2 seconds, 15 family members see it instantly.

### The recommendation

**Build both, but prioritize the screenshot card.**

- OG tags (link sharing) are table stakes -- do them because every website should have them.
- The verdict card (screenshot sharing) is the growth engine -- this is what could make basketch spread through Swiss WhatsApp groups the way Wordle spread through the world.

The verdict card is also a forcing function for good product design. If you can summarize the weekly verdict in a single, beautiful, glanceable card -- your product's value proposition is crystal clear.

---

## Summary

| | Link sharing | Screenshot sharing |
|---|---|---|
| What the user does | Taps "Share," sends link | Screenshots verdict card, posts image |
| What recipient sees | Preview card (must tap to see content) | The full verdict (no tap needed) |
| Friction | Medium (must tap link, load page) | Zero (just look at the image) |
| Drives traffic to basketch? | Yes, directly | Indirectly (branding on card) |
| Viral potential | Low-medium | High (Wordle-style) |
| Build effort | Small (standard OG tags + share button) | Medium (design-focused verdict card) |
| Growth mechanism | Click-through | Ambient awareness + social ritual |
