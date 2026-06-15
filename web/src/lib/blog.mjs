// Shared content layer for the dynamic /learn blog.
//
// Source of truth = Netlify Blobs (store "blog"):
//   queue        -> JSON array of topics {slug,cluster,pillar?,fit,title,intent,anchor,status,published?}
//   body:<slug>  -> JSON of the Gemini article body (see shape in publish-blog.mjs)
//   og:<slug>    -> raw PNG bytes for the article's nano-banana hero/OG image
//
// Cross-links + cluster lists are computed LIVE from the queue on every render,
// so they're always complete + bidirectional with zero upkeep. Imported by both
// the scheduled function (writes) and the Astro /learn routes (reads).

export const SITE = 'https://proteincheck.withmagic.ai';
export const SITE_NAME = 'Protein Check';
export const SITE_ID = 'adf1181c-6d66-4f0b-8704-b4d9f71624c8';
export const AUTHOR = { name: 'Raj Lakhani', url: `${SITE}/about` };

// Human label per cluster, shown as section headings on the /learn hub.
export const CLUSTERS = {
  leucine: 'Leucine & muscle growth',
  'daily-protein': 'How much protein you need',
  'high-protein-foods': 'High-protein foods',
  'weight-loss': 'Protein for fat loss',
  'plant-based': 'Plant-based protein',
  timing: 'Timing & recovery',
};

// ---- tiny helpers ----
export const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const today = () => new Date().toISOString().slice(0, 10);
export const monthYear = () =>
  new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
// Honest, human date from a stored ISO date (e.g. "June 14, 2026"). No "today()"
// fallbacks in the UI — we show the real publish/update date, not the render date.
export const fmtDate = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';
// Real reading time from the article body (~200 wpm), so "N min read" is honest.
export function readMins(body) {
  const text = [
    body.answer,
    ...(body.sections || []).map((s) => s.body),
    ...(body.faqs || []).map((f) => f.a),
    ...(body.foods || []).map((f) => `${f.name} ${f.serving || ''}`),
  ]
    .join(' ')
    .trim();
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
}

// Curated, hand-verified authoritative references (all return 200). Citing real
// sources is both an E-E-A-T trust signal and the top measured lever for being
// cited by AI answer engines — and using a fixed allowlist means the pipeline can
// never hallucinate a fake study or dead URL.
export const SOURCES = {
  usda: {
    label: 'USDA FoodData Central — protein values for foods',
    url: 'https://fdc.nal.usda.gov/',
  },
  medline: {
    label: 'MedlinePlus (U.S. National Library of Medicine) — Dietary proteins',
    url: 'https://medlineplus.gov/dietaryproteins.html',
  },
  issn: {
    label: 'International Society of Sports Nutrition — protein & exercise position stand',
    url: 'https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8',
  },
};
// Pick the 2 most relevant references for an article from its cluster.
export function sourcesFor(topic) {
  const food = ['high-protein-foods', 'plant-based', 'weight-loss'].includes(topic.cluster);
  return food ? [SOURCES.usda, SOURCES.medline] : [SOURCES.issn, SOURCES.medline];
}

// ---- Netlify Blobs ----
// In production on Netlify the runtime injects context, so getStore("blog") just
// works. Local scripts / netlify dev pass an explicit token + siteID.
export async function store() {
  const { getStore } = await import('@netlify/blobs');
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID || SITE_ID;
  if (token) return getStore({ name: 'blog', siteID, token });
  return getStore('blog');
}
export async function getQueue(s) {
  return (await s.get('queue', { type: 'json' })) || [];
}
export async function setQueue(s, q) {
  await s.setJSON('queue', q);
}
export async function getBody(s, slug) {
  return await s.get(`body:${slug}`, { type: 'json' });
}
export async function setBody(s, slug, body) {
  await s.setJSON(`body:${slug}`, body);
}
export async function getOg(s, slug) {
  return await s.get(`og:${slug}`, { type: 'arrayBuffer' });
}
export async function setOg(s, slug, bytes) {
  await s.set(`og:${slug}`, bytes);
}

// ---- queue views ----
export const published = (q) => q.filter((t) => t.status === 'published');

// Up to 3 published siblings in the same cluster (excluding self).
export function siblingsFor(topic, q) {
  return published(q)
    .filter((t) => t.cluster === topic.cluster && t.slug !== topic.slug)
    .slice(0, 4)
    .map((t) => ({ slug: t.slug, title: t.title }));
}

// Published topics grouped by cluster, in CLUSTERS order, for the hub.
export function byCluster(q) {
  const pub = published(q);
  return Object.keys(CLUSTERS)
    .map((key) => ({ key, label: CLUSTERS[key], items: pub.filter((t) => t.cluster === key) }))
    .filter((g) => g.items.length);
}

// ---- JSON-LD builders (return plain objects; routes JSON.stringify them) ----
export function breadcrumbLd(crumbTail, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE}/learn` },
      { '@type': 'ListItem', position: 3, name: crumbTail, item: url },
    ],
  };
}
export function articleLd(topic, body, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: topic.title,
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/og.png` },
    },
    description: body.metaDescription,
    image: `${SITE}/learn/og/${topic.slug}.png`,
    url,
    datePublished: topic.published || today(),
    // Real modified date, not the render date — never claim "modified today" on a
    // page that hasn't changed (misleading + risky structured data).
    dateModified: topic.modified || topic.published || today(),
    citation: sourcesFor(topic).map((s) => s.url),
  };
}
// Site-wide identity schema so engines recognize the brand as an entity (helps
// classic rich results + AI source attribution). Rendered on every page.
export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE}/`,
    logo: `${SITE}/og.png`,
    sameAs: ['https://github.com/coding-island-js/proteincheck'],
  };
}
export function websiteLd() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${SITE}/` };
}
export function howToLd(topic, body) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: topic.title,
    description: body.metaDescription,
    step: (body.steps || []).map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.lead,
      text: s.text,
    })),
  };
}
export function faqLd(body) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (body.faqs || []).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// Article archetype, inferred from the title (overridable via topic.type).
// Drives both the writer's structure and the article layout.
//   amount     -> "how much protein..." : lead with the number + how to hit it
//   foodlist   -> "best/highest/cheapest ... foods/sources/snacks" : a ranked food list
//   singlefood -> "how much protein in X / is X high in protein" : serving-size table
//   concept    -> everything else : prose explainer
export function inferType(title, override) {
  if (override) return override;
  const t = String(title).toLowerCase();
  if (/protein (is |are )?in\b/.test(t) || /\bis .+ high in protein\b/.test(t)) return 'singlefood';
  if (
    /\b(foods|sources|snacks)\b/.test(t) ||
    /(highest|cheapest|best|top|lean)\b.*\bprotein\b/.test(t) ||
    /\bbreakfast\b/.test(t)
  )
    return 'foodlist';
  if (/how much protein/.test(t) || /how much .*need/.test(t)) return 'amount';
  return 'concept';
}
export function collectionLd(q) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${SITE_NAME} — Learn`,
    url: `${SITE}/learn`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: published(q).map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE}/learn/${t.slug}`,
        name: t.title,
      })),
    },
  };
}
