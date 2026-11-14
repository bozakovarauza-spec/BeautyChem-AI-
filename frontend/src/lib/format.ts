const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** C3H8O3 -> C₃H₈O₃ (төменгі индекстер). */
export function formatFormula(f: string): string {
  return f.replace(/([A-Za-z)])(\d+)/g, (_, a: string, d: string) => a + [...d].map((x) => SUB[Number(x)]).join(''));
}

/** SQLite datetime (UTC) немесе ISO мәтінін жергілікті уақытқа айналдырады. */
export function formatDate(s: string): string {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('kk-KZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const productTypeKk: Record<string, string> = {
  Foundation: 'Тональный крем', 'BB Cream': 'BB крем', 'CC Cream': 'CC крем', Sunscreen: 'Күннен қорғайтын құрал',
  Moisturizer: 'Ылғалдандырғыш крем', Serum: 'Сыворотка', Cleanser: 'Жуғыш құрал', Toner: 'Тоник',
  'Micellar Water': 'Мицеллярлық су', Primer: 'Праймер', Concealer: 'Консилер', Powder: 'Пудра', Mask: 'Маска',
  Lipstick: 'Далап (помада)', Mascara: 'Тушь', Perfume: 'Хош иіс (парфюм)', 'Hair Care': 'Шаш күтімі',
  'Body Care': 'Дене күтімі', Other: 'Басқа',
};

export const PRODUCT_TYPES = Object.keys(productTypeKk);

export const typeLabel = (t: string | null | undefined) => (t ? `${productTypeKk[t] ?? t}` : 'Анықталмады');
