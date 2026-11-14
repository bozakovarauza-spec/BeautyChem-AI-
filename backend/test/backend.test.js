// Backend логикасының автоматты тесттері: node:test (қосымша тәуелділіксіз).
// Gemini API орнына жергілікті ЖАЛҒЫЗ ТЕСТ серверін қолданады: бұл тек кодтың
// сұрау/жауап өңдеуін тексеру үшін, қосымшаның өзінде жалған жауап жоқ.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// ---- Mock Gemini сервері ----
let mockHandler = () => ({ status: 500, body: {} });
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { status, body: out } = mockHandler(JSON.parse(body || '{}'), req);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${mock.address().port}/v1beta`;
process.env.GEMINI_API_KEY = 'test-key';

const { config } = await import('../src/config.js');
const { openDatabase, listAllIngredients } = await import('../src/db.js');
const { createHandlers, HttpError, detectImageMime } = await import('../src/handlers.js');
const { parseInciText, matchIngredients, normalizeName } = await import('../src/services/inci.js');

const db = openDatabase(':memory:');
const h = createHandlers(db);

function call(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); },
      type() { return this; },
      send(o) { resolve({ status: this.statusCode, body: o }); },
    };
    Promise.resolve()
      .then(() => handler({ body: {}, query: {}, params: {}, headers: {}, ...req }, res))
      .catch(reject);
  });
}
const fail = async (p) => { try { await p; } catch (e) { return e; } throw new Error('қате күтілген еді'); };

const geminiReply = (text, extra = {}) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] }, ...extra }] } });
const jpegBuf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

// ---------- Химиялық база ----------
const ATOMIC = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, Mg: 24.305, Si: 28.085, Ti: 47.867, Zn: 65.38 };
function formulaMass(f) {
  const stack = [{}];
  let i = 0;
  while (i < f.length) {
    const c = f[i];
    if (c === '(') { stack.push({}); i++; }
    else if (c === ')') {
      i++;
      let num = ''; while (/\d/.test(f[i] || '')) num += f[i++];
      const top = stack.pop(); const mult = num ? Number(num) : 1;
      for (const [k, v] of Object.entries(top)) stack[stack.length - 1][k] = (stack[stack.length - 1][k] || 0) + v * mult;
    } else {
      let el = f[i++]; if (/[a-z]/.test(f[i] || '')) el += f[i++];
      let num = ''; while (/\d/.test(f[i] || '')) num += f[i++];
      stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + (num ? Number(num) : 1);
    }
  }
  return Object.entries(stack[0]).reduce((s, [k, v]) => s + ATOMIC[k] * v, 0);
}

test('бастапқы базада 14 ингредиент бар', () => {
  assert.equal(listAllIngredients(db).length, 14);
});

test('формулалар мен молекулалық массалар сәйкес келеді', () => {
  for (const ing of listAllIngredients(db)) {
    const f = ing.formula.replace('(C2H6OSi)n', 'C2H6OSi'); // полимер: қайталанатын буын
    assert.ok(Math.abs(formulaMass(f) - ing.molarMass) < 0.06, `${ing.inciName}: ${formulaMass(f).toFixed(2)} ≠ ${ing.molarMass}`);
  }
});

test('API: ингредиент іздеу, сүзгі, мета', async () => {
  let r = await call(h.listIngredients, { query: { q: 'niacin' } });
  assert.equal(r.body.total, 1);
  r = await call(h.listIngredients, { query: { q: 'C3H8O3' } });
  assert.equal(r.body.items[0].inciName, 'Glycerin');
  r = await call(h.listIngredients, { query: { category: 'UV сүзгі' } });
  assert.equal(r.body.total, 5);
  r = await call(h.ingredientMeta);
  assert.ok(r.body.categories.includes('Ылғалдандырғыш'));
});

test('API: жаңа ингредиент қосу, қайталануды және валидацияны тексеру', async () => {
  const payload = { inciName: 'Test Acid', nameKk: 'Тест қышқылы', formula: 'C2H4O2', chemClass: 'Карбон қышқылы', properties: 'Сынақ', functionKk: 'Сынақ', molarMass: '60,05', sources: [{ title: 'PubChem', url: 'https://pubchem.ncbi.nlm.nih.gov' }] };
  const r = await call(h.createIngredient, { body: payload });
  assert.equal(r.status, 201);
  assert.equal(r.body.molarMass, 60.05);
  assert.equal((await fail(call(h.createIngredient, { body: payload }))).status, 409);
  assert.equal((await fail(call(h.createIngredient, { body: { inciName: 'X' } }))).status, 400);
  assert.equal((await fail(call(h.deleteIngredient, { params: { id: '1' } }))).status, 403); // seed жойылмайды
  assert.equal((await call(h.deleteIngredient, { params: { id: String(r.body.id) } })).body.ok, true);
});

// ---------- INCI өңдеу және сәйкестендіру ----------
test('INCI мәтінін бөлу: белгі, жақша ішіндегі үтір, +/- бөлігі', () => {
  const items = parseInciText('Ingredients: Aqua (Water), Glycerin, CI 77491 (Iron Oxides, Yellow), Tocopherol. [+/- CI 77891]');
  assert.deepEqual(items.map((i) => i.raw), ['Aqua (Water)', 'Glycerin', 'CI 77491 (Iron Oxides, Yellow)', 'Tocopherol', 'CI 77891']);
  assert.equal(items[4].optional, true);
});

test('сәйкестендіру: нақты, синоним, табылмаған', () => {
  const ings = listAllIngredients(db);
  const text = 'Aqua/Water/Eau, Glycerin, Nicotinamide, Butyl Methoxydibenzoylmethane, Ethylhexyl Methoxycinnamate, Benzophenone-3, Titanium Dioxide (nano), Alcohol Denat., Parfum, Tocopheryl Acetate';
  const { items, stats } = matchIngredients(parseInciText(text), ings);
  const byRaw = Object.fromEntries(items.map((i) => [i.raw, i.match?.inciName ?? null]));
  assert.equal(byRaw['Glycerin'], 'Glycerin');
  assert.equal(byRaw['Nicotinamide'], 'Niacinamide');
  assert.equal(byRaw['Butyl Methoxydibenzoylmethane'], 'Butyl Methoxydibenzoylmethane');
  assert.equal(byRaw['Titanium Dioxide (nano)'], 'Titanium Dioxide');
  assert.equal(byRaw['Alcohol Denat'], 'Alcohol');
  assert.equal(byRaw['Aqua/Water/Eau'], null);
  assert.equal(byRaw['Parfum'], null);
  assert.equal(byRaw['Tocopheryl Acetate'], null, 'Tocopheryl Acetate ≠ Tocopherol: болжап сәйкестендірілмеуі керек');
  assert.equal(stats.total, 10);
  assert.equal(stats.matched, 7);
  assert.equal(stats.byCategory['UV сүзгі'], 4);
  assert.equal(normalizeName(' Benzophenone – 3 '), 'benzophenone-3');
});

test('API: match / products / lookup (жергілікті база)', async () => {
  const inciText = 'Aqua, Glycerin, Niacinamide, Panthenol, Tocopherol';
  let r = await call(h.match, { body: { text: inciText } });
  assert.equal(r.body.stats.matched, 4);
  assert.equal((await fail(call(h.match, { body: {} }))).status, 400);

  assert.equal((await fail(call(h.createProduct, { body: { brand: 'A', name: 'B', inciText: 'Aqua' } }))).status, 400);
  r = await call(h.createProduct, { body: { brand: 'TestBrand', name: 'Test Serum', productType: 'Serum', market: 'KZ', formulaYear: '2025', inciText } });
  assert.equal(r.status, 201);

  r = await call(h.lookupInci, { body: { brand: 'testbrand', productName: 'Test Serum' } });
  assert.equal(r.body.local.length, 1);
  assert.equal(r.body.web, null);
});

// ---------- Сурет ----------
test('сурет түрін магиялық байттармен тексеру', () => {
  assert.equal(detectImageMime(jpegBuf), 'image/jpeg');
  assert.equal(detectImageMime(Buffer.from('GIF89a......')), null);
  assert.equal(detectImageMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)])), 'image/webp');
});

// ---------- Gemini интеграциясы (mock сервер) ----------
test('Gemini кілті жоқ болса: нақты қате, жалған жауап жоқ', async () => {
  const key = config.geminiKey;
  config.geminiKey = '';
  const e = await fail(call(h.analyze, { file: { buffer: jpegBuf } }));
  assert.equal(e.status, 503);
  assert.equal(e.code, 'no_api_key');
  config.geminiKey = key;
});

test('analyze: суретсіз 400, дұрыс емес файл 415, дұрыс JSON өңделеді', async () => {
  assert.equal((await fail(call(h.analyze, {}))).status, 400);
  assert.equal((await fail(call(h.analyze, { file: { buffer: Buffer.from('not an image at all') } }))).status, 415);

  let seen;
  mockHandler = (body, req) => {
    seen = { body, key: req.headers['x-goog-api-key'] };
    return geminiReply('```json\n{"brand":"La Roche-Posay","productName":"Anthelios UVMune 400","productType":"Sunscreen","category":"Face / Sun protection","volume":"50 ml","spf":"SPF 50+","packagingTexts":["SPF 50+"],"confidence":0.91,"ingredientsVisible":false,"inciText":null,"alternatives":[],"notes":null}\n```');
  };
  const r = await call(h.analyze, { file: { buffer: jpegBuf } });
  assert.equal(seen.key, 'test-key');
  assert.equal(seen.body.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
  assert.equal(r.body.productType, 'Sunscreen');
  assert.equal(r.body.confidence, 0.91);
  assert.equal(r.body.inciText, null);
});

test('lookup (веб): grounding жоқ тізім қабылданбайды, grounding бар болса қабылданады', async () => {
  const good = '{"found":true,"inciText":"Aqua, Glycerin, Niacinamide, Panthenol, Tocopherol","sourceName":"Brand","sourceUrl":"https://example.com/p","sourceType":"official","variantNote":null,"exactProductMatch":true}';
  mockHandler = (body) => {
    assert.ok(body.tools?.[0]?.google_search, 'Google Search grounding қосылуы керек');
    return geminiReply(good);
  };
  let r = await call(h.lookupInci, { body: { brand: 'NoSuch', productName: 'Unknown Cream' } });
  assert.equal(r.body.web.found, false);
  assert.equal(r.body.web.reason, 'no_grounding');

  mockHandler = () => geminiReply(good, { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/p', title: 'example.com' } }], webSearchQueries: ['q'] } });
  r = await call(h.lookupInci, { body: { brand: 'NoSuch', productName: 'Unknown Cream' } });
  assert.equal(r.body.web.found, true);
  assert.equal(r.body.web.items.length, 5);
  assert.equal(r.body.web.sources[0].url, 'https://example.com/p');

  mockHandler = () => geminiReply('{"found":false,"inciText":null}');
  r = await call(h.lookupInci, { body: { brand: 'NoSuch', productName: 'Unknown Cream' } });
  assert.equal(r.body.web.found, false);
});

test('OCR және explain', async () => {
  mockHandler = () => geminiReply('{"inciText":"Aqua, Glycerin, Niacinamide","language":"en","uncertainParts":[],"notes":null}');
  let r = await call(h.ocr, { file: { buffer: jpegBuf } });
  assert.equal(r.body.readable, true);
  assert.equal(r.body.items.length, 3);

  mockHandler = () => geminiReply('{"inciText":null}');
  r = await call(h.ocr, { file: { buffer: jpegBuf } });
  assert.equal(r.body.readable, false);

  let prompt = '';
  mockHandler = (body) => { prompt = body.contents[0].parts[0].text; return geminiReply('Қорытынды **мәтін**.'); };
  r = await call(h.explain, { body: { inciText: 'Aqua, Glycerin, Niacinamide, Parfum', product: { brand: 'B', name: 'N' } } });
  assert.equal(r.body.summary, 'Қорытынды мәтін.');
  assert.ok(prompt.includes('Niacinamide') && prompt.includes('Parfum'));
  assert.equal((await fail(call(h.explain, { body: { inciText: 'Aqua, Parfum, Linalool' } }))).status, 422);
});

test('Gemini қателері дұрыс статусқа айналады', async () => {
  mockHandler = () => ({ status: 429, body: { error: { message: 'quota' } } });
  assert.equal((await fail(call(h.analyze, { file: { buffer: jpegBuf } }))).status, 429);
  mockHandler = () => ({ status: 400, body: { error: { message: 'API key not valid' } } });
  assert.equal((await fail(call(h.analyze, { file: { buffer: jpegBuf } }))).code, 'bad_key');
  mockHandler = () => geminiReply('жай мәтін, JSON емес');
  assert.equal((await fail(call(h.analyze, { file: { buffer: jpegBuf } }))).code, 'bad_json');
});

// ---------- Тарих ----------
test('тарих: құрылғыларға бөлінеді, жоюға болады', async () => {
  const A = { 'x-device-id': 'device-aaaaaaaaaaaaaaaa' };
  const B = { 'x-device-id': 'device-bbbbbbbbbbbbbbbb' };
  assert.equal((await fail(call(h.listHistory, { headers: {} }))).status, 400);
  const created = await call(h.createHistory, { headers: A, body: { brand: 'X', productName: 'Y', productType: 'Serum', thumb: 'data:image/jpeg;base64,AAAA', result: { ok: 1 } } });
  assert.equal(created.status, 201);
  assert.equal((await call(h.listHistory, { headers: A })).body.items.length, 1);
  assert.equal((await call(h.listHistory, { headers: B })).body.items.length, 0);
  assert.equal((await fail(call(h.getHistory, { headers: B, params: { id: String(created.body.id) } }))).status, 404);
  assert.deepEqual((await call(h.getHistory, { headers: A, params: { id: String(created.body.id) } })).body.result, { ok: 1 });
  await call(h.updateHistorySummary, { headers: A, params: { id: String(created.body.id) }, body: { summary: 'Жаңартылған қорытынды' } });
  assert.equal((await call(h.getHistory, { headers: A, params: { id: String(created.body.id) } })).body.result.summary, 'Жаңартылған қорытынды');
  await call(h.deleteHistory, { headers: A, params: { id: String(created.body.id) } });
  assert.equal((await call(h.listHistory, { headers: A })).body.items.length, 0);
});

test.after(() => mock.close());
