import { Router } from 'express';
import { loginWithCredentials, logout, requireLogin, requireAdmin } from '../services/auth.js';
import { listListensForUser, listUsers, createUser, updateUserPassword, countListensForUser, getUserStats, getUserTopSongs, listAllListensForUser } from '../services/db.js';
import XLSX from 'xlsx';

const router = Router();

router.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  return res.redirect('/login');
});

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await loginWithCredentials(req, username, password);
  if (!user) {
    req.session.flash = { type: 'error', message: '用户名或密码错误' };
    return res.redirect('/login');
  }
  res.redirect('/dashboard');
});

router.post('/logout', requireLogin, async (req, res) => {
  await logout(req);
  res.redirect('/login');
});

router.get('/dashboard', requireLogin, (req, res) => {
  const pageSize = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const offset = (page - 1) * pageSize;
  const total = countListensForUser(req.session.userId);
  const listens = listListensForUser(req.session.userId, pageSize, offset);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  res.render('dashboard', { listens, page, totalPages, pageSize, total });
});
router.get('/stats', requireLogin, (req, res) => {
  const range = (req.query.range === 'week') ? 'week' : 'all';
  const stats = getUserStats(req.session.userId);
  const top = getUserTopSongs(req.session.userId, range, 30);
  res.render('stats', { stats, top, range });
});

router.get('/settings', requireLogin, (req, res) => {
  res.render('settings');
});

router.get('/settings/export', requireLogin, (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  const rows = listAllListensForUser(req.session.userId);
  const data = rows.map(r => ({
    id: r.id,
    title: r.title,
    artist: r.artist || '',
    album: r.album || '',
    source: r.source || '',
    started_at: new Date((r.started_at||0)*1000).toISOString(),
    duration_sec: r.duration_sec || '',
    external_id: r.external_id || ''
  }));

  if (format === 'xlsx' || format === 'excel') {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'listens');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="listens.xlsx"');
    return res.send(buf);
  }

  // default CSV
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="listens.csv"');
  return res.send('\uFEFF' + csv);
});

router.get('/admin/users', requireLogin, requireAdmin, (req, res) => {
  const users = listUsers();
  res.render('admin_users', { users });
});

router.post('/admin/users/create', requireLogin, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    req.session.flash = { type: 'error', message: '用户名与密码必填' };
    return res.redirect('/admin/users');
  }
  try {
    await createUser(username, password, role || 'user');
    req.session.flash = { type: 'success', message: '创建成功' };
  } catch (e) {
    req.session.flash = { type: 'error', message: '创建失败，可能是重名' };
  }
  res.redirect('/admin/users');
});

router.post('/admin/users/:id/reset', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    req.session.flash = { type: 'error', message: '新密码必填' };
    return res.redirect('/admin/users');
  }
  try {
    await updateUserPassword(Number(id), password);
    req.session.flash = { type: 'success', message: '密码已重置' };
  } catch (e) {
    req.session.flash = { type: 'error', message: '重置失败' };
  }
  res.redirect('/admin/users');
});

export default router;


