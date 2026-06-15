// Privacy-light visitor analytics (Netlify Blobs, store "analytics").
// One doc per day: { visits, devices{id->{e}}, sources{}, referrers{}, pages{} }.
// deviceId is a random token in the visitor's browser — no PII, no IP stored, no
// cross-site tracking. Strong consistency avoids read-modify-write races.
// Mirrors the admin pattern from ComputerVision-pickleball + unbrokenday.
import { SITE_ID } from './blog.mjs';

const MAP_CAP = 300; // cap distinct keys per map/day to bound doc size
const OUR_HOST = 'proteincheck.withmagic.ai';
const SEARCH_HOSTS = ['google.', 'bing.', 'duckduckgo', 'yahoo.', 'ecosia.', 'yandex.', 'baidu.', 'brave.', 'qwant.', 'startpage.'];
const SOCIAL_HOSTS = ['reddit.', 't.co', 'twitter.', 'x.com', 'facebook.', 'fb.', 'instagram.', 'youtube.', 'youtu.be', 'linkedin.', 'lnkd.', 'tiktok.', 'pinterest.', 'threads.', 'telegram.', 't.me', 'discord.', 'quora.', 'mastodon', 'bsky.'];

export async function analyticsStore() {
  const { getStore } = await import('@netlify/blobs');
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID || SITE_ID;
  if (token) return getStore({ name: 'analytics', siteID, token, consistency: 'strong' });
  return getStore({ name: 'analytics', consistency: 'strong' });
}

export const today = () => new Date().toISOString().slice(0, 10);

export function refHost(ref) {
  if (!ref) return '';
  try {
    return new URL(ref).hostname.toLowerCase().replace(/^www\./, '').slice(0, 80);
  } catch {
    return '';
  }
}

export function pageKind(path) {
  const p = (path || '/').toLowerCase();
  if (p.startsWith('/learn')) return 'blog';
  if (p === '/' || p === '') return 'tool';
  return 'other';
}

export function normPath(path) {
  let p = String(path || '/').split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = '/' + p;
  return p.slice(0, 100);
}

// Bucket a visit into a traffic source. UTM (if present) wins over referrer host.
export function sourceBucket(host, utm) {
  const src = utm && String(utm.source || '').toLowerCase();
  const med = utm && String(utm.medium || '').toLowerCase();
  if (src || med) {
    if (/cpc|ppc|paid|ads?/.test(med)) return 'paid';
    if (/social/.test(med) || SOCIAL_HOSTS.some((h) => src.includes(h.replace(/\.$/, '')))) return 'social';
    if (/email|newsletter/.test(med)) return 'email';
    if (/organic|search/.test(med) || SEARCH_HOSTS.some((h) => src.includes(h.replace(/\.$/, '')))) return 'search';
    return 'campaign';
  }
  if (!host) return 'direct';
  if (host === OUR_HOST) return 'internal';
  if (SEARCH_HOSTS.some((h) => host.startsWith(h) || host.includes(h))) return 'search';
  if (SOCIAL_HOSTS.some((h) => host === h || host.startsWith(h) || host.includes(h))) return 'social';
  return 'referral';
}

export function bump(map, key, n = 1) {
  if (!key) return;
  if (map[key] != null) map[key] += n;
  else if (Object.keys(map).length < MAP_CAP) map[key] = n;
}

export async function getDay(s, date) {
  const day = (await s.get(`day:${date}`, { type: 'json' })) || {
    date,
    visits: 0,
    devices: {},
    sources: {},
    referrers: {},
    pages: {},
  };
  day.devices ||= {};
  day.sources ||= {};
  day.referrers ||= {};
  day.pages ||= {};
  return day;
}

export function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify(body),
  };
}
