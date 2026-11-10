// FR20 / NFR6: photo -> category suggestion. The result is only a suggestion the
// resident can change, and the app works the same with AI turned off.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import { AI_ENABLED, AI_MODEL, CATEGORIES, CATEGORY_IDS } from './config.js';

const client = AI_ENABLED ? new Anthropic() : null;

const SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORY_IDS },
    confidence: { type: 'number' },
    title: { type: 'string' },
    is_infrastructure_issue: { type: 'boolean' },
  },
  required: ['category', 'confidence', 'title', 'is_infrastructure_issue'],
  additionalProperties: false,
};

const SYSTEM = `You help residents of the Klang Valley, Malaysia report damaged public infrastructure to their local council.
Look at the photo and pick the single best category:
${CATEGORIES.map((c) => `- ${c.id}: ${c.hint}`).join('\n')}
Also give a short plain title (at most 8 words, no trailing full stop) a resident could use, a confidence from 0 to 1,
and whether the photo shows a public infrastructure problem at all. If it does not, use "other" with low confidence.`;

const MEDIA_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

export function mediaTypeFor(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return MEDIA_TYPES[ext] || null;
}

/** Returns { category, confidence, title, isIssue } or null when AI is off or unsure. */
export async function classifyPhoto(filePath, mediaType) {
  if (!client || !mediaType) return null;
  const data = fs.readFileSync(filePath).toString('base64');
  try {
    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      // Server-side refusal fallback: a false-positive decline is retried on another model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'Classify this report photo.' },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return null;
    const out = JSON.parse(text);
    if (!CATEGORY_IDS.includes(out.category)) return null;
    return {
      category: out.category,
      confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
      title: String(out.title || '').slice(0, 80),
      isIssue: Boolean(out.is_infrastructure_issue),
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn(`[ai] API error ${err.status}: ${err.message}`);
    else console.warn('[ai] classify failed:', err.message);
    return null;
  }
}
