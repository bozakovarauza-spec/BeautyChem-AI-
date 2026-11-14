import { config } from '../config.js';

export class GeminiError extends Error {
  constructor(message, status = 502, code = 'gemini_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const geminiConfigured = () => !!config.geminiKey;

/**
 * Gemini API-ге REST сұрауы. Жалған жауап ешқашан қайтарылмайды:
 * кілт жоқ болса немесе API қате берсе, нақты қате лақтырылады.
 *
 * @param {object} o
 * @param {Array}  o.parts        [{text}|{inline_data:{mime_type,data}}]
 * @param {string} [o.system]
 * @param {boolean} [o.json]      JSON режимі (search-пен бірге қолданылмайды)
 * @param {boolean} [o.search]    Google Search grounding
 */
export async function generate({ parts, system, json = false, search = false, temperature = 0.1 }) {
  if (!config.geminiKey) {
    throw new GeminiError(
      'GEMINI_API_KEY бапталмаған. Жоба түбіріндегі .env файлына Gemini API кілтін енгізіңіз (README.md, 5-қадам).',
      503,
      'no_api_key',
    );
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (search) body.tools = [{ google_search: {} }];
  else if (json) body.generationConfig.responseMimeType = 'application/json';

  let res;
  try {
    res = await fetch(`${config.geminiBase}/models/${encodeURIComponent(config.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    throw new GeminiError(`Gemini API-ге қосылу мүмкін болмады: ${e.message}`, 502, 'network');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new GeminiError(`Gemini API жарамсыз жауап қайтарды (HTTP ${res.status}).`, 502, 'bad_response');
  }

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 429) throw new GeminiError('Gemini API лимиті таусылды. Біраз күтіп, қайталаңыз.', 429, 'rate_limit');
    if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError('Gemini API кілті жарамсыз. .env файлын тексеріңіз.', 503, 'bad_key');
    if (res.status === 403 || res.status === 401) throw new GeminiError('Gemini API кілті рұқсат етілмеген. Кілтті және оның құқықтарын тексеріңіз.', 503, 'forbidden');
    throw new GeminiError(`Gemini қатесі: ${msg}`, 502, 'api_error');
  }

  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || cand?.finishReason || 'бос жауап';
    throw new GeminiError(`Gemini жауап бермеді (${reason}).`, 502, 'empty');
  }

  const sources = [];
  const seen = new Set();
  for (const ch of cand?.groundingMetadata?.groundingChunks || []) {
    const w = ch.web;
    if (w?.uri && !seen.has(w.uri)) {
      seen.add(w.uri);
      sources.push({ title: w.title || w.uri, url: w.uri });
    }
  }
  return { text, sources, searchQueries: cand?.groundingMetadata?.webSearchQueries || [] };
}

/** Модель жауабынан JSON объектін алады (```json қоршауларын ескереді). */
export function parseJsonLoose(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new GeminiError('Модель жауабынан JSON табылмады.', 502, 'bad_json');
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new GeminiError('Модель жауабындағы JSON оқылмады.', 502, 'bad_json');
  }
}

export const imagePart = (buffer, mime) => ({
  inline_data: { mime_type: mime, data: buffer.toString('base64') },
});
