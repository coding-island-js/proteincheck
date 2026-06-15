// Anonymous, aggregate-only usage stats for the protein tool.
//
// Privacy by design: we keep ONE rolling aggregate document — running sums,
// threshold hit-counts, and a coarse protein histogram. No photo, no per-meal
// record, no timestamp beyond first/last day, no IP, no identifier. This is
// genuinely non-personal statistical data and matches what the privacy policy
// already discloses (we keep only the derived estimate). It powers the citable
// /data page — original, proprietary stats are the strongest AI-citation magnet
// and a real moat. See [[proteincheck-seo]].
import { SITE_ID } from './blog.mjs';

const STORE = 'stats';
const AGG = 'agg';
const BUCKET = 5; // protein histogram bucket size, grams
const MAX_P = 300; // ignore absurd values so one bad estimate can't skew the set

// Show real numbers + index the page only once we have a credible sample.
export const MIN_PUBLISH = 100;

async function statsStore() {
  const { getStore } = await import('@netlify/blobs');
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID || SITE_ID;
  if (token) return getStore({ name: STORE, siteID, token });
  return getStore(STORE);
}

const empty = () => ({
  count: 0,
  sumP: 0,
  sumL: 0,
  sumItems: 0,
  hitLeu: 0, // meals reaching the ~2.5 g leucine threshold
  hit20: 0, // meals with >= 20 g protein
  hit30: 0, // meals with >= 30 g protein
  hist: {}, // protein histogram: { bucketFloor: count }
  firstDay: null,
  lastDay: null,
});

// Fold one completed analysis into the aggregate. Never throws — the user's
// result must return even if stats can't be written.
export async function recordCheck({ protein, leucine, items }) {
  const p = Number(protein);
  if (!Number.isFinite(p) || p <= 0 || p > MAX_P) return; // no food / garbage
  const l = Number.isFinite(Number(leucine)) ? Math.max(0, Number(leucine)) : 0;
  const n = Number.isFinite(Number(items)) ? Math.max(0, Math.min(50, Math.round(Number(items)))) : 0;
  try {
    const s = await statsStore();
    const a = (await s.get(AGG, { type: 'json' })) || empty();
    a.count++;
    a.sumP += p;
    a.sumL += l;
    a.sumItems += n;
    if (l >= 2.5) a.hitLeu++;
    if (p >= 20) a.hit20++;
    if (p >= 30) a.hit30++;
    const b = Math.min(100, Math.floor(p / BUCKET) * BUCKET);
    a.hist[b] = (a.hist[b] || 0) + 1;
    const day = new Date().toISOString().slice(0, 10);
    a.firstDay = a.firstDay || day;
    a.lastDay = day;
    await s.setJSON(AGG, a);
  } catch {
    // swallow — stats are best-effort
  }
}

// Derived, presentation-ready stats for the /data page. Returns {count:0} when
// empty so the page can render a graceful "gathering data" state.
export async function getStats() {
  let a = null;
  try {
    a = await (await statsStore()).get(AGG, { type: 'json' });
  } catch {
    a = null;
  }
  if (!a || !a.count) return { count: 0 };

  const buckets = Object.keys(a.hist).map(Number).sort((x, y) => x - y);
  let cum = 0;
  let medianFloor = buckets[0] || 0;
  for (const bk of buckets) {
    cum += a.hist[bk];
    if (cum >= a.count / 2) { medianFloor = bk; break; }
  }
  const max = Math.max(1, ...buckets.map((bk) => a.hist[bk]));
  const dist = buckets.map((bk) => ({
    label: bk >= 100 ? '100 g+' : `${bk}–${bk + BUCKET} g`,
    n: a.hist[bk],
    pct: Math.round((a.hist[bk] / a.count) * 100),
    barPct: Math.round((a.hist[bk] / max) * 100),
  }));

  return {
    count: a.count,
    meanP: Math.round(a.sumP / a.count),
    meanL: Math.round((a.sumL / a.count) * 10) / 10,
    meanItems: Math.round((a.sumItems / a.count) * 10) / 10,
    pctLeu: Math.round((a.hitLeu / a.count) * 100),
    pct20: Math.round((a.hit20 / a.count) * 100),
    pct30: Math.round((a.hit30 / a.count) * 100),
    medianRange: medianFloor >= 100 ? '100 g+' : `${medianFloor}–${medianFloor + BUCKET} g`,
    dist,
    firstDay: a.firstDay,
    lastDay: a.lastDay,
  };
}
