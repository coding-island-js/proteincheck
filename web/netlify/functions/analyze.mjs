import { GoogleGenAI } from '@google/genai';

const PROMPT = `You are a nutrition expert. You are shown ONE photo of food or a meal. Estimate the
protein content.

Return ONLY a JSON object (no markdown) with exactly these keys:
- "totalProtein": number — total estimated grams of protein in the meal (a single number).
- "items": array of { "name": string, "protein": number } — each visible food item and its estimated grams of protein.
- "verdict": string — one short punchy verdict, e.g. "Solid protein hit" or "Light on protein, add more".
- "summary": string — one friendly sentence about the meal's protein.
- "confidence": string — "high", "medium", or "low".

If no food is clearly visible, set "totalProtein" to 0, "items" to [], "verdict" to "No food detected",
"summary" to a friendly nudge to retake the photo, and "confidence" to "low". Be realistic. Never mention being an AI.`;

function stripDataUrl(s) {
  const m = /^data:(image\/[a-zA-Z]+);base64,(.*)$/.exec(s);
  return m ? { mime: m[1], data: m[2] } : { mime: 'image/jpeg', data: s };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { totalProtein: 0, items: [], verdict: 'Could not read that photo', summary: 'Please try another photo.', confidence: 'low' };
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { image } = JSON.parse(event.body || '{}');
    if (!image) return json(400, { error: 'No image provided' });
    const { mime, data } = stripDataUrl(image);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data } }] }],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    return json(200, parseJson(res.text || ''));
  } catch (e) {
    return json(500, { error: 'analysis_failed', detail: String(e?.message || e) });
  }
};
