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
  amount: 'name the single most relevant food, or a simple metaphor for the amount.',
  foodlist: 'name 4-6 of the specific foods so the illustration can show a spread of them.',
  singlefood: 'name the one food, e.g. "a single chicken breast".',
  concept:
    'a clever visual METAPHOR for the idea — NOT a plate of food. e.g. low protein -> a wilting plant reviving; the leucine threshold -> a key turning a lock; protein timing -> an hourglass; spreading protein -> evenly spaced stepping stones.',
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
 "imageSubject": "a short concrete subject for an illustration of THIS article — name the specific food(s) or the idea/metaphor. Do NOT describe art style or composition."
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
// IMAGE — one shared hand-drawn medium, many different compositions so the set
// never feels cloned. The archetype is chosen per-article (by type + a stable
// hash of the slug); the writer supplies the topic-specific subject.
// ---------------------------------------------------------------------------
const IMG_BASE =
  'Hand-drawn colored-pencil and ink editorial illustration by a master illustrator: richly detailed, intricate linework, deeply layered shading, visible paper texture, cohesive and tasteful, full of life. ABSOLUTELY NOT a photograph, not photorealistic, not a 3D render, not flat vector, not cartoon or comic. NO text, letters, words, labels, brand names, numbers or signage anywhere — any packaging must be completely blank. No human faces.';

const ART = {
  macro:
    'Composition: an extreme, dramatic close-up of the single most iconic element, filling the frame against a BOLD saturated solid-color background (deep teal, oxblood, or warm ochre). High impact, minimal clutter, a little glow.',
  metaphor:
    "Composition: a poetic, slightly surreal conceptual metaphor for the article's IDEA, on a clean cream background with generous negative space. Symbolic, witty, editorial. Do NOT draw a spread of dishes or a plate of food — food is secondary or absent.",
  flatlay:
    'Composition: a bold top-down flat-lay arranged as a clean graphic pattern (an arc, grid, or gradient by size) on a saturated colored-paper background (mustard, clay, or sage). Designy, rhythmic, vibrant.',
  botanical:
    'Composition: a vintage naturalist botanical-study plate of the subject shown in several views and cross-sections on aged cream parchment. Intricate, scientific, elegant. No kitchen, no table.',
  stilllife:
    'Composition: a moody Dutch-master still life lit by a single dramatic side light against a near-black background. Chiaroscuro, rich shadows, painterly and premium.',
  lifestyle:
    'Composition: a warm, dynamic lifestyle vignette that implies a person without showing any face (an open gym bag with a blank shaker, a packed lunch on a desk, a sunlit grab-and-go scene). Candid and editorial.',
};

// Candidate archetypes per article type. Each list cycles by ROTATION (an even
// per-type counter), so consecutive articles of a type never repeat a look —
// food types rotate through four visually distinct treatments.
const TYPE_ART = {
  amount: ['metaphor', 'macro', 'stilllife'],
  foodlist: ['flatlay', 'botanical', 'macro', 'stilllife'],
  singlefood: ['botanical', 'macro', 'stilllife', 'flatlay'],
  concept: ['metaphor', 'macro', 'metaphor', 'lifestyle'], // mostly idea-driven metaphors
};

// idx = how many of this type were already published (even rotation).
export function chooseArt(type, idx) {
  const cands = TYPE_ART[type] || ['macro', 'metaphor', 'flatlay', 'stilllife'];
  return cands[((idx % cands.length) + cands.length) % cands.length];
}

function imagePrompt(topic, body, artKey) {
  const art = ART[artKey];
  let subject;
  if (artKey === 'metaphor') {
    // Idea-driven, never a food spread — even if the stored subject named foods.
    const hint =
      body.imageSubject && !/\b(plate|bowl|spread|dish|platter|board)\b/i.test(body.imageSubject)
        ? ` Hint: ${body.imageSubject}.`
        : '';
    subject = `invent a single clever visual metaphor for the idea of "${topic.title}".${hint} Absolutely not a plate or spread of food`;
  } else {
    subject = body.imageSubject || `the foods central to "${topic.title}"`;
  }
  return `${IMG_BASE} ${art} Subject: ${subject}. Landscape 16:9.`;
}

export async function makeImage(topic, body, artKey) {
  try {
    if (!process.env.GEMINI_API_KEY) return null;
    const res = await ai().models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: imagePrompt(topic, body, artKey) }] }],
      config: { imageConfig: { aspectRatio: '16:9' } },
    });
    const parts = res?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData?.data);
    if (!img) return null;
    return Buffer.from(img.inlineData.data, 'base64');
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

  // Even rotation: pick the art direction by how many of this type are already live.
  const idx = q.filter((t) => t.status === 'published' && inferType(t.title, t.type) === type).length;
  const artKey = chooseArt(type, idx);
  const png = await makeImage(topic, body, artKey);
  if (png) await setOg(s, topic.slug, png);

  await setBody(s, topic.slug, body);
  topic.status = 'published';
  topic.published = today();
  topic.hasImage = Boolean(png);
  await setQueue(s, q);
  await notify(topic, flags);

  console.log(`PUBLISH ok: ${topic.slug} [${type}/${artKey}] (image: ${png ? 'yes' : 'fallback'})`);
  return { statusCode: 200, body: `published ${topic.slug}` };
};

export const handler = schedule('0 16 * * 1,4', run);
