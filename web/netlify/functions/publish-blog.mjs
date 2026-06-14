// Scheduled auto-publisher for the /learn blog. Netlify cron Mon + Thu 16:00 UTC
// (9am PT). Picks the next queued topic, asks Gemini for a TYPE-AWARE on-voice
// article (food questions get a real food list, "how much" leads with the number,
// concepts are prose), generates a varied hand-drawn hero image (rotating art
// directions so the set never looks cloned), writes both to Netlify Blobs, marks
// it published, emails Raj. Astro /learn routes render it live — no deploy needed.
import { schedule } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import {
  SITE,
  SITE_NAME,
  store,
  getQueue,
  setQueue,
  setBody,
  setOg,
  today,
  inferType,
} from '../../src/lib/blog.mjs';
import topicsFile from '../../content/topics.json' with { type: 'json' };

const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const ai = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ---------------------------------------------------------------------------
// TEXT
// ---------------------------------------------------------------------------
const TYPE_GUIDE = {
  amount: `This is an AMOUNT question. Lead the "answer" with the exact number and the simple rule (grams per kg per day, or per meal). Fill "quickNumbers" with 2-3 key targets. Include "steps" (3) for how to actually hit it. Add a SECTION with a worked example using real bodyweights (e.g. "A 70 kg / 154 lb person needs about 112 g a day — roughly 30 g at three meals plus a snack"). Only add a tiny "foods" list if it genuinely helps; otherwise omit it.`,
  foodlist: `This is a LIST question. The spine is the "foods" array: 8-12 specific foods, each with a realistic "serving" and "protein" in grams, ordered BEST-FIRST for what the title asks (most protein per serving, or cheapest/leanest/most leucine if the title implies it). Keep "sections" to 1-2 SHORT ones (how to use the list, one real nuance). No "steps". quickNumbers optional.`,
  singlefood: `This is a SINGLE-FOOD question. Answer with the protein for the common serving. The "foods" array holds 3-6 ROWS that are different SERVINGS of this ONE food (e.g. "1 large egg", "2 eggs", "per 100 g"), each with "protein". Add 1-2 SECTIONS for context (how it fits a meal, protein quality / leucine, a smart tip). quickNumbers optional. No "steps".`,
  concept: `This is a CONCEPT/EXPLAINER question. Do NOT include a "foods" table unless it genuinely earns its place. Write 2-4 "sections" with SPECIFIC headings tailored to THIS question — never generic boilerplate. Be concrete, vivid, a little opinionated. Use "steps" only if the topic is truly procedural. "cue" optional.`,
};

const IMG_SUBJECT_GUIDE = {
  amount: 'name 3-5 real high-protein foods this article is about (e.g. "eggs, chicken breast, Greek yogurt").',
  foodlist: 'name 4-6 of the specific foods so the illustration can show a spread of them.',
  singlefood: 'name the one food, e.g. "a single chicken breast".',
  concept:
    'name 3-5 real high-protein foods relevant to this article. Never a metaphor, never bread/rice/pasta or other carbs.',
};

function textPrompt(topic, type) {
  return `You are a sharp, honest nutrition coach who writes the way you talk: plainly, with no fluff. A busy person should get the real answer fast and feel like a knowledgeable friend told them one true thing. Write like a great magazine columnist, not a content mill.

Topic (this is the H1, do not rewrite it): "${topic.title}"
Search intent: ${topic.intent}
The core point to anchor everything to: ${topic.anchor}

ARTICLE TYPE: ${type}
${TYPE_GUIDE[type]}

For "imageSubject": ${IMG_SUBJECT_GUIDE[type]}

Hard rules:
- Answer-first: the "answer" answers the H1 in its first 2-3 sentences and contains the concrete number/fix, so a search engine or AI can quote it verbatim.
- NO formula. Vary your section headings to fit THIS topic; never reuse boilerplate like "Why it matters" or "Who this is for". Cut filler — every sentence must carry a specific fact, number, food, or sharp point. No AI-slop ("unlock", "elevate", "dive in", "game-changer", "in today's fast-paced").
- Real, mainstream nutrition only (e.g. ~1.6 g/kg/day for muscle, ~2.5-3 g leucine per meal, ~20-40 g protein per meal, chicken breast ~31 g/100g, egg ~6 g, firm tofu ~9 g/100g, Greek yogurt ~10 g/100g, lentils ~9 g/half-cup, peanut butter ~4 g/tbsp). Never invent studies or numbers.
- SEO: weave in the exact long-tail phrasing and close variants naturally. The "faqs" are real long-tail follow-ups people search.
- No medical claims. General information, not medical or dietary advice. American spelling. No links, no markdown inside field values.
- EVERY object in "foods" MUST have a non-empty "serving" (the exact portion, e.g. "100 g cooked", "1 large", "1/2 cup") AND a non-empty "protein" in grams. Never omit "serving" — a row without a portion is useless.

Respond with ONLY this JSON, no markdown fence. Omit optional fields you don't use:
{
 "metaDescription": "<=155 chars, plain, includes the key number and long-tail phrasing",
 "crumbTail": "2-3 word lowercase breadcrumb tail",
 "answer": "2-3 sentences answering the H1 with the number/fix",
 "quickNumbers": [{"label":"2-4 word label","value":"the number, e.g. '20-40 g'"}],
 "foods": [{"name":"food or serving name","serving":"the portion, e.g. '100 g cooked' or '1 large'","protein":"grams, e.g. '31 g'"}],
 "sections": [{"h2":"a specific heading for THIS article","body":"1-3 short paragraphs. Separate paragraphs with a blank line."}],
 "steps": [{"lead":"1-3 word step","text":"<=20 words"}],
 "cue": "one memorable line, <=12 words",
 "faqs": [{"q":"a long-tail follow-up question","a":"2-3 sentence answer"}],
 "imageSubject": "3-5 specific REAL foods to illustrate THIS article, comma-separated (e.g. 'eggs, chicken breast, lentils'). Never a metaphor, never bread/rice/pasta/cake or other carbs. Do NOT describe art style or composition."
}
Provide 1-3 faqs and 1-4 sections.`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

function valid(a) {
  return (
    a &&
    typeof a.answer === 'string' &&
    Array.isArray(a.sections) &&
    a.sections.length >= 1 &&
    Array.isArray(a.faqs) &&
    a.faqs.length >= 1
  );
}

async function ask(topic, type) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: textPrompt(topic, type) }] }],
    config: { responseMimeType: 'application/json', temperature: 0.6 },
  });
  const a = parseJson(res.text || '');
  if (!valid(a)) throw new Error('Bad article JSON');
  return a;
}

// Lenient editor pass: tighten voice, kill filler, flag concerns. Non-fatal.
async function review(topic, draft) {
  try {
    const p = `You are a ruthless editor for short nutrition guides. Tighten this DRAFT (JSON) for "${topic.title}": cut filler and boilerplate, make every sentence carry a specific fact or number, kill AI-slop, keep it honest and on real nutrition science, keep section headings specific to this topic. Keep the SAME JSON shape and the same fields. If a field is already good, keep it.

DRAFT:
${JSON.stringify(draft)}

Respond with ONLY JSON: {"body": { ...same shape... }, "flags": ["short concern", ...]} (flags = [] if all good).`;
    const res = await ai().models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: p }] }],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = parseJson(res.text || '');
    if (parsed && valid(parsed.body)) {
      const body = { ...parsed.body };
      if (!body.imageSubject && draft.imageSubject) body.imageSubject = draft.imageSubject;
      return { body, flags: Array.isArray(parsed.flags) ? parsed.flags : [] };
    }
  } catch (e) {
    console.log('review skipped:', e.message);
  }
  return { body: draft, flags: [] };
}

// ---------------------------------------------------------------------------
// IMAGE — ONE consistent, elegant illustrated still life across the whole blog.
// The subject is the article's REAL foods (so the picture always matches the
// words), and a vision QA pass rejects anything with stray text, a wrong/carby
// food, or faces, retrying until it's clean. No archetypes, no metaphors.
// ---------------------------------------------------------------------------

// Foods that must never appear unless the article is literally about them — this
// is the "don't show cake/rice on a high-protein post" guard, used both to scrub
// the subject list and to fail the QA check.
const CARBS = /\b(bread|toast|baguette|bun|roll|pasta|noodle|spaghetti|rice|grain|cereal|oat|cake|pastry|cookie|biscuit|muffin|bagel|pancake|waffle|pizza|potato|fries|chip|crisp|donut|doughnut|croissant|pretzel|cracker|sugar|candy|chocolate|dessert)\b/i;

// Safe, unambiguous high-protein foods to fall back on when an article has no
// food list of its own (most "amount" and "concept" posts), so they still get an
// on-topic, never-carby picture.
const CANON = ['eggs', 'grilled chicken breast', 'Greek yogurt', 'cooked lentils', 'salmon fillet'];

// Decide exactly which foods the illustration shows, drawn from the article body.
function subjectFoods(body, type) {
  const clean = (arr) =>
    [...new Set(arr.map((s) => String(s || '').trim()).filter(Boolean))].filter(
      (s) => !CARBS.test(s)
    );
  if (type === 'foodlist') {
    const f = clean((body.foods || []).map((x) => x.name)).slice(0, 6);
    if (f.length >= 2) return f;
  }
  if (type === 'singlefood') {
    const one = clean([body.imageSubject, ...(body.foods || []).map((x) => x.name)]);
    if (one.length) return one.slice(0, 1);
  }
  // amount / concept / any thin list: writer's named foods, else the safe canon.
  const sub = clean(String(body.imageSubject || '').split(/,|;|\band\b/));
  return (sub.length >= 2 ? sub : CANON).slice(0, 5);
}

const IMG_STYLE =
  'A soft, elegant editorial still-life illustration in ONE consistent style: gentle gouache and colored-pencil painting, muted natural palette (warm cream, sage, clay, soft ochre), delicate visible paper grain, calm even daylight, generous negative space. Grounded and realistic in proportion and color so the foods look like real food, but clearly a tasteful hand painting — NOT a photograph, NOT a 3D render, NOT flat vector, NOT a cartoon. Simple, uncluttered: the foods resting together on a plain pale surface. Every food must read unmistakably as exactly what it is; meats look like real meat (visible grill marks and grain) and must NEVER look like a loaf, bun, or baked dough; nothing in the picture may look bready, baked, or dough-like. NO text, letters, words, numbers, labels, logos, signage or packaging of any kind — foods are loose or in plain unmarked bowls. No people, no faces, no hands.';

// Disambiguate the foods nano-banana most often mis-paints (whole chicken breast
// keeps rendering as a golden braided loaf), so the model draws meat, not bread.
function clarifyFood(name) {
  if (/chicken breast/i.test(name))
    return 'sliced cooked chicken breast (clearly poultry meat with grill marks, never a loaf or bread)';
  if (/\bbeef\b|steak/i.test(name)) return `${name} (clearly a cut of red meat)`;
  return name;
}

function imagePrompt(foods) {
  return `${IMG_STYLE}
Show ONLY these foods, accurate and clearly recognizable: ${foods.map(clarifyFood).join(', ')}.
Do NOT add any other food. Absolutely no bread, loaf, bun, baguette, toast, pastry, pasta, rice, grains, cereal, cake, cookies, potatoes, or any high-carb or sugary item unless it appears in that exact list.
Landscape 16:9, centered, with soft empty space around the food.`;
}

// Vision QA: reject stray text, off-list/carby foods, or faces. Non-fatal — if
// the checker can't run we accept the image rather than block publishing.
async function verifyImage(buf, foods) {
  try {
    if (!process.env.GEMINI_API_KEY) return { ok: true };
    const res = await ai().models.generateContent({
      model: TEXT_MODEL, // gemini-2.5-flash is multimodal; cheaper than the image model
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: buf.toString('base64') } },
            {
              text: `Check this illustration for a protein-nutrition article. Allowed foods: ${foods.join(', ')}. Reply with ONLY JSON {"ok":boolean,"reason":"<=10 words"}. Set ok=false if ANY is true: (a) any visible text, letters, words, numbers, logos, or packaging labels; (b) ANYTHING that looks like bread, a loaf, a bun, a baguette, toast, pastry, or baked dough appears anywhere — even if it was meant to be meat or chicken; (c) it shows pasta, rice, grains, cereal, cake, cookies, potatoes, or other high-carb/sugary food NOT in the allowed list; (d) a human face or hands appear; (e) any allowed food is not clearly recognizable as itself. Be strict: if a shape is ambiguous between meat and bread, treat it as bread and fail it.`,
            },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    const v = parseJson(res.text || '');
    if (v && typeof v.ok === 'boolean') return v;
  } catch (e) {
    console.log('verify skipped:', e.message);
  }
  return { ok: true };
}

export async function makeImage(topic, body, type) {
  const foods = subjectFoods(body, type);
  try {
    if (!process.env.GEMINI_API_KEY) return null;
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await ai().models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ role: 'user', parts: [{ text: imagePrompt(foods) }] }],
        config: { imageConfig: { aspectRatio: '16:9' } },
      });
      const parts = res?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p) => p.inlineData?.data);
      if (!img) continue;
      last = Buffer.from(img.inlineData.data, 'base64');
      const v = await verifyImage(last, foods);
      if (v.ok) return last;
      console.log(`image QA reject (attempt ${attempt}/3): ${v.reason}`);
    }
    return last; // best effort after retries rather than no image at all
  } catch (e) {
    console.log('image skipped:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
async function notify(topic, flags) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const flagText =
      flags && flags.length
        ? `\n\n⚠ Self-review flagged:\n- ${flags.join('\n- ')}`
        : `\n\n✓ Self-review: no issues.`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || `${SITE_NAME} <onboarding@resend.dev>`,
        to: ['rajanlakhani@gmail.com'],
        subject: `📝 New guide published: ${topic.title}`,
        text: `Auto-published to /learn:\n${SITE}/learn/${topic.slug}${flagText}\n\nVeto or edit any time — tell Claude "unpublish ${topic.slug}".`,
      }),
    });
  } catch (e) {
    console.log('notify skipped:', e.message);
  }
}

// The publish run (also exported for the local seed script).
export const run = async () => {
  let s;
  try {
    s = await store();
  } catch (e) {
    console.log('Blobs unavailable:', e.message);
    return { statusCode: 500, body: 'blobs unavailable' };
  }

  // Self-seed the queue from the bundled topics.json on a fresh site.
  let q = await getQueue(s);
  if (!q.length) {
    q = topicsFile.topics;
    await setQueue(s, q);
    console.log(`PUBLISH: seeded queue with ${q.length} topics`);
  }

  const topic = q.find((t) => t.status === 'queued');
  if (!topic) {
    console.log('PUBLISH: queue empty (all published)');
    return { statusCode: 200, body: 'queue empty' };
  }

  const type = inferType(topic.title, topic.type);

  let draft;
  try {
    draft = await ask(topic, type);
  } catch (e) {
    console.log('PUBLISH gemini fail:', e.message);
    return { statusCode: 502, body: e.message };
  }

  const { body, flags } = await review(topic, draft);
  body.type = type;

  const png = await makeImage(topic, body, type);
  if (png) await setOg(s, topic.slug, png);

  await setBody(s, topic.slug, body);
  topic.status = 'published';
  topic.published = today();
  topic.hasImage = Boolean(png);
  await setQueue(s, q);
  await notify(topic, flags);

  console.log(`PUBLISH ok: ${topic.slug} [${type}] (image: ${png ? 'yes' : 'fallback'})`);
  return { statusCode: 200, body: `published ${topic.slug}` };
};

export const handler = schedule('0 16 * * 1,4', run);
