export const prerender = false;
import type { APIRoute } from 'astro';
import { store, getOg } from '../../../lib/blog.mjs';

// Serves the nano-banana hero/OG image for an article from Netlify Blobs.
// Falls back to the site default /og.png when an article has no generated image.
export const GET: APIRoute = async ({ params, redirect }) => {
  const slug = params.slug;
  try {
    const s = await store();
    const bytes = slug ? await getOg(s, slug) : null;
    if (bytes) {
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  } catch {
    // fall through to the default image
  }
  return redirect('/og.png', 302);
};
