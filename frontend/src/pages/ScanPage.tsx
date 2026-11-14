import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { AnalysisResult, HealthInfo, InciOrigin, LocalProduct, ProductInfo, WebLookup } from '../types';
import { ACCEPTED_TYPES, ACCEPT_ATTR, compressImage, makeThumb } from '../lib/image';
import { PRODUCT_TYPES, productTypeKk } from '../lib/format';
import { CameraCapture } from '../components/CameraCapture';
import { Icon } from '../components/Icon';
import { ErrorBox, Spinner } from '../components/Spinner';
import { ResultView } from '../components/ResultView';
import { SourceList } from '../components/IngredientDetails';
import { useOnline } from '../lib/pwa';

type Step = 'start' | 'preview' | 'analyzing' | 'product' | 'finding' | 'inci' | 'matching' | 'result';
type Purpose = 'front' | 'back';

interface Img { blob: Blob; url: string }
interface Form { brand: string; name: string; type: string; volume: string; spf: string }

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Күтпеген қате орын алды.');

export default function ScanPage() {
  const online = useOnline();
  const [step, setStep] = useState<Step>('start');
  const [image, setImage] = useState<Img | null>(null);
  const [cameraFor, setCameraFor] = useState<Purpose | null>(null);
  const [info, setInfo] = useState<ProductInfo | null>(null);
  const [form, setForm] = useState<Form>({ brand: '', name: '', type: '', volume: '', spf: '' });
  const [inciText, setInciText] = useState('');
  const [origin, setOrigin] = useState<InciOrigin>({ kind: 'manual' });
  const [localCands, setLocalCands] = useState<LocalProduct[]>([]);
  const [web, setWeb] = useState<WebLookup | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [saveProduct, setSaveProduct] = useState(false);
  const [market, setMarket] = useState('');
  const [year, setYear] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  const galleryFront = useRef<HTMLInputElement>(null);
  const galleryBack = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => undefined);
  }, []);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const aiMissing = health && !health.geminiConfigured;

  // ---------- Сурет алу ----------
  const acceptBlob = async (raw: Blob, purpose: Purpose) => {
    setError(null);
    try {
      const blob = await compressImage(raw);
      if (purpose === 'front') {
        setImage({ blob, url: URL.createObjectURL(blob) });
        setStep('preview');
      } else {
        await runOcr(blob);
      }
    } catch (e) {
      setError(msg(e));
    }
  };

  const onFile = (file: File | undefined, purpose: Purpose) => {
    if (!file) return;
    const okType = ACCEPTED_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!okType) return setError('Тек JPG, JPEG, PNG немесе WEBP суреттері қабылданады.');
    if (file.size > 25 * 1024 * 1024) return setError('Сурет тым үлкен (25 МБ-тан аспауы керек).');
    void acceptBlob(file, purpose);
  };

  const removeImage = () => {
    setImage(null);
    setStep('start');
  };

  // ---------- 1-қадам: өнімді тану ----------
  const analyze = async () => {
    if (!image) return;
    setError(null);
    setStep('analyzing');
    try {
      const r = await api.analyze(image.blob);
      setInfo(r);
      setForm({ brand: r.brand ?? '', name: r.productName ?? '', type: r.productType ?? '', volume: r.volume ?? '', spf: r.spf ?? '' });
      setStep('product');
    } catch (e) {
      setError(msg(e));
      setStep('preview');
    }
  };

  // ---------- 2-қадам: құрамды табу ----------
  const findInci = async () => {
    if (!form.name.trim()) return setError('Өнім атауын енгізіңіз (немесе төмендегі нұсқалардан таңдаңыз).');
    setError(null);
    setLocalCands([]);
    setWeb(null);
    setLookupNote(null);
    setOcrNote(null);

    if (info?.inciText && info.inciText) {
      setInciText(info.inciText);
      setOrigin({ kind: 'label', note: 'Мәтін алдыңғы суреттен оқылды. Дұрыстығын тексеріңіз.' });
      setStep('inci');
      return;
    }

    setStep('finding');
    try {
      const r = await api.lookup({ brand: form.brand.trim() || null, productName: form.name.trim(), volume: form.volume || null });
      setLocalCands(r.local);
      setWeb(r.web);
      if (r.local.length === 1) {
        useLocal(r.local[0]);
      } else if (r.web?.found && r.web.inciText) {
        setInciText(r.web.inciText);
        setOrigin({ kind: 'web', sourceName: r.web.sourceName, sources: r.web.sources, note: r.web.variantNote });
      } else if (!r.local.length) {
        setLookupNote(
          'Бұл өнімнің құрамы жергілікті базада да, сенімді веб-дереккөздерде де нақты табылмады. Құрамды ойдан шығармаймыз: қаптаманың артқы жағын суретке түсіріңіз немесе мәтінді қолмен енгізіңіз.',
        );
      }
    } catch (e) {
      setLookupNote(`Автоматты іздеу мүмкін болмады: ${msg(e)} Артқы жағын түсіріп немесе қолмен енгізіп жалғастыруға болады.`);
    }
    setStep('inci');
  };

  const useLocal = (p: LocalProduct) => {
    setInciText(p.inciText);
    setOrigin({
      kind: 'local',
      sourceName: `Жергілікті база: ${p.brand} ${p.name}${p.market ? ` (${p.market}` : ''}${p.formulaYear ? `${p.market ? ', ' : ' ('}${p.formulaYear}` : ''}${p.market || p.formulaYear ? ')' : ''}`,
      sources: p.sourceUrl ? [{ title: p.sourceNote || p.sourceUrl, url: p.sourceUrl }] : [],
    });
  };

  // ---------- OCR (артқы жағы) ----------
  const runOcr = async (blob: Blob) => {
    setOcrBusy(true);
    setError(null);
    setOcrNote(null);
    try {
      const r = await api.ocr(blob);
      if (r.readable && r.inciText) {
        setInciText(r.inciText);
        setOrigin({ kind: 'ocr', note: 'OCR нәтижесі: мәтінді қаптамамен салыстырып тексеріңіз.' });
        const parts = r.uncertainParts.length ? ` Анық оқылмаған бөліктер: ${r.uncertainParts.join('; ')}.` : '';
        setOcrNote(`OCR мәтінді оқыды. Төмендегі өрісте қателерді түзетіп, «Талдау» батырмасын басыңыз.${parts}`);
      } else {
        setError('Суреттен ингредиент тізімі оқылмады. Құрам жазылған жағын жақынырақ, жарықта және анық түсіріңіз.');
      }
    } catch (e) {
      setError(msg(e));
    } finally {
      setOcrBusy(false);
    }
  };

  // ---------- 3-қадам: талдау ----------
  const runMatch = async () => {
    const text = inciText.trim();
    if (!text) return setError('INCI мәтіні бос. Құрамды енгізіңіз немесе суреттен оқыңыз.');
    setError(null);
    setStep('matching');
    try {
      const match = await api.match(text);
      const confidence = info ? info.confidence : null;
      const res: AnalysisResult = {
        product: {
          brand: form.brand.trim() || null,
          name: form.name.trim() || null,
          type: form.type || null,
          category: info?.category ?? null,
          volume: form.volume.trim() || null,
          spf: form.spf.trim() || null,
          confidence,
        },
        inciText: text,
        origin,
        match,
        summary: null,
        createdAt: new Date().toISOString(),
      };
      setResult(res);
      setStep('result');

      if (saveProduct && form.brand.trim() && form.name.trim()) {
        api
          .saveProduct({
            brand: form.brand.trim(), name: form.name.trim(), productType: form.type || null, volume: form.volume || null,
            market: market || null, formulaYear: year || null, inciText: text,
            sourceUrl: origin.sources?.[0]?.url || null, sourceNote: origin.sourceName || originLabel(origin.kind),
          })
          .catch(() => undefined);
      }

      const thumb = image ? await makeThumb(image.blob) : null;
      let hid: number | null = null;
      try {
        const h = await api.saveHistory({ brand: res.product.brand, productName: res.product.name, productType: res.product.type, thumb, result: res });
        hid = h.id;
        setHistoryId(h.id);
      } catch {
        /* тарихқа сақталмаса да нәтиже көрсетіледі */
      }
      if (health?.geminiConfigured && match.stats.matched > 0) void requestSummary(res, hid);
    } catch (e) {
      setError(msg(e));
      setStep('inci');
    }
  };

  const requestSummary = async (res: AnalysisResult | null = result, hid: number | null = historyId) => {
    if (!res) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const { summary } = await api.explain(res.inciText, { brand: res.product.brand, name: res.product.name, type: res.product.type });
      setResult((prev) => (prev ? { ...prev, summary } : prev));
      if (hid) api.updateSummary(hid, summary).catch(() => undefined);
    } catch (e) {
      setSummaryError(msg(e));
    } finally {
      setSummaryLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setInfo(null);
    setForm({ brand: '', name: '', type: '', volume: '', spf: '' });
    setInciText('');
    setOrigin({ kind: 'manual' });
    setLocalCands([]);
    setWeb(null);
    setLookupNote(null);
    setOcrNote(null);
    setResult(null);
    setHistoryId(null);
    setSummaryError(null);
    setError(null);
    setSaveProduct(false);
    setStep('start');
  };

  const setF = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // ---------- UI ----------
  return (
    <div className="space-y-4">
      {cameraFor && (
        <CameraCapture
          title={cameraFor === 'front' ? 'Өнімді түсіріңіз' : 'Құрам жазылған жағын түсіріңіз'}
          hint={cameraFor === 'front' ? 'Бренд пен атауы анық көрінетіндей қаптаманы рамкаға салыңыз' : 'INCI / Ingredients жазуы анық көрінсін, жарық шағылыспасын'}
          onCancel={() => setCameraFor(null)}
          onCapture={(b) => {
            const p = cameraFor;
            setCameraFor(null);
            void acceptBlob(b, p);
          }}
        />
      )}

      <input ref={galleryFront} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { onFile(e.target.files?.[0], 'front'); e.target.value = ''; }} />
      <input ref={galleryBack} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { onFile(e.target.files?.[0], 'back'); e.target.value = ''; }} />

      {aiMissing && step === 'start' && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p className="font-semibold">Gemini API кілті бапталмаған</p>
          <p>AI тану үшін жоба түбіріндегі <code>.env</code> файлына <code>GEMINI_API_KEY</code> енгізіп, серверді қайта іске қосыңыз (README.md, 5-қадам). Кілтсіз химиялық база мен қолмен енгізілген құрамды талдау жұмыс істейді.</p>
        </div>
      )}
      {error && <ErrorBox message={error} />}

      {step === 'start' && (
        <>
          <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-lavender via-white to-blush p-6 shadow-card">
            <div className="absolute -right-6 -top-6 animate-floaty opacity-80" aria-hidden="true">
              <svg width="150" height="150" viewBox="0 0 100 100" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round">
                <polygon points="50,18 77,34 77,66 50,82 23,66 23,34" />
                <line x1="50" y1="18" x2="50" y2="4" /><line x1="77" y1="66" x2="92" y2="74" />
                <circle cx="50" cy="18" r="6" fill="#F5DCE8" /><circle cx="77" cy="34" r="6" fill="#8B5CF6" /><circle cx="77" cy="66" r="6" fill="#F5DCE8" />
                <circle cx="50" cy="82" r="6" fill="#8B5CF6" /><circle cx="23" cy="66" r="6" fill="#F5DCE8" /><circle cx="23" cy="34" r="6" fill="#8B5CF6" />
                <circle cx="50" cy="4" r="4" fill="#8B5CF6" /><circle cx="92" cy="74" r="4" fill="#8B5CF6" />
              </svg>
            </div>
            <p className="chip-violet mb-3">Premium Beauty Science</p>
            <h1 className="max-w-[75%] text-[26px] font-extrabold leading-tight">Косметика құрамын химиялық талдаңыз</h1>
            <p className="mt-2 max-w-[85%] text-sm text-ink-soft">Өнімді суретке түсіріңіз: AI оны таниды, INCI құрамын табады және әр затты химиялық базамен салыстырады.</p>
            <div className="mt-5 grid gap-3">
              <button className="btn-primary" onClick={() => setCameraFor('front')} disabled={!online}>
                <Icon name="camera" /> Камерамен түсіру
              </button>
              <button className="btn-ghost" onClick={() => galleryFront.current?.click()} disabled={!online}>
                <Icon name="image" /> Галереядан жүктеу
              </button>
            </div>
            {!online && <p className="mt-3 text-xs text-amber-800">AI талдау үшін интернет қажет.</p>}
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Қалай жұмыс істейді</h2>
            <ol className="space-y-2.5 text-[15px]">
              {['Өнімді камерамен түсіріңіз немесе суретті жүктеңіз', 'AI бренд, атау және өнім түрін анықтайды', 'Нақты INCI құрамы жергілікті базадан, ресми сайттан немесе қаптама OCR-нан алынады', 'Әр ингредиент химиялық базамен салыстырылып, формуласы мен әсері көрсетіледі'].map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet text-sm font-bold text-white">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </section>

          <Link to="/database" className="card flex items-center justify-between">
            <span>
              <span className="block font-bold">Химиялық база</span>
              <span className="text-sm text-ink-soft">{health ? `${health.ingredientCount} ингредиент · ` : ''}формулалар және 3D молекулалар</span>
            </span>
            <Icon name="chevron" className="text-ink-faint" />
          </Link>
        </>
      )}

      {step === 'preview' && image && (
        <section className="space-y-3 animate-fadeup">
          <div className="overflow-hidden rounded-3xl bg-black shadow-card">
            <img src={image.url} alt="Таңдалған сурет" className="max-h-[55vh] w-full object-contain" />
          </div>
          <button className="btn-primary w-full" onClick={analyze}>
            <Icon name="sparkle" size={20} /> Талдауды бастау
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-ghost" onClick={() => setCameraFor('front')}><Icon name="camera" size={18} /> Қайта түсіру</button>
            <button className="btn-ghost" onClick={() => galleryFront.current?.click()}><Icon name="image" size={18} /> Ауыстыру</button>
          </div>
          <button className="btn-danger w-full" onClick={removeImage}><Icon name="trash" size={18} /> Суретті жою</button>
        </section>
      )}

      {step === 'analyzing' && (
        <section className="card">
          {image && <img src={image.url} alt="" className="mx-auto mb-2 h-40 rounded-2xl object-cover opacity-80" />}
          <Spinner label="AI өнімді танып жатыр: бренд, атау, түрі, көлемі…" />
        </section>
      )}

      {step === 'product' && info && (
        <section className="space-y-3 animate-fadeup">
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="h2">Анықталған өнім</h2>
              <span className={`chip ${info.confidence >= 0.75 ? '!bg-emerald-100 !text-emerald-800' : info.confidence >= 0.5 ? '!bg-amber-100 !text-amber-800' : '!bg-red-100 !text-red-800'}`}>
                сенімділік {Math.round(info.confidence * 100)}%
              </span>
            </div>
            {(info.confidence < 0.6 || !info.productName) && (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                AI өнімді сенімді тани алмады. Төмендегі деректерді тексеріп, қажет болса өзіңіз түзетіңіз. Танылмаған өнім ойдан шығарылмайды.
              </p>
            )}
            {info.notes && <p className="mt-2 text-sm text-ink-soft">{info.notes}</p>}

            {info.alternatives.length > 0 && (
              <div className="mt-3">
                <p className="label">Ықтимал нұсқалар (түртіп таңдаңыз)</p>
                <div className="flex flex-wrap gap-2">
                  {info.alternatives.map((a, i) => (
                    <button key={i} className="chip-violet !py-1.5" onClick={() => setForm((f) => ({ ...f, brand: a.brand, name: a.productName }))}>
                      {a.brand} · {a.productName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div><label className="label" htmlFor="brand">Бренд</label><input id="brand" className="input" value={form.brand} onChange={setF('brand')} placeholder="мысалы, La Roche-Posay" /></div>
              <div><label className="label" htmlFor="pname">Өнім атауы</label><input id="pname" className="input" value={form.name} onChange={setF('name')} placeholder="Өнім атауы" /></div>
              <div>
                <label className="label" htmlFor="ptype">Косметика түрі</label>
                <select id="ptype" className="input" value={form.type} onChange={setF('type')}>
                  <option value="">Анықталмады</option>
                  {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{productTypeKk[t]} ({t})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="vol">Көлемі</label><input id="vol" className="input" value={form.volume} onChange={setF('volume')} placeholder="50 ml" /></div>
                <div><label className="label" htmlFor="spf">SPF</label><input id="spf" className="input" value={form.spf} onChange={setF('spf')} placeholder="SPF 50+" /></div>
              </div>
            </div>
            {info.category && <p className="mt-3 text-sm text-ink-soft">Категориясы: {info.category}</p>}
            {info.packagingTexts.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-violet-dark">Қаптамадағы оқылған жазулар</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-soft">{info.packagingTexts.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </details>
            )}
          </div>
          <button className="btn-primary w-full" onClick={findInci}>
            <Icon name="search" size={20} /> {info.inciText ? 'Құрамды талдауға өту' : 'Нақты INCI құрамын іздеу'}
          </button>
          <button className="btn-ghost w-full" onClick={() => setStep('preview')}>Артқа</button>
        </section>
      )}

      {step === 'finding' && (
        <section className="card">
          <Spinner label="Өнімнің нақты құрамы ізделуде: жергілікті база → ресми сайт → сенімді каталогтар…" />
        </section>
      )}

      {step === 'inci' && (
        <section className="space-y-3 animate-fadeup">
          <div className="card">
            <h2 className="h2">Өнім құрамы (INCI)</h2>
            <p className="muted mt-1">{[form.brand, form.name].filter(Boolean).join(' · ')}</p>

            {lookupNote && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{lookupNote}</p>}

            {localCands.length > 1 && (
              <div className="mt-3">
                <p className="label">Жергілікті базада бірнеше нұсқа бар (ел/жыл бойынша таңдаңыз)</p>
                <div className="space-y-2">
                  {localCands.map((p) => (
                    <button key={p.id} onClick={() => useLocal(p)} className="w-full rounded-2xl bg-lavender p-3 text-left text-sm">
                      <span className="font-semibold">{p.brand} {p.name}</span>
                      <span className="block text-ink-soft">{[p.market, p.formulaYear, p.volume].filter(Boolean).join(' · ') || 'нұсқа көрсетілмеген'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {origin.kind === 'web' && (
              <div className="mt-3 rounded-2xl bg-lavender p-3 text-sm">
                <p className="font-semibold">Интернеттен табылды{origin.sourceName ? `: ${origin.sourceName}` : ''}</p>
                {web && web.exactProductMatch === false && <p className="mt-1 text-amber-800">Дереккөз дәл осы өнімге сәйкес келмеуі мүмкін. Мұқият тексеріңіз.</p>}
                {origin.note && <p className="mt-1 text-ink-soft">Ескерту: {origin.note}</p>}
                {origin.sources && origin.sources.length > 0 && <div className="mt-2"><SourceList sources={origin.sources} /></div>}
                <p className="mt-2 text-xs text-ink-soft">Формула елге және шығарылған жылға байланысты өзгеруі мүмкін. Қаптамадағы құраммен салыстырыңыз.</p>
              </div>
            )}
            {origin.kind === 'local' && <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">{origin.sourceName}</p>}

            <label className="label mt-4" htmlFor="inci">INCI мәтіні (тексеріп, қажет болса түзетіңіз)</label>
            <textarea id="inci" className="input min-h-[160px] font-mono text-[14px]" value={inciText} onChange={(e) => { setInciText(e.target.value); if (origin.kind !== 'manual') setOrigin((o) => ({ ...o, note: 'Пайдаланушы мәтінді түзеткен болуы мүмкін.' })); }} placeholder="Aqua, Glycerin, Niacinamide, …" spellCheck={false} />
            {ocrNote && <p className="mt-2 rounded-xl bg-lavender p-3 text-sm text-ink-soft">{ocrNote}</p>}
            {ocrBusy && <Spinner label="Қаптама мәтіні оқылуда (OCR)…" />}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button className="btn-soft" onClick={() => setCameraFor('back')} disabled={ocrBusy || !online}><Icon name="camera" size={18} /> Артқы жағын түсіру</button>
              <button className="btn-soft" onClick={() => galleryBack.current?.click()} disabled={ocrBusy || !online}><Icon name="image" size={18} /> Суреттен оқу</button>
            </div>
            <p className="mt-2 text-xs text-ink-soft">Құрам жазылған жағын суретке түсірсеңіз, OCR мәтінді оқиды. Содан кейін оны тексеруге болады.</p>
          </div>

          {origin.kind !== 'local' && (
            <div className="card">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-violet" checked={saveProduct} onChange={(e) => setSaveProduct(e.target.checked)} />
                <span>Тексерілген құрамды жергілікті өнімдер базасына сақтау (келесіде дереу табылады)</span>
              </label>
              {saveProduct && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><label className="label" htmlFor="mk">Ел / нарық</label><input id="mk" className="input" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="KZ, EU, US…" /></div>
                  <div><label className="label" htmlFor="yr">Жыл / партия</label><input id="yr" className="input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" /></div>
                </div>
              )}
            </div>
          )}

          <button className="btn-primary w-full" onClick={runMatch} disabled={!inciText.trim() || ocrBusy}>
            <Icon name="flask" size={20} /> Химиялық базамен талдау
          </button>
          <button className="btn-ghost w-full" onClick={() => setStep(info ? 'product' : 'start')}>Артқа</button>
        </section>
      )}

      {step === 'matching' && <section className="card"><Spinner label="Ингредиенттер химиялық базамен салыстырылуда…" /></section>}

      {step === 'result' && result && (
        <>
          <ResultView
            result={result}
            imageUrl={image?.url}
            summaryLoading={summaryLoading}
            summaryError={summaryError}
            onRequestSummary={result.match.stats.matched > 0 && health?.geminiConfigured ? () => void requestSummary() : undefined}
          />
          <div className="grid gap-3 pb-2">
            <button className="btn-primary" onClick={reset}><Icon name="camera" size={20} /> Жаңа сканерлеу</button>
            <Link to="/compare" className="btn-ghost">Өнімдерді салыстыру</Link>
          </div>
        </>
      )}
    </div>
  );
}

function originLabel(k: InciOrigin['kind']) {
  return { label: 'Қаптама (Vision)', ocr: 'OCR', local: 'Жергілікті база', web: 'Веб', manual: 'Қолмен енгізілген' }[k];
}
