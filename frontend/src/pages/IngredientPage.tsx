import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Ingredient } from '../types';
import { formatFormula } from '../lib/format';
import { Icon } from '../components/Icon';
import { IngredientDetails } from '../components/IngredientDetails';
import { MoleculeViewer } from '../components/MoleculeViewer';
import { ErrorBox, Spinner } from '../components/Spinner';

export default function IngredientPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [ing, setIng] = useState<Ingredient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIng(null);
    api.ingredient(id!).then(setIng).catch((e: Error) => setError(e.message));
  }, [id]);

  const remove = async () => {
    if (!ing || !window.confirm(`«${ing.inciName}» базадан жойылсын ба?`)) return;
    setBusy(true);
    try {
      await api.deleteIngredient(ing.id);
      nav('/database', { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/database" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-dark"><Icon name="back" size={18} /> Химиялық база</Link>
      {error && <ErrorBox message={error} />}
      {!ing && !error && <Spinner />}
      {ing && (
        <div className="space-y-4 animate-fadeup">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-violet-dark">{ing.commonName ?? 'INCI'}</p>
            <h1 className="text-2xl font-extrabold leading-tight">{ing.inciName}</h1>
            <p className="text-ink-soft">{ing.nameKk}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ing.categories.map((c) => <span key={c} className="chip-violet">{c}</span>)}
              {ing.isCustom && <span className="chip !bg-amber-100 !text-amber-800">пайдаланушы қосқан, тексерілмеген</span>}
            </div>
          </div>

          <MoleculeViewer query={ing.pubchemQuery} />

          <div className="card text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Химиялық формула</p>
            <p className="mt-1 text-3xl font-extrabold tracking-wide text-violet-dark">{formatFormula(ing.formula)}</p>
          </div>

          <div className="card"><IngredientDetails ing={ing} /></div>

          {ing.synonyms.length > 0 && (
            <div className="card">
              <h2 className="h2 mb-2">Балама атаулары</h2>
              <p className="muted mb-2">Құрамда осы атаулардың кез келгені кездессе, заттың осы карточкасымен сәйкестендіріледі.</p>
              <div className="flex flex-wrap gap-1.5">{ing.synonyms.map((s) => <span key={s} className="chip">{s}</span>)}</div>
            </div>
          )}

          {ing.isCustom && (
            <button className="btn-danger w-full" onClick={remove} disabled={busy}><Icon name="trash" size={18} /> Базадан жою</button>
          )}
        </div>
      )}
    </div>
  );
}
