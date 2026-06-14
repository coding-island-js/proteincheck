# Protein Check — keyword & SEO strategy

The blog at `/learn` exists to capture **long-tail, high-intent protein questions** and
funnel readers into the meal-photo tool. Every guide answers ONE real query.

## The rules that win

1. **The H1 is the exact query.** Titles in `topics.json` are written the way people
   type or speak them ("How much protein is in a chicken breast?"), not clever headlines.
2. **Answer-first (AEO).** The first 2-3 sentences answer the question and contain the
   number. That's the block Google lifts into a Featured Snippet and that ChatGPT/Gemini/
   Perplexity quote. Enforced in the writer prompt.
3. **One long-tail FAQ per page** → `FAQPage` schema → "People Also Ask" + AI answers.
4. **Structured data on every page:** `BreadcrumbList + Article + HowTo + FAQPage`.
5. **Cluster interlinking.** Each guide links its siblings (computed live), so authority
   flows across the cluster and crawlers find everything.
6. **Fresh `dateModified`** on every render, dynamic `sitemap.xml`, and `llms.txt` for
   AI crawlers.

## Clusters (topic → tool fit)

| Cluster | Angle | Funnel fit |
|---|---|---|
| `daily-protein` | how much per day / per meal / to build muscle / women / older adults | H |
| `leucine` | what it is, threshold, foods, vs BCAA | H |
| `high-protein-foods` | "how much protein in X", highest, cheapest, snacks, add more | H |
| `weight-loss` | protein to lose weight, snacks, lean foods, belly fat | H |
| `plant-based` | vegetarian/vegan, tofu, lentils, complete protein, powders | H |
| `timing` | shake before/after, breakfast, before bed, spread across day | M |

## Long-tail patterns that consistently rank (use for new topics)

- `how much protein in [food]?` — chicken, egg, tofu, peanut butter, lentils, yogurt,
  cottage cheese, salmon, steak, oats, milk, shrimp, tuna... (one per food = one page)
- `how much protein [for X]?` — to lose weight, to build muscle, per kg, for women,
  over 50, for runners, on a cut
- `is [food] high in protein?` / `is [food] a complete protein?`
- `best [X] protein` — vegan, cheap, snacks, breakfast, lean
- `[A] vs [B]` — whey vs plant, shake vs food, leucine vs BCAA, one vs two scoops
- `signs / myths / mistakes` — evergreen, high CTR

## Validated numbers (from research, June 2026 — keep the writer honest)

- Sedentary RDA ~0.8 g/kg; muscle ~1.6 g/kg; cutting ~1.8-2.2 g/kg; older adults 1.2-1.6 g/kg.
- Leucine threshold ~2.5 g (younger) to ~3 g (older) per meal. Whey ~10-11% leucine.
- Per meal target ~20-40 g protein. Chicken breast (170g) ~50 g. Egg ~6 g. Firm tofu ~9 g/100g
  (~20 g per half block). Greek yogurt ~10 g/100g (6oz ~18 g). Cottage cheese ~11 g/100g.
  Lentils ~9 g/half-cup. Peanut butter ~4 g/tbsp.

## How to expand (the "see what's ranking" loop)

1. Pick a cluster with traffic. Search the seed query, read **People Also Ask** + the
   "related searches" footer — those are free long-tail topics.
2. Add each as a new `topics.json` row (status `queued`) with a real `anchor` number.
3. The Mon/Thu cron drains the queue 2/page-a-week; reorder to prioritize.
4. After ~4 weeks, check Search Console for queries we rank #5-15 for and write the
   dedicated page that pushes them to #1-3.
