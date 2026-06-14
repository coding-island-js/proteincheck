// Scheduled auto-publisher for the /learn blog. Netlify cron Mon + Thu 16:00 UTC
// (9am PT). Picks the next queued topic, asks Gemini for an on-voice body, makes
// a nano-banana hero image, writes both to Netlify Blobs, marks it published in
// the queue, and emails Raj the link. The Astro /learn routes render it live —
// no deploy needed. Cross-links + cluster lists are computed at render time, so
// older posts gain backlinks from new siblings automatically.
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
} from '../../src/lib/blog.mjs';
import topicsFile from '../../content/topics.json' with { type: 'json' };

const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

// ---- prompts ----
function textPrompt(topic) {
  return `You are a sharp, honest nutrition coach who writes the way you talk: plainly, with no fluff. A busy person should get the real answer fast and feel like a knowledgeable friend told them one true thing.

Write the body for a short web guide. The exact subject is whatever the H1 below says.

Topic (this is the H1, do not rewrite it): "${topic.title}"
Search intent: ${topic.intent}
The core point to teach (anchor everything to this, in plain words): ${topic.anchor}

Rules:
- Simple, direct, human. Short sentences. No AI-slop phrases ("unlock", "elevate", "in today's fast-paced", "dive in", "game-changer").
- The "answer" must answer the H1 in the FIRST 2-3 sentences and contain the concrete number or fix, so an AI search engine can quote it verbatim.
- SEO: this guide targets a long-tail search query. Write the way real people search and ask. Naturally weave in the exact long-tail phrasing AND close variants and related sub-questions a person would type or ask a voice assistant — without keyword stuffing. The "faqQ" especially should be a genuine long-tail follow-up people search.
- Use real, mainstream nutrition guidance (e.g. ~1.6 g protein/kg/day for muscle, ~2.5-3 g leucine to trigger muscle protein synthesis, ~20-40 g protein per meal). Never invent studies or cite fake numbers.
- No medical claims, no prescriptions. This is general information, not medical or dietary advice. American spelling. No links.

Respond with ONLY this JSON, no markdown fence:
{
 "metaDescription": "<=155 chars, plain, includes the key number/fix and the long-tail phrasing",
 "crumbTail": "2-3 word breadcrumb tail, lowercase, e.g. 'per meal'",
 "answer": "2-3 sentences. Answer the H1 directly and give the number/fix.",
 "whoFor": ["3 to 4 short signs this guide is for the reader"],
 "whyItMatters": "one short paragraph, <=3 sentences",
 "quickNumbers": [
   {"label": "2-4 word label", "value": "the number, e.g. '20-30 g'"},
   {"label": "2-4 word label", "value": "the number"}
 ],
 "theMove": [
   {"lead": "1-3 word bold step name", "text": "<=18 words"},
   {"lead": "1-3 word bold step name", "text": "<=18 words"},
   {"lead": "1-3 word bold step name", "text": "<=18 words"}
 ],
 "cue": "one memorable line to remember, <=10 words",
 "doNow": {"intro": "one line setting up an action the reader can take now", "steps": ["3 short concrete steps"]},
 "faqQ": "the most likely long-tail follow-up question, in the reader's words",
 "faqA": "2-3 sentence direct answer",
 "imageConcept": "one vivid sentence describing a RICH, layered illustration scene unique to THIS guide: a complete composition with several specific whole foods relevant to the topic arranged in a real setting (a sunlit kitchen counter, a wooden board, a gym bag spilling open), with a subtle hand-sketched nutrition-science motif woven into the background (a faint molecule, a muscle fiber, a sprig). Not a single object on empty space. No charts or graphs. No text or numbers."
}`;
}

// Locked illustration style: a warm, detailed Japanese colored-pencil sketch,
// grounded in real nutrition science. The per-article scene comes from the
// model's imageConcept so every guide gets a unique, on-topic illustration.
const IMAGE_STYLE =
  'A breathtaking, museum-quality hand-drawn illustration in the style of a master Japanese colored-pencil artist (色鉛筆 / iro-enpitsu): intricate, richly detailed linework and deeply layered colored-pencil shading with real texture and depth, visible paper tooth, warm natural palette with subtle sage-green accents, the gorgeous precision of a vintage naturalist botanical plate but warm, hand-made and full of life. Compose a complete, immersive scene that fills the whole frame with depth and layered elements and a real sense of place and light — NOT minimalist, NOT sparse, NOT a single object floating on empty background, NOT lazy line art. Absolutely NO charts, graphs, bar charts, pie charts, tables, or infographic diagrams. Any science motif (a molecule, a muscle fiber, a leaf) appears only as a subtle, beautifully drawn background detail, never as a diagram. Not cartoonish, not comic-book, not flat vector, not a photograph. No text, no words, no numbers, no logos, no lettering, no people. Landscape composition.';

function imagePrompt(topic, body) {
  const scene =
    (body && body.imageConcept) ||
    `a rich, layered still life of the real high-protein whole foods relevant to "${topic.title}", on a sunlit kitchen counter with a subtle hand-sketched nutrition-science motif in the background`;
  return `${IMAGE_STYLE} Scene: ${scene}`;
}

const ai = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

async function ask(topic) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: textPrompt(topic) }] }],
    config: { responseMimeType: 'application/json', temperature: 0.5 },
  });
  const a = parseJson(res.text || '');
  if (!a || !a.answer || !Array.isArray(a.theMove)) throw new Error('Bad article JSON');
  return a;
}

// Lenient editor pass: polish against the voice rules, flag anything a human
// should double-check. Non-fatal — on any error we keep the original draft.
async function review(topic, draft) {
  try {
    const p = `You are a strict editor for short nutrition guides. Here is a DRAFT body (JSON) for "${topic.title}". Return a POLISHED version that fixes problems and flag anything a human should double-check.

Enforce: simple plain words; the "answer" answers the title in the first 2-3 sentences AND states the number/fix; NO AI-slop ("unlock","elevate","in today's fast-paced","dive in","game-changer"); factually sound mainstream nutrition (no invented studies); no medical claims; tight field lengths. If a field is already good, KEEP it — do not over-edit.

DRAFT:
${JSON.stringify(draft)}

Respond with ONLY JSON: {"body": { ...same shape as DRAFT... }, "flags": ["short concern", ...]}  (flags = [] if all good).`;
    const res = await ai().models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: p }] }],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = parseJson(res.text || '');
    if (parsed && parsed.body && parsed.body.answer) {
      // Keep the original imageConcept if the editor dropped it.
      const body = { ...parsed.body };
      if (!body.imageConcept && draft.imageConcept) body.imageConcept = draft.imageConcept;
      return { body, flags: Array.isArray(parsed.flags) ? parsed.flags : [] };
    }
  } catch (e) {
    console.log('review skipped:', e.message);
  }
  return { body: draft, flags: [] };
}

// nano banana → PNG bytes (16:9 landscape, hand-drawn colored-pencil style).
// Returns a Buffer or null (caller falls back to og.png).
async function makeImage(topic, body) {
  try {
    if (!process.env.GEMINI_API_KEY) return null;
    const res = await ai().models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: imagePrompt(topic, body) }] }],
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

async function notify(topic, flags) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const flagText =
      flags && flags.length
        ? `\n\n⚠ Self-review flagged (worth a look):\n- ${flags.join('\n- ')}`
        : `\n\n✓ Self-review: no issues flagged.`;
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

  // Self-seed: on a fresh site the Blobs queue is empty, so initialize it from
  // the bundled topics.json. Later runs just read the persisted (mutated) queue.
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

  let draft;
  try {
    draft = await ask(topic);
  } catch (e) {
    console.log('PUBLISH gemini fail:', e.message);
    return { statusCode: 502, body: e.message };
  }

  const { body, flags } = await review(topic, draft);

  const png = await makeImage(topic, body);
  if (png) await setOg(s, topic.slug, png);

  await setBody(s, topic.slug, body);
  topic.status = 'published';
  topic.published = today();
  topic.hasImage = Boolean(png);
  await setQueue(s, q);
  await notify(topic, flags);

  console.log(`PUBLISH ok: ${topic.slug} (image: ${png ? 'yes' : 'fallback'})`);
  return { statusCode: 200, body: `published ${topic.slug}` };
};

export const handler = schedule('0 16 * * 1,4', run);
