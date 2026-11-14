import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Ingredient } from '../types';
import { formatFormula } from '../lib/format';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Spinner } from '../components/Spinner';

export default function DatabasePage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [chemClass, setChemClass] = useState('');
  const [meta, setMeta] = useState<{ categories: string[]; classes: string[] } | null>(null);
  const [items, setItems] = useState<Ingredient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.ingredientMeta().then(setMeta).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .ingredients({ q: q.trim(), category, class: chemClass })
        .then((r) => {
          if (!cancelled) {
            setItems(r.items);
            setError(null);
          }
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, category, chemClass]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Химиялық база</h1>
          <p className="muted">{items ? `${items.length} ингредиент` : 'Жүктелуде…'}</p>
        </div>
        <Link to="/database/new" className="btn-primary !min-h-[44px] !px-4"><Icon name="plus" size={18} /> Қосу</Link>
      </div>

      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input className="input !pl-12" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Атауы, формула немесе CAS бойынша іздеу" aria-label="Іздеу" />
      </div>

      {meta && (
        <div className="space-y-2">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button onClick={() => setCategory('')} className={`shrink-0 ${category === '' ? 'chip-violet' : 'chip'}`}>Барлығы</button>
            {meta.categories.map((c) => (
              <button key={c} onClick={() => setCategory(category === c ? '' : c)} className={`shrink-0 ${category === c ? 'chip-violet !bg-violet !text-white' : 'chip'}`}>{c}</button>
            ))}
          </div>
          <select className="input !py-2.5 text-sm" value={chemClass} onChange={(e) => setChemClass(e.target.value)} aria-label="Химиялық класс бойынша сүзгі">
            <option value="">Барлық химиялық кластар</option>
            {meta.classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <Empty title="Ештеңе табылмады" text="Іздеуді өзгертіңіз немесе жаңа ингредиент қосыңыз." />}

      <ul className="space-y-3">
        {items?.map((i) => (
          <li key={i.id}>
            <Link to={`/database/${i.id}`} className="card flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-lavender text-center leading-none">
                <span className="text-[13px] font-bold text-violet-dark">{formatFormula(i.formula).slice(0, 9)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{i.inciName}</p>
                <p className="truncate text-sm text-ink-soft">{i.nameKk}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {i.categories.slice(0, 2).map((c) => <span key={c} className="chip">{c}</span>)}
                  {i.isCustom && <span className="chip !bg-amber-100 !text-amber-800">пайдаланушы қосқан</span>}
                </div>
              </div>
              <Icon name="chevron" className="text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
