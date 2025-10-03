import { verifyUserPassword, findUserById } from './db.js';

export async function loginWithCredentials(req, username, password) {
  const user = await verifyUserPassword(username, password);
  if (!user) return null;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  return user;
}

export function logout(req) {
  return new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
}

export function attachWebUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = findUserById(req.session.userId);
    if (user) {
      res.locals.currentUser = user;
    }
  }
  next();
}

export function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    req.session.flash = { type: 'error', message: '请先登录' };
    return res.redirect('/login');
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).render('403');
  }
  next();
}

export function requireApiBasicAuth(req, res, next) {
  const hdr = req.headers['authorization'] || '';
  if (!hdr.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="MusicMark API"');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const raw = Buffer.from(hdr.slice(6), 'base64').toString('utf8');
    const idx = raw.indexOf(':');
    if (idx <= 0) throw new Error('bad');
    req.apiAuth = { username: raw.slice(0, idx), password: raw.slice(idx + 1) };
    next();
  } catch {
    res.set('WWW-Authenticate', 'Basic realm="MusicMark API"');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}


