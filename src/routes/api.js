import { Router } from 'express';
import { z } from 'zod';
import { requireApiBasicAuth } from '../services/auth.js';
import { verifyUserPassword, addListenForUser, listListensForUser, countListensForUser } from '../services/db.js';

const router = Router();

router.get('/ping', requireApiBasicAuth, async (req, res) => {
  const user = await verifyUserPassword(req.apiAuth.username, req.apiAuth.password);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  return res.json({ ok: true, user: { id: user.id, username: user.username } });
});

const listenSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional().nullable(),
  album: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  started_at: z.union([z.number(), z.string().min(1)]),
  duration_sec: z.number().int().positive().optional(),
  external_id: z.string().optional()
});

function parseStartedAt(value) {
  if (typeof value === 'number') {
    return Math.floor(value);
  }
  // ISO or date string
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.floor(ts / 1000);
}

router.post('/listens', requireApiBasicAuth, async (req, res) => {
  const user = await verifyUserPassword(req.apiAuth.username, req.apiAuth.password);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const parsed = listenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Bad Request', details: parsed.error.flatten() });
  }
  const payload = parsed.data;
  const startedEpoch = parseStartedAt(payload.started_at);
  if (startedEpoch == null || Number.isNaN(startedEpoch)) {
    return res.status(400).json({ ok: false, error: 'started_at 无法解析' });
  }

  try {
    const result = addListenForUser(user.id, {
      title: payload.title,
      artist: payload.artist || null,
      album: payload.album || null,
      source: payload.source || 'watch',
      started_at: startedEpoch,
      duration_sec: payload.duration_sec || null,
      external_id: payload.external_id || null
    });
    return res.json({ ok: true, id: result.insertedId, duplicate: result.duplicate === true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Internal Error' });
  }
});

// 分页获取听歌记录
router.get('/listens', requireApiBasicAuth, async (req, res) => {
  const user = await verifyUserPassword(req.apiAuth.username, req.apiAuth.password);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const pageSize = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200); // 1..200
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const offset = (page - 1) * pageSize;
  const total = countListensForUser(user.id);
  const items = listListensForUser(user.id, pageSize, offset);
  res.json({ ok: true, page, limit: pageSize, total, items });
});

export default router;


