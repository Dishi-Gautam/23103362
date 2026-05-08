
const API = 'http://4.224.186.213/evaluation-service/notifications';
const DEFAULT_N = 10;

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
  for (const k of candidates) {
    if (notification[k]) return new Date(notification[k]).getTime();
  }
  if (notification.meta && notification.meta.time) return new Date(notification.meta.time).getTime();
  return Date.now();
}

function scoreNotification(notification, nowMs) {
  const weight = weightFor(notification);
  const ts = timestampFor(notification);
  const ageSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
  return weight * 1e9 - ageSeconds;
}

async function fetchNotifications() {
  const res = await fetch(API, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`);
  return res.json();
}

function normalizeList(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.notifications)) return body.notifications;
  if (body && Array.isArray(body.data)) return body.data;
  for (const v of Object.values(body || {})) if (Array.isArray(v)) return v;
  return [];
}

async function main() {
  const n = parseInt(process.argv[2], 10) || DEFAULT_N;
  try {
    const body = await fetchNotifications();
    const list = normalizeList(body);
    const now = Date.now();
    const scored = list.map((item) => ({ item, score: scoreNotification(item, now) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, n).map((s) => s.item);
    console.log(JSON.stringify({ count: top.length, top }, null, 2));
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(2);
  }
}

if (require.main === module) main();
