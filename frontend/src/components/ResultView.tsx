import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisResult, MatchItem } from '../types';
import { formatFormula, typeLabel } from '../lib/format';
import { Icon } from './Icon';
import { IngredientDetails, SourceList } from './IngredientDetails';
import { Spinner } from './Spinner';

interface Props {
  result: AnalysisResult;
  imageUrl?: string | null;
  summaryLoading?: boolean;
  summaryError?: string | null;
  onRequestSummary?: () => void;
}

const originText: Record<string, string> = {
  label: 'Қаптамадағы жазудан оқылды (Gemini Vision).',
  ocr: 'Қаптама суретінен OCR арқылы оқылды, пайдаланушы тексерді.',
  local: 'Жергілікті өнімдер базасынан алынды.',
  web: 'Интернеттен табылды. Дереккөзді өзіңіз тексеріңіз.',
  manual: 'Пайдаланушы қолмен енгізді.',
};

function IngredientRow({ item }: { item: MatchItem }) {
  const [open, setOpen] = useState(false);
  const m = item.match;
  if (!m) {
    return (
      <li className="rounded-2xl border border-dashed border-ink-faint/40 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lavender text-xs font-bold text-ink-soft">{item.position}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold">{item.raw}</p>
            <p className="text-xs text-ink-soft">Химиялық базаға енгізілмеген</p>
          </div>
          <Link to={`/database/new?inci=${encodeURIComponent(item.raw)}`} className="shrink-0 rounded-full bg-violet-soft px-3 py-1.5 text-xs font-bold text-violet-dark">
            + Базаға қосу
          </Link>
        </div>
      </li>
    );
  }
  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={open}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet text-xs font-bold text-white">{item.position}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{item.raw}</p>
          <p className="text-sm text-ink-soft">
            {m.nameKk} · <span className="font-medium text-ink">{formatFormula(m.formula)}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {m.categories.slice(0, 3).map((c) => (
              <span key={c} className="chip-violet">{c}</span>
            ))}
            {item.optional && <span className="chip">қосымша / +/-</span>}
          </div>
        </div>
        <Icon name="chevron" className={`shrink-0 text-ink-faint transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-lavender bg-cream/60 p-4 animate-fadeup">
          <IngredientDetails ing={m} />
          <Link to={`/database/${m.id}`} className="btn-soft mt-4 w-full">3D құрылым және толық карточка</Link>
        </div>
      )}
    </li>
  );
}

/** Талдау нәтижесінің беті: өнім, құрам, статистика, ингредиент карточкалары, түсіндірме, дереккөздер. */
export function ResultView({ result, imageUrl, summaryLoading, summaryError, onRequestSummary }: Props) {
  const { product, match, origin } = result;
  const { stats } = match;
  const cats = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const allSources = [...(origin.sources || [])];

  return (
    <div className="space-y-4 animate-fadeup">
      <section className="card flex gap-4">
        {imageUrl && <img src={imageUrl} alt="Өнім суреті" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-dark">{product.brand || 'Бренд анықталмады'}</p>
          <h2 className="break-words text-xl font-extrabold leading-tight">{product.name || 'Атауы көрсетілмеген'}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip-violet">{typeLabel(product.type)}</span>
            {product.volume && <span className="chip">{product.volume}</span>}
            {product.spf && <span className="chip">{product.spf}</span>}
            {product.confidence != null && <span className="chip">сенімділік {Math.round(product.confidence * 100)}%</span>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="card !p-3">
          <p className="text-2xl font-extrabold text-violet">{stats.total}</p>
          <p className="text-[11px] font-semibold text-ink-soft">ингредиент</p>
        </div>
        <div className="card !p-3">
          <p className="text-2xl font-extrabold text-emerald-600">{stats.matched}</p>
          <p className="text-[11px] font-semibold text-ink-soft">базада табылды</p>
        </div>
        <div className="card !p-3">
          <p className="text-2xl font-extrabold text-ink-faint">{stats.unmatched}</p>
          <p className="text-[11px] font-semibold text-ink-soft">базада жоқ</p>
        </div>
      </section>

      {cats.length > 0 && (
        <section className="card">
          <h3 className="h2 mb-2">Функциялық топтар</h3>
          <div className="flex flex-wrap gap-2">
            {cats.map(([c, n]) => (
              <span key={c} className="chip-violet">{c}: {n}</span>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h3 className="h2 mb-2">INCI құрамы</h3>
        <p className="break-words text-[15px] leading-relaxed text-ink-soft">{result.inciText}</p>
        <p className="mt-3 rounded-xl bg-lavender px-3 py-2 text-xs text-ink-soft">
          {originText[origin.kind]} Формула елге және шығарылған уақытқа байланысты өзгеруі мүмкін; қаптамадағы құраммен салыстырыңыз.
        </p>
      </section>

      <section>
        <h3 className="h2 mb-2 px-1">Ингредиент карточкалары</h3>
        <ul className="space-y-2">
          {match.items.map((it) => (
            <IngredientRow key={it.position} item={it} />
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="h2 flex items-center gap-2">
            <Icon name="sparkle" className="text-violet" /> Ғылыми түсіндірме
          </h3>
        </div>
        {summaryLoading && <Spinner label="Қорытынды дайындалуда…" />}
        {!summaryLoading && result.summary && (
          <>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{result.summary}</p>
            <p className="mt-3 text-xs text-ink-faint">
              Қорытынды AI арқылы тек химиялық базадағы деректер негізінде жасалды. Бұл медициналық кеңес емес.
            </p>
          </>
        )}
        {!summaryLoading && !result.summary && (
          <div className="space-y-2">
            {summaryError && <p className="text-sm text-red-700">{summaryError}</p>}
            {onRequestSummary && (
              <button onClick={onRequestSummary} className="btn-soft w-full">
                <Icon name="sparkle" size={18} /> Қазақша ғылыми қорытынды жасау
              </button>
            )}
            {!onRequestSummary && <p className="text-sm text-ink-soft">Қорытынды жасалмаған.</p>}
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="h2 mb-2">Дереккөздер</h3>
        <p className="mb-2 text-sm font-semibold text-ink-soft">Құрам дереккөзі</p>
        {allSources.length > 0 ? <SourceList sources={allSources} /> : <p className="text-sm text-ink-soft">{origin.sourceName || originText[origin.kind]}</p>}
        {origin.note && <p className="mt-2 text-sm text-ink-soft">{origin.note}</p>}
        <p className="mb-2 mt-4 text-sm font-semibold text-ink-soft">Химиялық мәліметтер дереккөздері</p>
        <p className="text-sm text-ink-soft">Әр ингредиент карточкасының ішінде көрсетілген (PubChem, ЕО CosIng, CIR, SCCS және т.б.).</p>
      </section>
    </div>
  );
}
