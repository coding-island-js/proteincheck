export const prerender = false;
import type { APIRoute } from 'astro';
import { SITE, store, getQueue, published, today } from '../lib/blog.mjs';

export const GET: APIRoute = async () => {
  let posts: { slug: string; published?: string }[] = [];
  try {
    const s = await store();
    posts = published(await getQueue(s));
  } catch {
    posts = [];
  }

  const urls = [
    { loc: `${SITE}/`, pri: '1.0' },
    { loc: `${SITE}/learn`, pri: '0.8' },
    ...posts.map((t) => ({ loc: `${SITE}/learn/${t.slug}`, pri: '0.7', lastmod: t.published })),
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
