export const prerender = false;
import type { APIRoute } from 'astro';
import { analyticsStore, today, getDay } from '../../lib/analytics.mjs';
import { getStats } from '../../lib/stats.mjs';

const R = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const sortDesc = (obj: Record<string, number>) =>
  Object.entries(obj).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);

// POST { token, action:"forget", deviceId } — drop a device from recent days.
export const POST: APIRoute = async ({ request }) => {
  const admin = process.env.ADMIN_TOKEN;
  if (!admin) return R({ error: 'Server missing ADMIN_TOKEN.' }, 500);
  let body: any = {};
  try { body = await request.json(); } catch {}
  if (body.token !== admin) return R({ error: 'Unauthorized' }, 401);
  if (body.action !== 'forget') return R({ error: 'Unknown action' }, 400);
  const id = String(body.deviceId || '').slice(0, 64);
  if (!id) return R({ error: 'Missing deviceId' }, 400);
  try {
    const s = await analyticsStore();
    const base = Date.parse(today() + 'T00:00:00Z');
    for (let i = 0; i < 30; i++) {
      const d = new Date(base - i * 86400000).toISOString().slice(0, 10);
      const day = await getDay(s, d);
      if (day.devices[id]) {
        delete day.devices[id];
        await s.setJSON(`day:${d}`, day);
      }
    }
  } catch {}
  return R({ ok: true });
};

// GET ?token=ADMIN_TOKEN&days=14 — visitor + meal aggregates.
export const GET: APIRoute = async ({ url }) => {
  const admin = process.env.ADMIN_TOKEN;
  if (!admin) return R({ error: 'Server missing ADMIN_TOKEN.' }, 500);
  if (url.searchParams.get('token') !== admin) return R({ error: 'Unauthorized' }, 401);

  let meals: any = { count: 0 };
  try { meals = await getStats(); } catch {}

  let s;
  try { s = await analyticsStore(); } catch {
    return R({ degraded: true, totals: { visits: 0, unique: 0 }, days: [], meals });
  }

  const n = Math.min(parseInt(url.searchParams.get('days') || '14', 10) || 14, 60);
  const base = Date.parse(today() + 'T00:00:00Z');
  const days: any[] = [];
  const sources: Record<string, number> = {};
  const referrers: Record<string, number> = {};
  const pages: Record<string, number> = {};
  let tVisits = 0, tUnique = 0;
  const add = (into: Record<string, number>, from: Record<string, number>) => {
    for (const k in (from || {})) into[k] = (into[k] || 0) + from[k];
  };

  for (let i = 0; i < n; i++) {
    const d = new Date(base - i * 86400000).toISOString().slice(0, 10);
    const day = await getDay(s, d);
    const unique = Object.keys(day.devices).length;
    tVisits += day.visits;
    tUnique += unique;
    add(sources, day.sources);
    add(referrers, day.referrers);
    add(pages, day.pages);
    let blogViews = 0;
    for (const p in day.pages) if (p.startsWith('/learn')) blogViews += day.pages[p];
    days.push({ date: d, visits: day.visits, unique, blogViews });
  }

  return R({
    generated: today(),
    totals: { visits: tVisits, unique: tUnique },
    days,
    sources,
    referrers: sortDesc(referrers).slice(0, 12),
    pages: sortDesc(pages).slice(0, 12),
    meals,
  });
};
