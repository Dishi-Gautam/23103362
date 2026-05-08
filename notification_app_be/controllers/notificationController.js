import { randomUUID as uuidv4 } from 'crypto';
import { logActivity } from '../middleware/logger.js';

const LIVE_API = process.env.LIVE_API || 'http://4.224.186.213/evaluation-service/notifications';

function normalizeList(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.notifications)) return body.notifications;
  if (body && Array.isArray(body.data)) return body.data;
  for (const v of Object.values(body || {})) if (Array.isArray(v)) return v;
  return [];
}

function weightFor(notification) {
  const t = (notification.type || notification.category || '').toString().toLowerCase();
  if (t.includes('placement')) return 3;
  if (t.includes('result')) return 2;
  if (t.includes('event')) return 1;
  if (typeof notification.weight === 'number') return notification.weight;
  return 1;
}

function timestampFor(notification) {
  const candidates = ['timestamp', 'createdAt', 'time', 'date'];
  for (const k of candidates) if (notification[k]) return new Date(notification[k]).getTime();
  if (notification.meta && notification.meta.time) return new Date(notification.meta.time).getTime();
  return Date.now();
}

function scoreNotification(notification, nowMs) {
  const weight = weightFor(notification);
  const ts = timestampFor(notification);
  const ageSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
  return weight * 1e9 - ageSeconds;
}

export async function getNotifications(req, res) {
  try {
    const { studentID, limit = 20, offset = 0, isRead } = req.query;
    if (!studentID) return res.status(400).json({ error: 'studentID is required' });
    const resApi = await fetch(LIVE_API);
    if (!resApi.ok) throw new Error(`live API ${resApi.status}`);
    const body = await resApi.json();
    const list = normalizeList(body);
    const filtered = list.filter(n => String(n.studentID) === String(studentID) || String(n.studentId) === String(studentID));
    const byRead = isRead !== undefined ? filtered.filter(n => String(n.isRead) === String(isRead === 'true')) : filtered;
    const sorted = byRead.sort((a, b) => new Date(b.createdAt || b.timestamp || b.time) - new Date(a.createdAt || a.timestamp || a.time));
    const paged = sorted.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    await logActivity('FETCH_NOTIFICATIONS', { studentID, count: paged.length });
    res.json({ notifications: paged, total: paged.length, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

export async function getPriorityNotifications(req, res) {
  try {
    const { studentID, limit = 10 } = req.query;
    if (!studentID) return res.status(400).json({ error: 'studentID is required' });
    const resApi = await fetch(LIVE_API);
    if (!resApi.ok) throw new Error(`live API ${resApi.status}`);
    const body = await resApi.json();
    const list = normalizeList(body);
    const filtered = list.filter(n => (String(n.studentID) === String(studentID) || String(n.studentId) === String(studentID)) && !n.isRead);
    const now = Date.now();
    const scored = filtered.map(item => ({ item, score: scoreNotification(item, now) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, parseInt(limit)).map(s => s.item);
    await logActivity('FETCH_PRIORITY_NOTIFICATIONS', { studentID, count: top.length });
    res.json({ notifications: top, total: top.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch priority notifications' });
  }
}

export async function createNotification(req, res) {
  res.status(501).json({ error: 'Write operations disabled: service uses live API read-only' });
}

export async function notifyAll(req, res) {
  res.status(501).json({ error: 'Batch notifications disabled: write operations unsupported' });
}

export async function markAsRead(req, res) {
  res.status(501).json({ error: 'Mark as read disabled: write operations unsupported' });
}
