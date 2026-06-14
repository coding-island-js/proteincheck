#!/usr/bin/env node
// One-off launch seeder for the /learn blog. Loads content/topics.json into the
// production Netlify Blobs queue, then runs the publisher N times to generate the
// launch batch (text + nano-banana images) immediately so /learn isn't empty.
// The Mon/Thu scheduled function takes over from there.
//
//   node scripts/seed-blog.mjs          # queue topics + publish 6
//   node scripts/seed-blog.mjs 3        # queue topics + publish 3
//   node scripts/seed-blog.mjs 0        # just (re)seed the queue, publish none
//
// Needs (from web/.env or ../../.env.master): GEMINI_API_KEY and a Netlify token
// (NETLIFY_API_TOKEN or NETLIFY_AUTH_TOKEN) so it can write to prod Blobs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(ROOT, '.env'));
loadEnv(path.join(ROOT, '..', '..', '.env.master'));

const ARGV = process.argv.slice(2);
const FRESH = ARGV.includes('--fresh'); // wipe the whole blog store before seeding
const N = (() => {
  const num = ARGV.find((a) => /^\d+$/.test(a));
  return num != null ? parseInt(num, 10) : 6;
})();

const { store, setQueue, getQueue, published } = await import('../src/lib/blog.mjs');
const { run } = await import('../netlify/functions/publish-blog.mjs');

if (!process.env.NETLIFY_API_TOKEN && !process.env.NETLIFY_AUTH_TOKEN) {
  console.error('Missing NETLIFY_API_TOKEN / NETLIFY_AUTH_TOKEN — needed to write prod Blobs.');
  process.exit(1);
}
if (N > 0 && !process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY — needed to generate articles.');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'topics.json'), 'utf8'));
const s = await store();

// --fresh: wipe every key in the store (queue, body:*, og:*) for a clean launch.
if (FRESH) {
  let removed = 0;
  const { blobs } = await s.list();
  for (const b of blobs) {
    await s.delete(b.key);
    removed++;
  }
  console.log(`Wiped ${removed} blob(s) from the store.`);
}

// Merge: keep already-published items, (re)queue any new topics from the file.
const existing = await getQueue(s);
const bySlug = new Map(existing.map((t) => [t.slug, t]));
const merged = seed.topics.map((t) => bySlug.get(t.slug) || t);
await setQueue(s, merged);
console.log(`Queue seeded: ${merged.length} topics (${published(merged).length} already published).`);

for (let i = 0; i < N; i++) {
  const r = await run();
  console.log(`  [${i + 1}/${N}] ${r.body}`);
  if (r.body === 'queue empty') break;
}

const final = published(await getQueue(s));
console.log(`\nDone. ${final.length} published. Visit /learn to see them.`);
