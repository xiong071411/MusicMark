import { Router } from 'express';
import { loginWithCredentials, logout, requireLogin, requireAdmin } from '../services/auth.js';
import { listListensForUser, listUsers, createUser, updateUserPassword, countListensForUser, getUserStats, getUserTopSongs, listAllListensForUser, deleteListensForUser, addListenForUser } from '../services/db.js';
import multer from 'multer';
import XLSX from 'xlsx';

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

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
  // 自动登录：为当前会话设置持久 cookie（30 天）
  try {
    if (req.body.remember === '1' || req.body.remember === 'on' || req.body.remember === true) {
      req.session.cookie.maxAge = 30 * 24 * 3600 * 1000; // 30 天
    } else {
      // 保持会话 cookie（随浏览器会话结束）
      req.session.cookie.expires = false;
      delete req.session.cookie.maxAge;
    }
  } catch (_) {
    // 忽略 cookie 设置异常，继续跳转
  }
  // 显式保存 session，避免某些环境下尚未写入导致跳回登录
  try {
    req.session.save(() => {
      res.redirect('/dashboard');
    });
  } catch (_) {
    res.redirect('/dashboard');
  }
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

// 批量删除听歌记录（当前用户）
router.post('/listens/delete', requireLogin, async (req, res) => {
  const idsRaw = req.body.ids;
  const ids = Array.isArray(idsRaw) ? idsRaw : (idsRaw ? [idsRaw] : []);
  try {
    const removed = await deleteListensForUser(req.session.userId, ids);
    req.session.flash = { type: 'success', message: `已删除 ${removed} 条记录` };
  } catch (_e) {
    req.session.flash = { type: 'error', message: '删除失败' };
  }
  res.redirect('/dashboard');
});
router.get('/stats', requireLogin, (req, res) => {
  const range = (req.query.range === 'week') ? 'week' : 'all';
  const stats = getUserStats(req.session.userId);
  const top = getUserTopSongs(req.session.userId, range, 30);

  // 总时长格式化为 HH:MM:SS
  const totalSec = Math.max(0, Number(stats.total_duration_sec || 0));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const totalHms = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  // 每日趋势分页（7 天/页），按日期从新到旧分页
  const dayPageSize = 7;
  const totalDays = stats.daily.length;
  const totalDayPages = Math.max(1, Math.ceil(totalDays / dayPageSize));
  const dayPage = Math.min(Math.max(parseInt(req.query.dpage || '1', 10), 1), totalDayPages);
  const end = totalDays - (dayPage - 1) * dayPageSize;
  const start = Math.max(0, end - dayPageSize);
  const dailyItems = stats.daily.slice(start, end);

  res.render('stats', {
    stats,
    top,
    range,
    totalHms,
    dailyItems,
    dailyPage: dayPage,
    dailyTotalPages: totalDayPages
  });
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

// 管理员 CSV 导入（导入到当前管理员账号下）
router.post('/admin/import/listens', requireLogin, requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件过大（限制 10MB）' : '上传失败';
      req.session.flash = { type: 'error', message: msg };
      return res.redirect('/admin/users');
    }
    if (!req.file || !req.file.buffer) {
      req.session.flash = { type: 'error', message: '请选择要上传的 CSV 文件' };
      return res.redirect('/admin/users');
    }
    let inserted = 0;
    let duplicates = 0;
    let failed = 0;
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      function parseStartedAt(v) {
        if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
        const ts = Date.parse(String(v));
        if (!Number.isFinite(ts)) return null;
        return Math.floor(ts / 1000);
      }

      for (const r of rows) {
        try {
          const title = String(r.title || r.Title || r["歌曲名"] || '').trim();
          if (!title) { failed += 1; continue; }
          const artist = String(r.artist || r.Artist || r["歌手"] || '').trim() || null;
          const album = String(r.album || r.Album || r["专辑"] || '').trim() || null;
          const source = String(r.source || r.Source || r["来源"] || '').trim() || 'watch';
          const durationSecRaw = r.duration_sec || r.duration || r["时长(秒)"] || '';
          const duration_sec = Number.isFinite(Number(durationSecRaw)) && Number(durationSecRaw) > 0 ? Number(durationSecRaw) : null;
          const external_id = String(r.external_id || r["外部ID"] || '').trim() || null;
          const startedRaw = r.started_at || r.startedAt || r["开始时间"] || r["播放时间"] || '';
          const started_at = parseStartedAt(startedRaw);
          if (started_at == null || Number.isNaN(started_at)) { failed += 1; continue; }

          const result = await addListenForUser(req.session.userId, {
            title,
            artist,
            album,
            source,
            started_at,
            duration_sec,
            external_id
          });
          if (result && result.duplicate) duplicates += 1; else inserted += 1;
        } catch (_rowErr) {
          failed += 1;
        }
      }
      req.session.flash = { type: 'success', message: `导入完成：新增 ${inserted} 条，重复 ${duplicates} 条，失败 ${failed} 条` };
    } catch (_e) {
      req.session.flash = { type: 'error', message: 'CSV 解析失败，请确认文件格式' };
    }
    return res.redirect('/admin/users');
  });
});

export default router;


