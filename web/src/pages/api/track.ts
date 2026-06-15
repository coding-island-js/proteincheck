export const prerender = false;
import type { APIRoute } from 'astro';
import {
  analyticsStore,
  today,
  getDay,
  refHost,
  pageKind,
  normPath,
  sourceBucket,
  bump,
} from '../../lib/analytics.mjs';

const R = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Privacy-light visit beacon. Runs in the Astro SSR function, which has the
// Netlify Blobs context (classic standalone functions here do not).
export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const deviceId = String(body.deviceId || '').slice(0, 64) || 'anon';

  let s;
  try { s = await analyticsStore(); } catch { return R({ ok: true, degraded: true }); }

  const date = today();
  const day = await getDay(s, date);
  const firstSeen = !day.devices[deviceId];
  const path = normPath(body.path);

  day.visits += 1;
  bump(day.pages, path);
  if (firstSeen) {
    day.devices[deviceId] = { e: pageKind(path) };
    const host = refHost(body.ref);
    const src = sourceBucket(host, body.utm);
    bump(day.sources, src);
    if (host && src !== 'internal') bump(day.referrers, host);
  }

  await s.setJSON(`day:${date}`, day);
  return R({ ok: true, unique: Object.keys(day.devices).length });
};
