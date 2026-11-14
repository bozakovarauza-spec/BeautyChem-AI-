export interface Atom { x: number; y: number; z: number; el: string }
export interface Bond { a: number; b: number; order: number }
export interface Molecule { atoms: Atom[]; bonds: Bond[] }

/** MDL SDF/Molfile V2000 форматын оқиды (PubChem 3D құрылымдары осы форматта келеді). */
export function parseSdf(text: string): Molecule {
  const lines = text.replace(/\r/g, '').split('\n');
  const counts = lines[3] || '';
  const na = parseInt(counts.substring(0, 3), 10);
  const nb = parseInt(counts.substring(3, 6), 10);
  if (!isFinite(na) || !isFinite(nb) || na <= 0) throw new Error('SDF форматы танылмады.');
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i] || '';
    atoms.push({
      x: parseFloat(l.substring(0, 10)),
      y: parseFloat(l.substring(10, 20)),
      z: parseFloat(l.substring(20, 30)),
      el: l.substring(31, 34).trim(),
    });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i] || '';
    const a = parseInt(l.substring(0, 3), 10) - 1;
    const b = parseInt(l.substring(3, 6), 10) - 1;
    const order = parseInt(l.substring(6, 9), 10) || 1;
    if (a >= 0 && b >= 0 && a < na && b < na) bonds.push({ a, b, order: Math.min(order, 3) });
  }
  if (atoms.some((a) => !isFinite(a.x) || !isFinite(a.y) || !isFinite(a.z))) throw new Error('SDF координаттары жарамсыз.');
  return { atoms, bonds };
}
