import { config } from './config.js';
import { rowToIngredient, listAllIngredients } from './db.js';
import { geminiConfigured, GeminiError } from './services/gemini.js';
import { parseInciText, matchIngredients, looksLikeInciList } from './services/inci.js';
import { analyzeProductImage, ocrIngredients, lookupInciOnWeb, explainInKazakh } from './services/vision.js';

export class HttpError extends Error {
  constructor(status, message, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isStr = (v, max = 500) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optStr = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Сурет файлының нақты түрін магиялық байттар бойынша тексереді. */
export function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function requireImage(req) {
  const f = req.file;
  if (!f || !f.buffer?.length) throw new HttpError(400, 'Сурет жүктелмеді. JPG, PNG немесе WEBP файлын таңдаңыз.', 'no_image');
  const mime = detectImageMime(f.buffer);
  if (!mime) throw new HttpError(415, 'Қолдау көрсетілмейтін файл түрі. Тек JPG, JPEG, PNG, WEBP қабылданады.', 'bad_image');
  return { buffer: f.buffer, mime };
}

function deviceId(req) {
  const id = req.headers?.['x-device-id'];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    throw new HttpError(400, 'Құрылғы идентификаторы (X-Device-Id) жарамсыз.', 'bad_device');
  }
  return id;
}

export function createHandlers(db) {
  const h = {};

  // ---------- Денсаулық ----------
  h.health = (req, res) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM ingredients').get();
    res.json({ ok: true, geminiConfigured: geminiConfigured(), model: config.geminiModel, ingredientCount: n });
  };

  // ---------- Химиялық база ----------
  h.listIngredients = (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim();
    const chemClass = String(req.query.class || '').trim();
    let items = listAllIngredients(db);
    if (q) {
      items = items.filter((i) =>
        [i.inciName, i.commonName, i.nameKk, i.formula, i.cas, i.chemClass, ...i.synonyms]
          .filter(Boolean)
          .some((s) => s.toLowerCase().includes(q)),
      );
    }
    if (category) items = items.filter((i) => i.categories.includes(category));
    if (chemClass) items = items.filter((i) => i.chemClass === chemClass);
    res.json({ items, total: items.length });
  };

  h.ingredientMeta = (req, res) => {
    const all = listAllIngredients(db);
    const categories = [...new Set(all.flatMap((i) => i.categories))].sort((a, b) => a.localeCompare(b, 'kk'));
    const classes = [...new Set(all.map((i) => i.chemClass))].sort((a, b) => a.localeCompare(b, 'kk'));
    res.json({ categories, classes, total: all.length });
  };

  h.getIngredient = (req, res) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id) : null;
    if (!row) throw new HttpError(404, 'Ингредиент табылмады.', 'not_found');
    res.json(rowToIngredient(row));
  };

  h.createIngredient = (req, res) => {
    const b = req.body || {};
    const required = { inciName: 'INCI атауы', nameKk: 'Қазақша атауы', formula: 'Химиялық формуласы', chemClass: 'Химиялық класы', properties: 'Физикалық-химиялық қасиеттері', functionKk: 'Косметикадағы қызметі' };
    for (const [k, label] of Object.entries(required)) {
      if (!isStr(b[k], 2000)) throw new HttpError(400, `«${label}» өрісі міндетті.`, 'validation');
    }
    let molarMass = null;
    if (b.molarMass !== undefined && b.molarMass !== null && b.molarMass !== '') {
      molarMass = Number(String(b.molarMass).replace(',', '.'));
      if (!isFinite(molarMass) || molarMass <= 0 || molarMass > 1e7) throw new HttpError(400, 'Молекулалық масса оң сан болуы керек.', 'validation');
    }
    const categories = Array.isArray(b.categories) ? b.categories.filter((c) => isStr(c, 60)).map((c) => c.trim()).slice(0, 10) : [];
    const synonyms = Array.isArray(b.synonyms) ? b.synonyms.filter((c) => isStr(c, 120)).map((c) => c.trim()).slice(0, 30) : [];
    const sources = Array.isArray(b.sources)
      ? b.sources
          .filter((s) => s && isStr(s.title, 200) && (!s.url || /^https?:\/\//i.test(s.url)))
          .map((s) => ({ title: s.title.trim(), url: s.url ? String(s.url).trim() : '' }))
          .slice(0, 10)
      : [];

    const exists = db.prepare('SELECT id FROM ingredients WHERE lower(inci_name) = lower(?)').get(b.inciName.trim());
    if (exists) throw new HttpError(409, 'Мұндай INCI атауы базада бар.', 'duplicate');

    const info = db
      .prepare(`INSERT INTO ingredients
        (inci_name, common_name, name_kk, formula, chem_class, molar_mass, cas, properties, function_kk,
         categories, mechanism, benefits, risks, synonyms, pubchem_query, sources, is_custom)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`)
      .run(
        b.inciName.trim(), optStr(b.commonName, 200), b.nameKk.trim(), b.formula.trim(), b.chemClass.trim(),
        molarMass, optStr(b.cas, 30), b.properties.trim(), b.functionKk.trim(),
        JSON.stringify(categories), optStr(b.mechanism, 2000), optStr(b.benefits, 2000), optStr(b.risks, 2000),
        JSON.stringify(synonyms), optStr(b.pubchemQuery, 80), JSON.stringify(sources),
      );
    const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json(rowToIngredient(row));
  };

  h.deleteIngredient = (req, res) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id) : null;
    if (!row) throw new HttpError(404, 'Ингредиент табылмады.', 'not_found');
    if (!row.is_custom) throw new HttpError(403, 'Бастапқы базадағы ингредиентті жоюға болмайды.', 'forbidden');
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(id);
    res.json({ ok: true });
  };

  // ---------- AI: өнімді тану ----------
  h.analyze = async (req, res) => {
    const { buffer, mime } = requireImage(req);
    const result = await analyzeProductImage(buffer, mime);
    res.json(result);
  };

  // ---------- OCR ----------
  h.ocr = async (req, res) => {
    const { buffer, mime } = requireImage(req);
    const result = await ocrIngredients(buffer, mime);
    res.json(result);
  };

  // ---------- INCI іздеу: жергілікті база -> веб ----------
  h.lookupInci = async (req, res) => {
    const b = req.body || {};
    const brand = optStr(b.brand, 120);
    const productName = optStr(b.productName, 200);
    if (!productName) throw new HttpError(400, 'Өнім атауы қажет.', 'validation');

    let rows = [];
    if (brand) {
      rows = db.prepare('SELECT * FROM products WHERE lower(brand) = lower(?) AND lower(name) = lower(?) ORDER BY id DESC').all(brand, productName);
    }
    if (!rows.length) {
      rows = db.prepare('SELECT * FROM products WHERE lower(name) LIKE lower(?) ORDER BY id DESC LIMIT 10').all(`%${productName}%`);
      if (brand) rows = rows.filter((r) => r.brand.toLowerCase().includes(brand.toLowerCase()) || brand.toLowerCase().includes(r.brand.toLowerCase()));
    }
    const local = rows.map((r) => ({
      id: r.id, brand: r.brand, name: r.name, productType: r.product_type, volume: r.volume,
      market: r.market, formulaYear: r.formula_year, inciText: r.inci_text, sourceUrl: r.source_url,
      sourceNote: r.source_note, createdAt: r.created_at,
    }));
    if (local.length && !b.forceWeb) return res.json({ local, web: null });

    const web = await lookupInciOnWeb({ brand, productName, volume: optStr(b.volume, 40), market: optStr(b.market, 60) });
    res.json({ local, web });
  };

  // ---------- Сәйкестендіру ----------
  h.match = (req, res) => {
    const b = req.body || {};
    let items;
    if (typeof b.text === 'string') items = parseInciText(b.text);
    else if (Array.isArray(b.items)) items = b.items.filter((x) => typeof x === 'string').map((raw) => ({ raw: raw.trim(), optional: false })).filter((x) => x.raw);
    else throw new HttpError(400, 'INCI мәтіні (text) қажет.', 'validation');
    if (!items.length) throw new HttpError(400, 'Ингредиент табылмады. Мәтінді тексеріңіз.', 'empty');
    if (items.length > 300) throw new HttpError(400, 'Ингредиент саны тым көп (максимум 300).', 'too_many');
    res.json(matchIngredients(items, listAllIngredients(db)));
  };

  // ---------- Қазақша қорытынды (Gemini; тек база деректері негізінде) ----------
  h.explain = async (req, res) => {
    const b = req.body || {};
    const items = parseInciText(String(b.inciText || ''));
    if (!items.length) throw new HttpError(400, 'INCI мәтіні қажет.', 'validation');
    const { items: matched } = matchIngredients(items, listAllIngredients(db));
    const hits = matched.filter((m) => m.match);
    if (!hits.length) throw new HttpError(422, 'Базадан табылған ингредиент жоқ, қорытынды жасалмады.', 'nothing_matched');
    const product = {
      brand: optStr(b.product?.brand, 120),
      name: optStr(b.product?.name, 200),
      type: optStr(b.product?.type, 60),
    };
    const summary = await explainInKazakh({
      product,
      matched: hits,
      unmatched: matched.filter((m) => !m.match).map((m) => m.raw),
    });
    res.json({ summary, model: config.geminiModel });
  };

  // ---------- Жергілікті өнімдер базасы ----------
  h.listProducts = (req, res) => {
    const rows = db.prepare('SELECT * FROM products ORDER BY id DESC LIMIT 200').all();
    res.json({ items: rows.map((r) => ({ id: r.id, brand: r.brand, name: r.name, productType: r.product_type, volume: r.volume, market: r.market, formulaYear: r.formula_year, inciText: r.inci_text, sourceUrl: r.source_url, sourceNote: r.source_note, createdAt: r.created_at })) });
  };

  h.createProduct = (req, res) => {
    const b = req.body || {};
    if (!isStr(b.brand, 120) || !isStr(b.name, 200)) throw new HttpError(400, 'Бренд пен өнім атауы міндетті.', 'validation');
    if (!isStr(b.inciText, 8000)) throw new HttpError(400, 'INCI мәтіні міндетті.', 'validation');
    const items = parseInciText(b.inciText);
    if (!looksLikeInciList(items)) throw new HttpError(400, 'Бұл INCI ингредиент тізіміне ұқсамайды (кемінде 3 ингредиент қажет).', 'validation');
    if (b.sourceUrl && !/^https?:\/\//i.test(b.sourceUrl)) throw new HttpError(400, 'Дереккөз сілтемесі http(s) болуы керек.', 'validation');
    const info = db
      .prepare('INSERT INTO products (brand, name, product_type, volume, market, formula_year, inci_text, source_url, source_note) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(b.brand.trim(), b.name.trim(), optStr(b.productType, 40), optStr(b.volume, 40), optStr(b.market, 60), optStr(b.formulaYear, 40), b.inciText.trim(), optStr(b.sourceUrl, 500), optStr(b.sourceNote, 300));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  };

  // ---------- Тарих ----------
  h.listHistory = (req, res) => {
    const did = deviceId(req);
    const rows = db.prepare('SELECT id, brand, product_name, product_type, thumb, created_at FROM history WHERE device_id = ? ORDER BY id DESC LIMIT 100').all(did);
    res.json({ items: rows.map((r) => ({ id: r.id, brand: r.brand, productName: r.product_name, productType: r.product_type, thumb: r.thumb, createdAt: r.created_at })) });
  };

  h.getHistory = (req, res) => {
    const did = deviceId(req);
    const row = db.prepare('SELECT * FROM history WHERE id = ? AND device_id = ?').get(Number(req.params.id), did);
    if (!row) throw new HttpError(404, 'Жазба табылмады.', 'not_found');
    res.json({ id: row.id, brand: row.brand, productName: row.product_name, productType: row.product_type, thumb: row.thumb, createdAt: row.created_at, result: JSON.parse(row.result) });
  };

  h.createHistory = (req, res) => {
    const did = deviceId(req);
    const b = req.body || {};
    if (!b.result || typeof b.result !== 'object') throw new HttpError(400, 'Нәтиже қажет.', 'validation');
    const json = JSON.stringify(b.result);
    if (json.length > 600_000) throw new HttpError(413, 'Нәтиже тым үлкен.', 'too_large');
    const thumb = typeof b.thumb === 'string' && b.thumb.startsWith('data:image/jpeg;base64,') && b.thumb.length < 120_000 ? b.thumb : null;
    const info = db
      .prepare('INSERT INTO history (device_id, brand, product_name, product_type, thumb, result) VALUES (?,?,?,?,?,?)')
      .run(did, optStr(b.brand, 120), optStr(b.productName, 200), optStr(b.productType, 60), thumb, json);
    // Бір құрылғы үшін ең көбі 100 жазба сақталады
    db.prepare('DELETE FROM history WHERE device_id = ? AND id NOT IN (SELECT id FROM history WHERE device_id = ? ORDER BY id DESC LIMIT 100)').run(did, did);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  };

  h.updateHistorySummary = (req, res) => {
    const did = deviceId(req);
    const summary = req.body?.summary;
    if (!isStr(summary, 8000)) throw new HttpError(400, 'Қорытынды мәтіні қажет.', 'validation');
    const row = db.prepare('SELECT id, result FROM history WHERE id = ? AND device_id = ?').get(Number(req.params.id), did);
    if (!row) throw new HttpError(404, 'Жазба табылмады.', 'not_found');
    const result = JSON.parse(row.result);
    result.summary = summary.trim();
    db.prepare('UPDATE history SET result = ? WHERE id = ?').run(JSON.stringify(result), row.id);
    res.json({ ok: true });
  };

  h.deleteHistory = (req, res) => {
    const did = deviceId(req);
    const info = db.prepare('DELETE FROM history WHERE id = ? AND device_id = ?').run(Number(req.params.id), did);
    if (!info.changes) throw new HttpError(404, 'Жазба табылмады.', 'not_found');
    res.json({ ok: true });
  };

  h.clearHistory = (req, res) => {
    const did = deviceId(req);
    db.prepare('DELETE FROM history WHERE device_id = ?').run(did);
    res.json({ ok: true });
  };

  // ---------- 3D молекула (PubChem, кэшпен) ----------
  h.molecule = async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q || q.length > 80 || !/^[\p{L}\p{N}\s,\-+()'.]+$/u.test(q)) throw new HttpError(400, 'Жарамсыз іздеу атауы.', 'validation');
    const cached = db.prepare('SELECT sdf FROM molecules WHERE query = ?').get(q);
    if (cached) {
      if (cached.sdf === null) throw new HttpError(404, '3D құрылымы PubChem-те жоқ.', 'no_3d');
      return res.type('text/plain').send(cached.sdf);
    }
    let r;
    try {
      r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/SDF?record_type=3d`, {
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new HttpError(502, `PubChem-ке қосылу мүмкін болмады: ${e.message}`, 'pubchem_network');
    }
    if (r.status === 404) {
      db.prepare('INSERT OR REPLACE INTO molecules (query, sdf) VALUES (?, NULL)').run(q);
      throw new HttpError(404, '3D құрылымы PubChem-те жоқ.', 'no_3d');
    }
    if (!r.ok) throw new HttpError(502, `PubChem жауабы: HTTP ${r.status}`, 'pubchem_error');
    const sdf = await r.text();
    if (!sdf.includes('M  END')) throw new HttpError(502, 'PubChem жарамсыз SDF қайтарды.', 'pubchem_bad');
    db.prepare('INSERT OR REPLACE INTO molecules (query, sdf) VALUES (?, ?)').run(q, sdf);
    res.type('text/plain').send(sdf);
  };

  return h;
}

export { GeminiError };
