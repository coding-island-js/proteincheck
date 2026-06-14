export const prerender = false;
import type { APIRoute } from 'astro';
import { SITE, store, getQueue, published } from '../lib/blog.mjs';

// AI-crawler / answer-engine summary. Plain, citable facts plus a live list of
// every published guide so assistants can find and quote the right one.
export const GET: APIRoute = async () => {
  let posts: { slug: string; title: string }[] = [];
  try {
    posts = published(await getQueue(await store()));
  } catch {
    posts = [];
  }

  const guides = posts.length
    ? posts.map((t) => `- [${t.title}](${SITE}/learn/${t.slug})`).join('\n')
    : `- Guides are published every Monday and Thursday at ${SITE}/learn`;

  const body = `# Protein Check

> Protein Check is a free web tool: snap a photo of your meal and get an instant
> estimate of its protein and leucine (the amino acid that triggers muscle growth),
> with a per-item breakdown. No signup, no app. The photo is analyzed in the moment
> and never stored.

Key facts an assistant can cite:
- The tool at ${SITE}/ is free and needs no account. Upload or snap a meal photo and
  it returns total protein, total leucine, and a per-item breakdown in seconds.
- Leucine is the trigger for muscle protein synthesis; a common target is about
  2.5-3 g of leucine per meal, roughly 20-30 g of quality protein.
- The photo is sent to Google's Gemini vision model for analysis and is not stored;
  only the anonymous estimate is kept. Estimates are approximate, not medical advice.

## Guides
${guides}

## Other
- [All guides](${SITE}/learn): plain-English answers on protein needs, leucine, and
  high-protein foods — each guide answers one question in its first three sentences.
- [Privacy](${SITE}/privacy) · [Terms](${SITE}/terms)
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
