export const prerender = false;
import type { APIRoute } from 'astro';
import { SITE, store, getQueue, published, today } from '../lib/blog.mjs';
import { getStats, MIN_PUBLISH } from '../lib/stats.mjs';

export const GET: APIRoute = async () => {
  let posts: { slug: string; published?: string }[] = [];
  try {
    const s = await store();
    posts = published(await getQueue(s));
  } catch {
    posts = [];
  }

  // Only list /data once it shows real, indexable numbers (it self-noindexes below
  // the threshold, so it shouldn't be in the sitemap before then).
  let dataStats: { count: number; lastDay?: string } = { count: 0 };
  try {
    dataStats = await getStats();
  } catch {
    dataStats = { count: 0 };
  }

  const urls = [
    { loc: `${SITE}/`, pri: '1.0' },
    { loc: `${SITE}/learn`, pri: '0.8' },
    ...posts.map((t) => ({ loc: `${SITE}/learn/${t.slug}`, pri: '0.7', lastmod: t.published })),
    ...(dataStats.count >= MIN_PUBLISH
      ? [{ loc: `${SITE}/data`, pri: '0.6', lastmod: dataStats.lastDay }]
      : []),
    { loc: `${SITE}/about`, pri: '0.5' },
    { loc: `${SITE}/privacy`, pri: '0.3' },
    { loc: `${SITE}/terms`, pri: '0.3' },
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc}</loc>` +
          ((u as any).lastmod ? `<lastmod>${(u as any).lastmod}</lastmod>` : `<lastmod>${today()}</lastmod>`) +
          `<priority>${u.pri}</priority></url>`
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
