import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { HistoryFull, HistoryListItem } from '../types';
import { formatDate, typeLabel } from '../lib/format';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Spinner } from '../components/Spinner';
import { ResultView } from '../components/ResultView';

export function HistoryListPage() {
  const [items, setItems] = useState<HistoryListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.history().then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async (id: number) => {
    if (!window.confirm('Бұл талдауды жою керек пе?')) return;
    try {
      await api.deleteHistory(id);
      setItems((p) => p?.filter((x) => x.id !== id) ?? p);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const clear = async () => {
    if (!window.confirm('Бүкіл тарихты жою керек пе?')) return;
    try {
      await api.clearHistory();
      setItems([]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Талдау тарихы</h1>
          <p className="muted">Осы құрылғыдағы соңғы талдаулар</p>
        </div>
        {items && items.length > 0 && <button onClick={clear} className="text-sm font-semibold text-red-700">Тазалау</button>}
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <Empty title="Тарих бос" text="Өнімді сканерлегеннен кейін талдау осында сақталады." />}
      <ul className="space-y-3">
        {items?.map((h) => (
          <li key={h.id} className="card flex items-center gap-3 !p-3">
            <Link to={`/history/${h.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              {h.thumb ? <img src={h.thumb} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-lavender text-violet"><Icon name="flask" /></div>}
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase text-violet-dark">{h.brand || 'Бренд жоқ'}</p>
                <p className="truncate font-bold">{h.productName || 'Атаусыз өнім'}</p>
                <p className="text-xs text-ink-soft">{typeLabel(h.productType)} · {formatDate(h.createdAt)}</p>
              </div>
            </Link>
            <button onClick={() => remove(h.id)} className="p-2 text-ink-faint" aria-label="Жою"><Icon name="trash" size={20} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HistoryDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState<HistoryFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sumError, setSumError] = useState<string | null>(null);

  useEffect(() => {
    api.historyItem(id!).then(setItem).catch((e: Error) => setError(e.message));
  }, [id]);

  const makeSummary = async () => {
    if (!item) return;
    setLoading(true);
    setSumError(null);
    try {
      const r = item.result;
      const { summary } = await api.explain(r.inciText, { brand: r.product.brand, name: r.product.name, type: r.product.type });
      await api.updateSummary(item.id, summary).catch(() => undefined);
      setItem({ ...item, result: { ...r, summary } });
    } catch (e) {
      setSumError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => nav('/history')} className="inline-flex items-center gap-1 text-sm font-semibold text-violet-dark"><Icon name="back" size={18} /> Тарих</button>
      {error && <ErrorBox message={error} />}
      {!item && !error && <Spinner />}
      {item && (
        <>
          <p className="muted">{formatDate(item.createdAt)}</p>
          <ResultView
            result={item.result}
            imageUrl={item.thumb}
            summaryLoading={loading}
            summaryError={sumError}
            onRequestSummary={item.result.match.stats.matched > 0 ? makeSummary : undefined}
          />
        </>
      )}
    </div>
  );
}
