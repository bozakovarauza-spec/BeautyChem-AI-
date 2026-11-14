/**
 * INCI мәтінін бөлу және ингредиенттерді химиялық базамен сәйкестендіру.
 * Сәйкестендіру ТЕК нақты (нормаланған) атау немесе базадағы синоним бойынша жасалады:
 * "ұқсас" атауларды болжап, қате зат көрсетпеу үшін fuzzy іздеу қолданылмайды.
 */

const LABEL_RE = /^\s*(ingredients?|ingr[eé]dients?|inci|composition|состав|ингредиенты|құрамы|құрам)\s*[:：\-–]?\s*/i;
const OPTIONAL_SPLIT_RE = /\+\s*\/\s*[-–−]|\bmay contain\b|\bpeut contenir\b|\bmay also contain\b|может содержать/i;

/** Атауды салыстыру үшін қалыпқа келтіреді. */
export function normalizeName(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[*†‡•·]/g, ' ')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\.$/, '')
    .trim();
}

/** Жақшаның ішіндегі үтірлерді ескеріп, тізімді бөледі. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';' || ch === '•' || ch === '·' || ch === '\n')) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);
  return parts;
}

/**
 * INCI мәтінін элементтерге бөледі.
 * @returns {{raw:string, optional:boolean}[]}
 */
export function parseInciText(text) {
  if (!text || typeof text !== 'string') return [];
  let t = text.replace(/\r/g, '\n').replace(LABEL_RE, '').trim();

  let main = t;
  let optionalPart = '';
  const m = OPTIONAL_SPLIT_RE.exec(t);
  if (m) {
    main = t.slice(0, m.index);
    optionalPart = t.slice(m.index + m[0].length);
  }

  const clean = (s) => s.replace(/\s+/g, ' ').replace(/^[\s.:\-–]+|[\s.\]\[]+$/g, '').trim();
  const seen = new Set();
  const out = [];
  const push = (list, optional) => {
    for (const p of list) {
      const raw = clean(p);
      if (!raw || raw.length > 120) continue;
      const key = normalizeName(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ raw, optional });
    }
  };
  push(splitTopLevel(main), false);
  if (optionalPart) push(splitTopLevel(optionalPart), true);
  return out;
}

/** Базадағы барлық атаулардан индекс құрады: normalizedName -> ingredient */
export function buildIndex(ingredients) {
  const index = new Map();
  for (const ing of ingredients) {
    const names = [ing.inciName, ing.commonName, ing.nameKk, ...(ing.synonyms || [])];
    for (const n of names) {
      if (!n) continue;
      const key = normalizeName(n);
      if (key && !index.has(key)) index.set(key, ing);
    }
    // "Octinoxate (Octyl methoxycinnamate)" түріндегі common_name үшін жақша алдындағы бөлігін де қос
    if (ing.commonName) {
      const base = normalizeName(ing.commonName.replace(/\(.*?\)/g, ''));
      if (base && !index.has(base)) index.set(base, ing);
    }
  }
  return index;
}

function candidates(raw) {
  const out = new Set();
  const n = normalizeName(raw);
  out.add(n);
  out.add(normalizeName(raw.replace(/\(.*?\)|\[.*?\]/g, ' ')));
  for (const m of raw.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)) out.add(normalizeName(m[1] ?? m[2]));
  for (const piece of n.split('/')) out.add(piece.trim());
  out.delete('');
  return [...out];
}

/** Бір ингредиентті базадан іздейді. */
export function matchOne(raw, index) {
  for (const c of candidates(raw)) {
    const hit = index.get(c);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {{raw:string, optional:boolean}[]} items
 * @param {object[]} ingredients  базадағы барлық ингредиенттер
 */
export function matchIngredients(items, ingredients) {
  const index = buildIndex(ingredients);
  const result = items.map((it, i) => {
    const hit = matchOne(it.raw, index);
    return {
      position: i + 1,
      raw: it.raw,
      optional: it.optional,
      key: hit ? `db:${hit.id}` : `raw:${normalizeName(it.raw)}`,
      match: hit,
    };
  });
  const matched = result.filter((r) => r.match);
  const byCategory = {};
  for (const r of matched) {
    for (const c of r.match.categories || []) byCategory[c] = (byCategory[c] || 0) + 1;
  }
  return {
    items: result,
    stats: {
      total: result.length,
      matched: matched.length,
      unmatched: result.length - matched.length,
      byCategory,
    },
  };
}

/** Жай INCI тізімі шынымен ингредиент тізіміне ұқсайтынын тексереді (галлюцинацияға қарсы). */
export function looksLikeInciList(items) {
  if (items.length < 3) return false;
  const tooLong = items.filter((i) => i.raw.split(' ').length > 8).length;
  return tooLong / items.length < 0.3;
}
