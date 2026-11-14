import type { Ingredient } from '../types';
import { formatFormula } from '../lib/format';
import { Icon } from './Icon';

export function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-violet-dark">{label}</dt>
      <dd className="mt-0.5 text-[15px] leading-snug">{children}</dd>
    </div>
  );
}

export function SourceList({ sources }: { sources: { title: string; url: string }[] }) {
  if (!sources.length) return <p className="text-sm text-ink-soft">Дереккөз көрсетілмеген.</p>;
  return (
    <ul className="space-y-1.5">
      {sources.map((s, i) => (
        <li key={i} className="text-sm">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-violet-dark underline decoration-violet/40 underline-offset-2">
              <Icon name="link" size={15} className="mt-1 shrink-0" />
              <span className="break-words">{s.title}</span>
            </a>
          ) : (
            <span>{s.title}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Ингредиенттің толық химиялық деректері (карточкада да, детальды бетте де қолданылады). */
export function IngredientDetails({ ing }: { ing: Ingredient }) {
  return (
    <dl className="space-y-3">
      <Field label="Химиялық формуласы">
        <span className="text-xl font-semibold tracking-wide">{formatFormula(ing.formula)}</span>
      </Field>
      <Field label="Химиялық класы">{ing.chemClass}</Field>
      <Field label="Молекулалық массасы">
        {ing.molarMass != null && (
          <>
            {ing.molarMass} г/моль
            {ing.molarMassNote && <span className="mt-1 block text-xs text-ink-soft">{ing.molarMassNote}</span>}
          </>
        )}
      </Field>
      <Field label="CAS нөмірі">{ing.cas}</Field>
      <Field label="Физикалық-химиялық қасиеттері">{ing.properties}</Field>
      <Field label="Косметикадағы қызметі">{ing.functionKk}</Field>
      <Field label="Терідегі әсер ету механизмі">{ing.mechanism}</Field>
      <Field label="Ықтимал пайдалы әсері">{ing.benefits}</Field>
      <Field label="Ықтимал жағымсыз әсері">{ing.risks}</Field>
      <div>
        <dt className="text-xs font-bold uppercase tracking-wide text-violet-dark">Ғылыми дереккөздері</dt>
        <dd className="mt-1">
          <SourceList sources={ing.sources} />
        </dd>
      </div>
    </dl>
  );
}
