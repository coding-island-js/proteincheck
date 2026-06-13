import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ScanResult } from './dto';

const PROMPT = `You are a nutrition expert. You are shown ONE photo of food or a meal. Estimate the
protein content.

Return ONLY a JSON object (no markdown) with exactly these keys:
- "totalProtein": number — total estimated grams of protein in the meal (a single number).
- "totalLeucine": number — total estimated grams of leucine in the meal (leucine is the key muscle-building amino acid; it is roughly 8-10% of protein for most whole foods). One decimal place.
- "items": array of { "name": string, "protein": number, "leucine": number } — each visible food item with its estimated grams of protein and grams of leucine.
- "verdict": string — one short punchy verdict, e.g. "Solid protein hit" or "Light on protein, add more".
- "summary": string — one friendly sentence about the meal's protein.
- "confidence": string — "high", "medium", or "low" based on how clearly you can judge portions.

If no food is clearly visible, set "totalProtein" and "totalLeucine" to 0, "items" to [], "verdict" to
"No food detected", "summary" to a friendly nudge to retake the photo, and "confidence" to "low". Be
realistic with estimates. Never mention being an AI.`;

const FALLBACK: ScanResult = {
  totalProtein: 0,
  totalLeucine: 0,
  items: [],
  verdict: 'Could not read that photo',
  summary: 'Please try another photo of your meal.',
  confidence: 'low',
};

@Injectable()
export class GeminiService {
  private readonly ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async analyze(imageBase64: string, mimeType = 'image/jpeg'): Promise<ScanResult> {
    const res = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    return this.parse(res.text ?? '');
  }

  private parse(text: string): ScanResult {
    try {
      return { ...FALLBACK, ...(JSON.parse(text) as Partial<ScanResult>) };
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return { ...FALLBACK, ...(JSON.parse(m[0]) as Partial<ScanResult>) };
        } catch {
          /* fall through */
        }
      }
      return FALLBACK;
    }
  }
}
