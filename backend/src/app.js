import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { createHandlers, HttpError } from './handlers.js';
import { GeminiError } from './services/gemini.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(db) {
  const app = express();
  const h = createHandlers(db);

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render / Railway / Cloudflare тәрізді HTTPS прокси артында жұмыс істеу үшін
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  }).single('image');
  const uploadMw = (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Сурет тым үлкен (максимум 8 МБ).', 'too_large'));
      return next(new HttpError(400, 'Суретті жүктеу қатесі.', 'upload'));
    });

  // Gemini квотасын қорғау: бір IP-ден минутына 20 AI сұрау
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limit', message: 'Тым жиі сұрау жіберілді. Бір минут күтіңіз.' } },
  });

  const api = express.Router();
  api.get('/health', h.health);

  api.get('/ingredients', h.listIngredients);
  api.get('/ingredients/meta', h.ingredientMeta);
  api.get('/ingredients/:id', h.getIngredient);
  api.post('/ingredients', h.createIngredient);
  api.delete('/ingredients/:id', h.deleteIngredient);

  api.post('/analyze', aiLimiter, uploadMw, wrap(h.analyze));
  api.post('/inci/ocr', aiLimiter, uploadMw, wrap(h.ocr));
  api.post('/inci/lookup', aiLimiter, wrap(h.lookupInci));
  api.post('/inci/match', h.match);
  api.post('/inci/explain', aiLimiter, wrap(h.explain));

  api.get('/products', h.listProducts);
  api.post('/products', h.createProduct);

  api.get('/history', h.listHistory);
  api.get('/history/:id', h.getHistory);
  api.post('/history', h.createHistory);
  api.put('/history/:id/summary', h.updateHistorySummary);
  api.delete('/history/:id', h.deleteHistory);
  api.delete('/history', h.clearHistory);

  api.get('/molecule', wrap(h.molecule));

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'API маршруты табылмады.' } }));

  // ---- Дайын frontend (npm run build кейін) ----
  const indexHtml = path.join(config.distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.get('/service-worker.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
      res.type('application/javascript').sendFile(path.join(config.distDir, 'service-worker.js'));
    });
    app.get('/manifest.json', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('application/manifest+json').sendFile(path.join(config.distDir, 'manifest.json'));
    });
    app.use('/assets', express.static(path.join(config.distDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(config.distDir, { maxAge: '1h', index: false }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (req, res) =>
      res
        .status(200)
        .type('text/plain; charset=utf-8')
        .send('BeautyChem AI backend жұмыс істеп тұр. Frontend әлі құрастырылмаған: «npm run build» орындаңыз немесе дамыту режимінде «npm run dev» іске қосыңыз (http://localhost:5173).'),
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError || err instanceof GeminiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'JSON форматы қате.' } });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'too_large', message: 'Сұрау тым үлкен.' } });
    }
    console.error('[server error]', err);
    res.status(500).json({ error: { code: 'internal', message: 'Серверде күтпеген қате орын алды.' } });
  });

  return app;
}
