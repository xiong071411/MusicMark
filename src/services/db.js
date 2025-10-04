import fs from 'fs';
import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import bcrypt from 'bcryptjs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_JSON = path.join(DATA_DIR, 'db.json');

let db = null; // Lowdb instance

function ensureDataDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function getDb() {
  if (db) return db;
  ensureDataDirExists();
  const adapter = new JSONFile(DB_JSON);
  db = new Low(adapter, {
    users: [],
    listens: [],
    seq: { users: 0, listens: 0 }
  });
  await db.read();
  db.data ||= { users: [], listens: [], seq: { users: 0, listens: 0 } };
  await db.write();
  return db;
}

export async function initDatabase() {
  await getDb();
}

export async function ensureAdminSeed() {
  const dbi = await getDb();
  const hasAdmin = dbi.data.users.some(u => u.role === 'admin');
  if (hasAdmin) return;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminPassword, 10);
  const now = Math.floor(Date.now() / 1000);
  const id = ++dbi.data.seq.users;
  dbi.data.users.push({ id, username: adminUsername, password_hash: hash, role: 'admin', created_at: now });
  await dbi.write();
  // eslint-disable-next-line no-console
  console.log(`Seeded admin user: ${adminUsername} (请尽快修改密码)`);
}

export async function findUserByUsername(username) {
  const dbi = await getDb();
  return dbi.data.users.find(u => u.username === username) || null;
}

export async function createUser(username, password, role = 'user') {
  const dbi = await getDb();
  if (dbi.data.users.some(u => u.username === username)) throw new Error('duplicate');
  const passwordHash = bcrypt.hashSync(password, 10);
  const id = ++dbi.data.seq.users;
  const now = Math.floor(Date.now() / 1000);
  dbi.data.users.push({ id, username, password_hash: passwordHash, role, created_at: now });
  await dbi.write();
  return id;
}

export async function updateUserPassword(userId, newPassword) {
  const dbi = await getDb();
  const user = dbi.data.users.find(u => u.id === Number(userId));
  if (!user) throw new Error('not found');
  user.password_hash = bcrypt.hashSync(newPassword, 10);
  await dbi.write();
}

export async function verifyUserPassword(username, password) {
  const user = await findUserByUsername(username);
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function addListenForUser(userId, listen) {
  const dbi = await getDb();
  const key = (v) => (v ?? '').toString();
  const exists = dbi.data.listens.find(l =>
    l.user_id === Number(userId) &&
    l.title === listen.title &&
    key(l.artist) === key(listen.artist) &&
    key(l.album) === key(listen.album) &&
    l.started_at === listen.started_at
  );
  if (exists) return { insertedId: exists.id, duplicate: true };
  const id = ++dbi.data.seq.listens;
  const now = Math.floor(Date.now() / 1000);
  dbi.data.listens.push({
    id,
    user_id: Number(userId),
    title: listen.title,
    artist: listen.artist || null,
    album: listen.album || null,
    source: listen.source || null,
    started_at: listen.started_at,
    duration_sec: listen.duration_sec || null,
    external_id: listen.external_id || null,
    created_at: now
  });
  await dbi.write();
  return { insertedId: id, duplicate: false };
}

export function listListensForUser(userId, limit = 100, offset = 0) {
  // Note: kept sync for simplicity since read-only list
  const data = db?.data || { listens: [] };
  const rows = data.listens
    .filter(l => l.user_id === Number(userId))
    .sort((a, b) => b.started_at - a.started_at);
  return rows.slice(offset, offset + limit);
}

export function listAllListensForUser(userId) {
  const data = db?.data || { listens: [] };
  return data.listens
    .filter(l => l.user_id === Number(userId))
    .sort((a, b) => b.started_at - a.started_at);
}

export function listUsers() {
  const data = db?.data || { users: [] };
  return [...data.users].sort((a, b) => a.id - b.id).map(u => ({ id: u.id, username: u.username, role: u.role, created_at: u.created_at }));
}

export function findUserById(id) {
  const data = db?.data || { users: [] };
  const u = data.users.find(x => x.id === Number(id));
  if (!u) return null;
  return { id: u.id, username: u.username, role: u.role, created_at: u.created_at };
}

export function countListensForUser(userId) {
  const data = db?.data || { listens: [] };
  return data.listens.filter(l => l.user_id === Number(userId)).length;
}

// 统计：按天聚合数量、总时长、独立歌曲数、来源分布
export function getUserStats(userId) {
  const data = db?.data || { listens: [] };
  const items = data.listens.filter(l => l.user_id === Number(userId));
  const byDay = new Map(); // yyyy-mm-dd -> { count, duration, titles:Set }
  const sourceMap = new Map(); // source -> count
  let totalCount = 0;
  let totalDuration = 0;
  const uniqueTitles = new Set();

  for (const l of items) {
    totalCount += 1;
    const d = new Date((l.started_at || 0) * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dur = Number.isFinite(l.duration_sec) ? (l.duration_sec || 0) : 0;
    totalDuration += dur;
    uniqueTitles.add(`${l.title}||${l.artist||''}||${l.album||''}`);
    if (!byDay.has(key)) byDay.set(key, { count: 0, duration: 0, titles: new Set() });
    const agg = byDay.get(key);
    agg.count += 1;
    agg.duration += dur;
    agg.titles.add(`${l.title}||${l.artist||''}||${l.album||''}`);
    const src = (l.source || 'unknown');
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  }

  const daily = Array.from(byDay.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, v])=>({
    date,
    count: v.count,
    duration_sec: v.duration,
    unique_titles: v.titles.size
  }));
  const sources = Array.from(sourceMap.entries()).sort((a,b)=>b[1]-a[1]).map(([name, count])=>({ name, count }));
  return {
    total_count: totalCount,
    total_duration_sec: totalDuration,
    unique_titles: uniqueTitles.size,
    daily,
    sources
  };
}

// 听歌排行（按歌曲+歌手+专辑聚合计数），range: 'all' | 'week'
export function getUserTopSongs(userId, range = 'all', limit = 50) {
  const data = db?.data || { listens: [] };
  const nowSec = Math.floor(Date.now() / 1000);
  const since = range === 'week' ? (nowSec - 7 * 24 * 3600) : 0;
  const items = data.listens.filter(l => l.user_id === Number(userId) && (since === 0 || (l.started_at || 0) >= since));
  const map = new Map();
  for (const l of items) {
    const key = `${l.title}||${l.artist||''}||${l.album||''}`;
    const v = map.get(key) || { title: l.title, artist: l.artist||'', album: l.album||'', count: 0, last_play: 0 };
    v.count += 1;
    v.last_play = Math.max(v.last_play, l.started_at || 0);
    map.set(key, v);
  }
  return Array.from(map.values())
    .sort((a,b)=> b.count - a.count || b.last_play - a.last_play)
    .slice(0, limit);
}


