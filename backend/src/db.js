import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

/**
 * SQLite базасы (Node.js кірістірілген node:sqlite модулі, Node 22.13+).
 * Қосымша native тәуелділік қажет емес.
 */
export function openDatabase(dbPath = config.dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(config.schemaPath, 'utf8'));
  seedIngredients(db);
  return db;
}

/** Бастапқы 14 ингредиентті қосады (бар болса қайталамайды). */
export function seedIngredients(db) {
  const items = JSON.parse(fs.readFileSync(config.seedPath, 'utf8'));
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO ingredients
      (inci_name, common_name, name_kk, formula, chem_class, molar_mass, molar_mass_note, cas,
       properties, function_kk, categories, mechanism, benefits, risks, synonyms, pubchem_query, sources, is_custom)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`);
  db.exec('BEGIN');
  try {
    for (const i of items) {
      stmt.run(
        i.inci_name, i.common_name ?? null, i.name_kk, i.formula, i.chem_class,
        i.molar_mass ?? null, i.molar_mass_note ?? null, i.cas ?? null,
        i.properties, i.function_kk, JSON.stringify(i.categories ?? []),
        i.mechanism ?? null, i.benefits ?? null, i.risks ?? null,
        JSON.stringify(i.synonyms ?? []), i.pubchem_query ?? null, JSON.stringify(i.sources ?? []),
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const parseJson = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};

/** SQL жолын API-ге ыңғайлы объектіге айналдырады. */
export function rowToIngredient(r) {
  if (!r) return null;
  return {
    id: r.id,
    inciName: r.inci_name,
    commonName: r.common_name,
    nameKk: r.name_kk,
    formula: r.formula,
    chemClass: r.chem_class,
    molarMass: r.molar_mass,
    molarMassNote: r.molar_mass_note,
    cas: r.cas,
    properties: r.properties,
    functionKk: r.function_kk,
    categories: parseJson(r.categories, []),
    mechanism: r.mechanism,
    benefits: r.benefits,
    risks: r.risks,
    synonyms: parseJson(r.synonyms, []),
    pubchemQuery: r.pubchem_query,
    sources: parseJson(r.sources, []),
    isCustom: !!r.is_custom,
    createdAt: r.created_at,
  };
}

export function listAllIngredients(db) {
  return db.prepare('SELECT * FROM ingredients ORDER BY inci_name COLLATE NOCASE').all().map(rowToIngredient);
}
