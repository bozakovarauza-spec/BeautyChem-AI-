import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

// .env файлы жоба түбірінде (BeautyChem-AI/.env) болады
dotenv.config({ path: path.join(ROOT, '.env') });

export const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  // API кілті ТЕК серверде сақталады. Браузерге ешқашан жіберілмейді.
  geminiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
  geminiBase: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  dbPath: process.env.DATABASE_PATH
    ? path.resolve(ROOT, process.env.DATABASE_PATH)
    : path.join(ROOT, 'database', 'beautychem.db'),
  schemaPath: path.join(ROOT, 'database', 'schema.sql'),
  seedPath: path.join(ROOT, 'database', 'ingredients.seed.json'),
  distDir: path.join(ROOT, 'frontend', 'dist'),
  sslKey: process.env.SSL_KEY_PATH ? path.resolve(ROOT, process.env.SSL_KEY_PATH) : '',
  sslCert: process.env.SSL_CERT_PATH ? path.resolve(ROOT, process.env.SSL_CERT_PATH) : '',
  maxUploadBytes: 8 * 1024 * 1024,
};
