import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';

import { initDatabase, ensureAdminSeed } from './services/db.js';
import { attachWebUser } from './services/auth.js';
import apiRouter from './routes/api.js';
import webRouter from './routes/web.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security headers
app.use(helmet());

// Logging
app.use(morgan('dev'));

// Static files
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Views
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

// Sessions
const FileStore = sessionFileStore(session);
const sessionSecret = process.env.SESSION_SECRET || 'dev_session_secret_change_me';
const sessionsDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}
app.use(session({
  store: new FileStore({
    path: path.join(sessionsDir, 'sessions'),
    retries: 1,
    fileExtension: '.json'
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false
  }
}));

// Flash-like simple messaging
app.use((req, res, next) => {
  res.locals.siteName = process.env.SITE_NAME || 'MusicMark';
  res.locals.currentUser = null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// Attach user if logged in
app.use(attachWebUser);

// Routers
app.use('/api', apiRouter);
app.use('/', webRouter);

// Simple health endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Not Found' });
  }
  res.status(404).render('404');
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (res.headersSent) return;
  // API 返回 JSON
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
  // Web 渲染 500；若视图缺失则兜底为纯文本
  try {
    return res.status(500).render('500');
  } catch (_e) {
    return res.status(500).type('text/plain').send('500 - Server Error');
  }
});

// Boot
const port = Number(process.env.PORT || 3000);
(async () => {
  await initDatabase();
  await ensureAdminSeed();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${port}`);
  });
})();


