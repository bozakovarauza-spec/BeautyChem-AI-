import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { HistoryFull, HistoryListItem } from '../types';
import { formatDate, typeLabel } from '../lib/format';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Spinner } from '../components/Spinner';

const MAX = 3;

export default function ComparePage() {
  const [list, setList] = useState<HistoryListItem[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [data, setData] = useState<HistoryFull[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.history().then((r) => setList(r.items)).catch((e: Error) => setError(e.message));
  }, []);

  const toggle = (id: number) => {
    setData(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]));
  };

  const compare = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await Promise.all(selected.map((id) => api.historyItem(id))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Өнімдерді салыстыру</h1>
        <p className="muted">Талдау тарихынан 2–3 өнімді таңдаңыз</p>
      </div>
      {error && <ErrorBox message={error} />}
      {!list && !error && <Spinner />}
      {list && list.length < 2 && (
        <Empty title="Салыстыру үшін кемінде 2 талдау қажет" text="Алдымен екі өнімді сканерлеңіз." />
      )}
      {list && list.length < 2 && <Link to="/" className="btn-primary w-full">Сканерлеуге өту</Link>}

      {list && list.length >= 2 && (
        <>
          <ul className="space-y-2">
            {list.map((h) => {
              const on = selected.includes(h.id);
              const disabled = !on && selected.length >= MAX;
              return (
                <li key={h.id}>
                  <button onClick={() => toggle(h.id)} disabled={disabled} className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left transition disabled:opacity-40 ${on ? 'border-violet' : 'border-transparent shadow-card'}`}>
                    {h.thumb ? <img src={h.thumb} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lavender text-violet"><Icon name="flask" size={20} /></div>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold uppercase text-violet-dark">{h.brand || '—'}</span>
                      <span className="block truncate font-semibold">{h.productName || 'Атаусыз'}</span>
                      <span className="text-xs text-ink-soft">{typeLabel(h.productType)} · {formatDate(h.createdAt)}</span>
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-violet bg-violet text-white' : 'border-ink-faint/40'}`}>{on && <Icon name="check" size={14} strokeWidth={3} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn-primary w-full" disabled={selected.length < 2 || loading} onClick={compare}>
            <Icon name="scale" size={20} /> Салыстыру ({selected.length}/{MAX})
          </button>
        </>
      )}

      {loading && <Spinner label="Салыстыру дайындалуда…" />}
      {data && <Comparison data={data} />}
    </div>
  );
}

function Comparison({ data }: { data: HistoryFull[] }) {
  const model = useMemo(() => {
    const sets = data.map((d) => new Map(d.result.match.items.map((i) => [i.key, i] as const)));
    const all = new Map<string, { label: string; matched: boolean }>();
    sets.forEach((m) => m.forEach((it, key) => { if (!all.has(key)) all.set(key, { label: it.match?.inciName ?? it.raw, matched: !!it.match }); }));
    const keys = [...all.keys()];
    const common = keys.filter((k) => sets.every((s) => s.has(k)));
    const unique = data.map((_, i) => keys.filter((k) => sets[i].has(k) && sets.every((s, j) => j === i || !s.has(k))));
    const cats = [...new Set(data.flatMap((d) => Object.keys(d.result.match.stats.byCategory)))];
    return { sets, all, keys, common, unique, cats };
  }, [data]);

  const gridCols = data.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const label = (k: string) => model.all.get(k)?.label ?? k;

  return (
    <div className="space-y-4 animate-fadeup">
      <section className={`grid ${gridCols} gap-2`}>
        {data.map((d) => (
          <div key={d.id} className="card !p-3 text-center">
            {d.thumb && <img src={d.thumb} alt="" className="mx-auto mb-2 h-16 w-16 rounded-xl object-cover" />}
            <p className="truncate text-[10px] font-bold uppercase text-violet-dark">{d.result.product.brand || '—'}</p>
            <p className="line-clamp-2 text-sm font-bold leading-tight">{d.result.product.name || 'Атаусыз'}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="h2 mb-3">Негізгі көрсеткіштер</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint"><th className="pb-2 font-semibold" />{data.map((d) => <th key={d.id} className="pb-2 text-center font-semibold">{(d.result.product.name || '').slice(0, 10)}</th>)}</tr>
          </thead>
          <tbody className="[&_td]:py-1.5 [&_td]:text-center [&_tr]:border-t [&_tr]:border-lavender">
            <tr><td className="!text-left text-ink-soft">Ингредиент саны</td>{data.map((d) => <td key={d.id} className="font-bold">{d.result.match.stats.total}</td>)}</tr>
            <tr><td className="!text-left text-ink-soft">Базада табылды</td>{data.map((d) => <td key={d.id} className="font-bold text-emerald-600">{d.result.match.stats.matched}</td>)}</tr>
            <tr><td className="!text-left text-ink-soft">Базада жоқ</td>{data.map((d) => <td key={d.id} className="font-bold text-ink-faint">{d.result.match.stats.unmatched}</td>)}</tr>
            {model.cats.map((c) => (
              <tr key={c}><td className="!text-left text-ink-soft">{c}</td>{data.map((d) => <td key={d.id}>{d.result.match.stats.byCategory[c] ?? 0}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="h2 mb-2">Ортақ ингредиенттер ({model.common.length})</h2>
        {model.common.length ? <div className="flex flex-wrap gap-1.5">{model.common.map((k) => <span key={k} className="chip-violet">{label(k)}</span>)}</div> : <p className="muted">Ортақ ингредиент жоқ.</p>}
      </section>

      {data.map((d, i) => (
        <section key={d.id} className="card">
          <h2 className="h2 mb-2">Тек «{d.result.product.name}» құрамында ({model.unique[i].length})</h2>
          {model.unique[i].length ? <div className="flex flex-wrap gap-1.5">{model.unique[i].map((k) => <span key={k} className={model.all.get(k)?.matched ? 'chip-violet' : 'chip'}>{label(k)}</span>)}</div> : <p className="muted">Бірегей ингредиент жоқ.</p>}
        </section>
      ))}

      <section className="card overflow-x-auto">
        <h2 className="h2 mb-2">Толық кесте</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-faint"><th className="pb-2 font-semibold">Ингредиент</th>{data.map((d) => <th key={d.id} className="pb-2 text-center font-semibold">{(d.result.product.name || '').slice(0, 8)}</th>)}</tr></thead>
          <tbody className="[&_tr]:border-t [&_tr]:border-lavender">
            {model.keys.slice(0, 120).map((k) => (
              <tr key={k}>
                <td className="py-1.5 pr-2">{label(k)}</td>
                {model.sets.map((s, i) => <td key={i} className="py-1.5 text-center">{s.has(k) ? <span className="font-bold text-violet">✓</span> : <span className="text-ink-faint/50">–</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {model.keys.length > 120 && <p className="muted mt-2">Алғашқы 120 ингредиент көрсетілді.</p>}
      </section>
    </div>
  );
}
