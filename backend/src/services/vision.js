import { generate, imagePart, parseJsonLoose, GeminiError } from './gemini.js';
import { parseInciText, looksLikeInciList } from './inci.js';

export const PRODUCT_TYPES = [
  'Foundation', 'BB Cream', 'CC Cream', 'Sunscreen', 'Moisturizer', 'Serum', 'Cleanser', 'Toner',
  'Micellar Water', 'Primer', 'Concealer', 'Powder', 'Mask', 'Lipstick', 'Mascara', 'Perfume',
  'Hair Care', 'Body Care', 'Other',
];

const SYSTEM_VISION = `You are a careful cosmetic-packaging reader inside a scientific chemistry app.
Rules:
- Report ONLY what is actually visible on the packaging or what you can identify with high certainty.
- NEVER invent a brand, product name, volume, SPF value or ingredient list. Use null when unknown.
- If you are not sure which product it is, set low confidence and list plausible candidates in "alternatives". Do not present a guess as fact.
- "inciText" must be filled ONLY if a real ingredient (INCI) list is legibly printed in the image; copy it exactly as printed. Otherwise null.
- Answer with a single JSON object and nothing else.`;

const PROMPT_VISION = `Analyze this cosmetic product photo. Return JSON with exactly these keys:
{
  "brand": string|null,
  "productName": string|null,
  "productType": one of ${JSON.stringify(PRODUCT_TYPES)} | null,
  "category": string|null   (short English category, e.g. "Face / Sun protection"),
  "volume": string|null     (e.g. "50 ml"),
  "spf": string|null        (e.g. "SPF 50+", "PA++++"),
  "packagingTexts": string[] (important text lines you can read on the packaging),
  "confidence": number       (0..1 overall confidence that brand and productName are correct),
  "ingredientsVisible": boolean,
  "inciText": string|null,
  "alternatives": [{"brand": string, "productName": string}],
  "notes": string|null       (anything the user should know, e.g. image blurry, back of pack needed)
}`;

const toNum = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Суреттен өнімді анықтайды (Gemini Vision). */
export async function analyzeProductImage(buffer, mime) {
  const { text } = await generate({
    system: SYSTEM_VISION,
    json: true,
    parts: [{ text: PROMPT_VISION }, imagePart(buffer, mime)],
  });
  const raw = parseJsonLoose(text);
  const type = PRODUCT_TYPES.includes(raw.productType) ? raw.productType : null;
  const inciText = str(raw.inciText);
  const inciItems = inciText ? parseInciText(inciText) : [];
  const hasInci = !!inciText && looksLikeInciList(inciItems);
  return {
    brand: str(raw.brand),
    productName: str(raw.productName),
    productType: type,
    category: str(raw.category),
    volume: str(raw.volume),
    spf: str(raw.spf),
    packagingTexts: Array.isArray(raw.packagingTexts) ? raw.packagingTexts.filter((x) => typeof x === 'string').slice(0, 30) : [],
    confidence: toNum(raw.confidence),
    ingredientsVisible: hasInci,
    inciText: hasInci ? inciText : null,
    alternatives: Array.isArray(raw.alternatives)
      ? raw.alternatives
          .filter((a) => a && typeof a.brand === 'string' && typeof a.productName === 'string')
          .slice(0, 5)
          .map((a) => ({ brand: a.brand.trim(), productName: a.productName.trim() }))
      : [],
    notes: str(raw.notes),
  };
}

/** Қаптаманың артқы жағындағы INCI мәтінін оқиды (OCR, Gemini Vision арқылы). */
export async function ocrIngredients(buffer, mime) {
  const { text } = await generate({
    system:
      'You are an OCR engine for cosmetic packaging. Transcribe the ingredient (INCI) list EXACTLY as printed, character by character, keeping commas and order. Never add, translate, complete, correct or guess ingredients. If no ingredient list is visible or it is unreadable, return null. Answer with a single JSON object only.',
    json: true,
    parts: [
      { text: 'Return JSON: {"inciText": string|null, "language": string|null, "uncertainParts": string[], "notes": string|null}. "uncertainParts" lists fragments you could not read confidently.' },
      imagePart(buffer, mime),
    ],
  });
  const raw = parseJsonLoose(text);
  const inciText = str(raw.inciText);
  const items = inciText ? parseInciText(inciText) : [];
  return {
    inciText,
    items,
    readable: !!inciText && looksLikeInciList(items),
    language: str(raw.language),
    uncertainParts: Array.isArray(raw.uncertainParts) ? raw.uncertainParts.filter((x) => typeof x === 'string').slice(0, 20) : [],
    notes: str(raw.notes),
  };
}

/**
 * Интернеттен өнімнің INCI құрамын іздейді (Gemini + Google Search grounding).
 * Анти-галлюцинация: нақты веб-дереккөз (grounding) болмаса, нәтиже қабылданбайды.
 */
export async function lookupInciOnWeb({ brand, productName, volume, market }) {
  const query = [brand, productName, volume].filter(Boolean).join(' ');
  const { text, sources, searchQueries } = await generate({
    search: true,
    temperature: 0,
    system:
      'You research cosmetic product ingredient lists (INCI) using web search. Priority of sources: 1) the manufacturer/brand official website, 2) reliable cosmetic product catalogs and retailers, 3) other reliable sources. NEVER invent or reconstruct an ingredient list from memory. Copy the list exactly as published. If you cannot find the exact list for this exact product, say so. Formulas can differ between countries and years: mention it if the source indicates a regional or dated variant.',
    parts: [
      {
        text: `Find the full INCI ingredient list for this exact product: "${query}"${market ? ` (market/country: ${market})` : ''}.
Return ONLY a JSON object:
{"found": boolean, "inciText": string|null, "sourceName": string|null, "sourceUrl": string|null, "sourceType": "official"|"catalog"|"other"|null, "variantNote": string|null, "exactProductMatch": boolean}
Set found=false and inciText=null if you did not see the real list on a page for this exact product.`,
      },
    ],
  });

  let raw;
  try {
    raw = parseJsonLoose(text);
  } catch (e) {
    return { found: false, reason: 'parse', sources: sources, searchQueries };
  }

  const inciText = str(raw.inciText);
  const items = inciText ? parseInciText(inciText) : [];
  if (!raw.found || !inciText || !looksLikeInciList(items)) {
    return { found: false, reason: 'not_found', sources, searchQueries };
  }
  if (!sources.length) {
    // Веб-дереккөзсіз келген тізім модельдің "есінен" шыққан болуы мүмкін — қабылдамаймыз.
    return { found: false, reason: 'no_grounding', sources, searchQueries };
  }
  return {
    found: true,
    inciText,
    items,
    sourceName: str(raw.sourceName),
    claimedUrl: str(raw.sourceUrl),
    sourceType: ['official', 'catalog', 'other'].includes(raw.sourceType) ? raw.sourceType : 'other',
    variantNote: str(raw.variantNote),
    exactProductMatch: raw.exactProductMatch !== false,
    sources,
    searchQueries,
  };
}

/** Қазақша ғылыми қорытынды: ТЕК базадағы деректерге сүйенеді. */
export async function explainInKazakh({ product, matched, unmatched }) {
  const compact = matched.map((m) => ({
    position: m.position,
    inci: m.match.inciName,
    kk: m.match.nameKk,
    formula: m.match.formula,
    class: m.match.chemClass,
    function: m.match.functionKk,
    mechanism: m.match.mechanism,
    benefits: m.match.benefits,
    risks: m.match.risks,
  }));
  const { text } = await generate({
    temperature: 0.2,
    system:
      'Сен косметикалық химия бойынша ғылыми көмекшісің. Тек ҚАЗАҚ тілінде жаз. Қорытындыны ТЕК берілген деректер қорындағы мәліметтерге сүйеніп құр. Деректерде жоқ сандарды, концентрацияларды, зерттеу нәтижелерін ойдан шығарма. Диагноз қойма, емдеу кеңесін берме. Құрамдағы ингредиенттердің нақты пайызы белгісіз екенін ескер (INCI тізімі 1%-дан жоғары заттар үшін кему ретімен жазылады). Деректер қорында жоқ ингредиенттерді тек "базада жоқ" деп атап өт, олар туралы сипаттама жазба.',
    parts: [
      {
        text: `Өнім: ${JSON.stringify(product)}\n\nДеректер қорында табылған ингредиенттер (JSON):\n${JSON.stringify(compact)}\n\nДеректер қорында ЖОҚ ингредиенттер: ${JSON.stringify(unmatched)}\n\nТапсырма: 150–250 сөзден тұратын ғылыми қорытынды жаз. Құрылымы: 1) өнім құрамының жалпы сипаты (қандай функциялық топтар бар); 2) негізгі белсенді және қорғаушы заттар және олардың қызметі; 3) ықтимал сақтық шаралары (тек берілген "risks" өрістеріне сүйеніп); 4) базада жоқ ингредиенттер туралы бір сөйлем. Қарапайым мәтінмен жаз, Markdown белгілерін (*, #) қолданба.`,
      },
    ],
  });
  return text.replace(/[*#`]/g, '').trim();
}

export { GeminiError };
