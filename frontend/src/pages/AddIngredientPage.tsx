import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { ErrorBox } from '../components/Spinner';

interface FieldProps {
  id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  req?: boolean; ph?: string; area?: boolean;
}

// Компонент сыртта анықталған: әйтпесе әр әріп басқанда input фокусты жоғалтады
function Field({ id, label, value, onChange, req, ph, area }: FieldProps) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}{req && <span className="text-red-600"> *</span>}</label>
      {area ? <textarea id={id} className="input min-h-[96px]" value={value} onChange={onChange} placeholder={ph} /> : <input id={id} className="input" value={value} onChange={onChange} placeholder={ph} />}
    </div>
  );
}

const split = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export default function AddIngredientPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [f, setF] = useState({
    inciName: sp.get('inci') ?? '', commonName: '', nameKk: '', formula: '', chemClass: '', molarMass: '', cas: '',
    properties: '', functionKk: '', categories: '', mechanism: '', benefits: '', risks: '', synonyms: '', pubchemQuery: '',
    sourceTitle: '', sourceUrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api.createIngredient({
        inciName: f.inciName, commonName: f.commonName, nameKk: f.nameKk, formula: f.formula, chemClass: f.chemClass,
        molarMass: f.molarMass, cas: f.cas, properties: f.properties, functionKk: f.functionKk,
        categories: split(f.categories), mechanism: f.mechanism, benefits: f.benefits, risks: f.risks,
        synonyms: split(f.synonyms), pubchemQuery: f.pubchemQuery,
        sources: f.sourceTitle ? [{ title: f.sourceTitle, url: f.sourceUrl }] : [],
      });
      nav(`/database/${created.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fp = (k: keyof typeof f, label: string, o: { req?: boolean; ph?: string; area?: boolean } = {}) => ({
    id: k, label, value: f[k], onChange: set(k), ...o,
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Link to="/database" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-dark"><Icon name="back" size={18} /> Химиялық база</Link>
      <h1 className="text-2xl font-extrabold">Жаңа ингредиент</h1>
      <p className="muted">Қосылған зат «пайдаланушы қосқан» деп белгіленеді. Деректерді сенімді дереккөзден тексеріп енгізіңіз.</p>
      {error && <ErrorBox message={error} />}
      <div className="card space-y-3">
        <Field {...fp('inciName', 'INCI атауы', { req: true, ph: 'Niacinamide' })} />
        <Field {...fp('commonName', 'Жалпы / халықаралық атауы', { ph: 'Nicotinamide' })} />
        <Field {...fp('nameKk', 'Қазақша атауы', { req: true, ph: 'Ниацинамид' })} />
        <Field {...fp('formula', 'Химиялық формуласы', { req: true, ph: 'C6H6N2O' })} />
        <Field {...fp('chemClass', 'Химиялық класы', { req: true, ph: 'Пиридинкарбон қышқылының амиді' })} />
        <div className="grid grid-cols-2 gap-3">
          <Field {...fp('molarMass', 'Мол. массасы (г/моль)', { ph: '122.13' })} />
          <Field {...fp('cas', 'CAS нөмірі', { ph: '98-92-0' })} />
        </div>
        <Field {...fp('properties', 'Физикалық-химиялық қасиеттері', { req: true, area: true })} />
        <Field {...fp('functionKk', 'Косметикадағы қызметі', { req: true, area: true })} />
        <Field {...fp('categories', 'Қызмет тегтері (үтірмен бөліңіз)', { ph: 'Ылғалдандырғыш, Антиоксидант' })} />
        <Field {...fp('mechanism', 'Терідегі әсер ету механизмі', { area: true })} />
        <Field {...fp('benefits', 'Ықтимал пайдалы әсері', { area: true })} />
        <Field {...fp('risks', 'Ықтимал жағымсыз әсері', { area: true })} />
        <Field {...fp('synonyms', 'Балама атаулары (үтірмен бөліңіз)', { ph: 'nicotinamide, vitamin b3' })} />
        <Field {...fp('pubchemQuery', 'PubChem атауы (3D құрылым үшін)', { ph: 'nicotinamide' })} />
        <Field {...fp('sourceTitle', 'Дереккөз атауы', { ph: 'PubChem: Nicotinamide' })} />
        <Field {...fp('sourceUrl', 'Дереккөз сілтемесі', { ph: 'https://…' })} />
      </div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Сақталуда…' : 'Базаға сақтау'}</button>
    </form>
  );
}
