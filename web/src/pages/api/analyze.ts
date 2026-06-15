export const prerender = false;
import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { recordCheck } from '../../lib/stats.mjs';

const PROMPT = `You are a nutrition expert. You are shown ONE photo of food or a meal. Estimate the
protein content.

Return ONLY a JSON object (no markdown) with exactly these keys:
- "totalProtein": number — total estimated grams of protein in the meal (a single number).
- "totalLeucine": number — total estimated grams of leucine in the meal (leucine is the key muscle-building amino acid; roughly 8-10% of protein for most whole foods). One decimal place.
- "items": array of { "name": string, "protein": number, "leucine": number } — each visible food item with its estimated grams of protein and grams of leucine.
- "verdict": string — one short punchy verdict, e.g. "Solid protein hit" or "Light on protein, add more".
- "summary": string — one friendly sentence about the meal's protein.
- "confidence": string — "high", "medium", or "low".

If no food is clearly visible, set "totalProtein" and "totalLeucine" to 0, "items" to [], "verdict" to "No food detected",
"summary" to a friendly nudge to retake the photo, and "confidence" to "low". Be realistic. Never mention being an AI.`;

function stripDataUrl(s: string) {
  const m = /^data:(image\/[a-zA-Z]+);base64,(.*)$/.exec(s);
  return m ? { mime: m[1], data: m[2] } : { mime: 'image/jpeg', data: s };
}

function parseJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { totalProtein: 0, totalLeucine: 0, items: [], verdict: 'Could not read that photo', summary: 'Please try another photo.', confidence: 'low' };
}

const R = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  try {
    const { image } = await request.json().catch(() => ({}));
    if (!image) return R({ error: 'No image provided' }, 400);
    const { mime, data } = stripDataUrl(image);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data } }] }],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const result = parseJson(res.text || '');
    // Fold into the anonymous aggregate (SSR runtime has the Blobs context).
    try {
      await recordCheck({
        protein: result.totalProtein,
        leucine: result.totalLeucine,
        items: Array.isArray(result.items) ? result.items.length : 0,
      });
    } catch {}
    return R(result);
  } catch (e: any) {
    return R({ error: 'analysis_failed', detail: String(e?.message || e) }, 500);
  }
};
