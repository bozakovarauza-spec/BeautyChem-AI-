import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

const db = openDatabase();
const app = createApp(db);

let server;
let scheme = 'http';
if (config.sslKey && config.sslCert) {
  // Жергілікті HTTPS (мысалы mkcert сертификаттарымен) — телефонда камераны тексеру үшін
  server = https.createServer({ key: fs.readFileSync(config.sslKey), cert: fs.readFileSync(config.sslCert) }, app);
  scheme = 'https';
} else {
  server = http.createServer(app);
}

server.listen(config.port, config.host, () => {
  console.log(`\n  BeautyChem AI backend: ${scheme}://localhost:${config.port}`);
  console.log(`  Gemini API кілті: ${config.geminiKey ? 'бапталған (' + config.geminiModel + ')' : 'ЖОҚ — .env файлына GEMINI_API_KEY енгізіңіз'}`);
  console.log(`  Дерекқор: ${config.dbPath}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
