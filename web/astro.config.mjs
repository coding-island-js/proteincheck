// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// Static by default; only the /learn blog routes, sitemap, llms.txt and the OG
// image endpoint opt into on-demand rendering (export const prerender = false).
// Those read articles live from Netlify Blobs, so new posts go live with no
// rebuild — the Mon/Thu scheduled function just writes to Blobs.
// https://astro.build/config
export default defineConfig({
  site: 'https://proteincheck.withmagic.ai',
  adapter: netlify(),
});
