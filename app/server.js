'use strict';
require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Agentt_21';
const DOMAIN = process.env.DOMAIN || 'rulet.bot.nu';

const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_HOST = process.env.TURN_HOST || DOMAIN;
const TURN_PORT = Number(process.env.TURN_PORT || 3478);
const TURN_TTL_SEC = Number(process.env.TURN_TTL_SEC || 86400);
const TURN_USER_PREFIX = process.env.TURN_USER_PREFIX || 'chatroulette';

const MAX_QUEUE = Number(process.env.MAX_QUEUE || 200);
const MAX_NAME_LEN = 40;
const MAX_MSG_LEN = 500;
const ICE_SERVERS = (process.env.STUN_SERVERS || '')
  .split(',').map(s => s.trim()).filter(Boolean).map(url => ({
    urls: url.startsWith('stun:') || url.startsWith('turn:') ? url : `stun:${url}`
  }));

const clients = new Map();
const queue = new Set();
const bannedIps = new Set();

function makeClient(socket) {
  return {
    id: socket.id,
    name: String(socket.handshake.query?.name || '').slice(0, MAX_NAME_LEN) || 'Гость',
    socket,
    inQueue: false,
    partner: null,
  };
}

function stats() {
  return { online: clients.size, searching: queue.size };
}

function publicOf(c) {
  return { id: c.id, name: c.name };
}

function joinQueue(c) {
  if (c.inQueue) return;
  if (queue.size >= MAX_QUEUE) {
    c.socket.emit('queue_full', { size: queue.size });
    return;
  }
  c.inQueue = true;
  queue.add(c.id);
  io.emit('stats', stats());
  tryMatch();
}

function leaveQueue(c) {
  if (!c.inQueue) return;
  c.inQueue = false;
  queue.delete(c.id);
  io.emit('stats', stats());
}

function tryMatch() {
  while (queue.size >= 2) {
    const ids = Array.from(queue);
    const aId = ids[crypto.randomInt(ids.length)];
    let bId = aId;
    while (bId === aId) {
      bId = ids[crypto.randomInt(ids.length)];
    }
    const a = clients.get(aId);
    const b = clients.get(bId);
    if (!a || !b) {
      queue.delete(aId);
      queue.delete(bId);
      continue;
    }
    queue.delete(a.id);
    queue.delete(b.id);
    a.inQueue = false;
    b.inQueue = false;
    a.partner = b.id;
    b.partner = a.id;

    a.socket.emit('paired', { partner: publicOf(b), youInitiate: true });
    b.socket.emit('paired', { partner: publicOf(a), youInitiate: false });
    io.emit('stats', stats());
  }
}

function unassign(c) {
  const p = c.partner ? clients.get(c.partner) : null;
  c.partner = null;
  if (p) {
    p.partner = null;
    p.socket.emit('partner_left');
    joinQueue(p);
  }
  joinQueue(c);
}

// ИСПРАВЛЕНО: coturn требует base64 для HMAC-SHA1, а не hex!
function turnCredentials() {
  if (!TURN_SECRET) return null;
  const ttl = Math.max(60, TURN_TTL_SEC);
  const t = Math.floor(Date.now() / 1000) + ttl;
  const user = `${t}:${TURN_USER_PREFIX}`;
  const key = crypto.createHmac('sha1', TURN_SECRET).update(user).digest('base64');
  return {
    urls: [
      `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
      `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`
    ],
    username: user,
    credential: key,
  };
}

const app = express();
app.use(express.json());
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ice', (_req, res) => {
  const list = ICE_SERVERS.slice();
  const tc = turnCredentials();
  if (tc) list.push(tc);
  res.json({ iceServers: list, stats: stats() });
});


function getClientIp(socket) {
  const cf = socket.handshake.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xf = socket.handshake.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  const xr = socket.handshake.headers['x-real-ip'];
  if (xr) return String(xr).trim();
  return socket.handshake.address || 'unknown';
}

function checkAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_PASS) return res.status(401).json({ error: 'Неверный пароль' });
  next();
}

app.get('/api/admin/state', checkAdmin, (_req, res) => {
  const userList = Array.from(clients.values()).map(c => ({
    id: c.id,
    name: c.name,
    ip: c.ip || getClientIp(c.socket),
    inQueue: Boolean(c.inQueue),
    partner: c.partner || null
  }));
  let activePairs = 0;
  clients.forEach(c => { if (c.partner) activePairs++; });
  res.json({
    online: clients.size,
    searching: queue.size,
    pairs: Math.floor(activePairs / 2),
    users: userList,
    banned: Array.from(bannedIps)
  });
});

app.post('/api/admin/connect', checkAdmin, (req, res) => {
  const adminId = String(req.body?.adminId || '').trim();
  const targetId = String(req.body?.targetId || '').trim();
  const a = clients.get(adminId);
  const b = clients.get(targetId);
  if (!a || !b) return res.status(404).json({ error: 'Пользователь не найден' });
  if (a.id === b.id) return res.status(400).json({ error: 'Это ваш собственный ID' });
  if (a.partner) {
    const oldP = clients.get(a.partner); a.partner = null;
    if (oldP) { oldP.partner = null; oldP.socket.emit('partner_left'); joinQueue(oldP); }
  }
  leaveQueue(a);
  if (b.partner) {
    const oldP = clients.get(b.partner); b.partner = null;
    if (oldP) { oldP.partner = null; oldP.socket.emit('partner_left'); joinQueue(oldP); }
  }
  leaveQueue(b);
  a.partner = b.id; b.partner = a.id;
  a.socket.emit('paired', { partner: publicOf(b), youInitiate: true });
  b.socket.emit('paired', { partner: publicOf(a), youInitiate: false });
  io.emit('stats', stats());
  res.json({ ok: true });
});

app.post('/api/admin/kick', checkAdmin, (req, res) => {
  const target = clients.get(req.body?.id);
  if (target) { if (target.partner) unassign(target); else leaveQueue(target); }
  res.json({ ok: true });
});

app.post('/api/admin/ban', checkAdmin, (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  if (ip) {
    bannedIps.add(ip);
    clients.forEach(c => {
      if ((c.ip || getClientIp(c.socket)) === ip) { c.socket.emit('banned'); c.socket.disconnect(true); }
    });
  }
  res.json({ ok: true, banned: Array.from(bannedIps) });
});

app.post('/api/admin/unban', checkAdmin, (req, res) => {
  bannedIps.delete(String(req.body?.ip || '').trim());
  res.json({ ok: true, banned: Array.from(bannedIps) });
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ...stats(), turn: Boolean(TURN_SECRET) });
});

const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  perMessageDeflate: false,
  maxHttpBufferSize: 1e6, // ИСПРАВЛЕНО: 1 МБ вместо 10 КБ, чтобы SDP-offer не рвал сокет!
  pingInterval: 25000,
  pingTimeout: 20000,
});

io.on('connection', (socket) => {
  const c = makeClient(socket);
  clients.set(socket.id, c);
  socket.emit('hello', { id: socket.id, name: c.name, stats: stats() });
  io.emit('stats', stats());

  socket.on('search', () => joinQueue(c));

  socket.on('next', () => {
    if (c.partner) unassign(c);
    else joinQueue(c);
  });

  socket.on('stop', () => {
    if (c.partner) {
      const p = clients.get(c.partner);
      c.partner = null;
      if (p) {
        p.partner = null;
        p.socket.emit('partner_left');
        joinQueue(p);
      }
    }
    leaveQueue(c);
    socket.emit('state', { inQueue: false, partner: null });
  });

  function relay(event, data) {
    if (!c.partner) return;
    const p = clients.get(c.partner);
    if (!p) return;
    p.socket.emit(event, { from: c.id, ...data });
  }

  socket.on('offer', (d) => relay('offer', { sdp: d?.sdp }));
  socket.on('answer', (d) => relay('answer', { sdp: d?.sdp }));
  socket.on('ice', (d) => relay('ice', { candidate: d?.candidate }));
  socket.on('chat', (d) => {
    const text = String(d?.text || '').slice(0, MAX_MSG_LEN);
    if (text) relay('chat', { text });
  });


  socket.on('admin_watch', (d) => {
    if (d?.token !== ADMIN_PASS) return;
    const target = clients.get(d?.targetId);
    if (target) {
      target.socket.emit('spy_start', { watcherId: socket.id });
    }
  });

  socket.on('spy_offer', (d) => {
    const w = clients.get(d?.watcherId);
    if (w) w.socket.emit('spy_offer', { from: socket.id, sdp: d?.sdp });
  });

  socket.on('spy_answer', (d) => {
    const t = clients.get(d?.targetId);
    if (t) t.socket.emit('spy_answer', { from: socket.id, sdp: d?.sdp });
  });

  socket.on('spy_ice', (d) => {
    const peer = clients.get(d?.to);
    if (peer) peer.socket.emit('spy_ice', { from: socket.id, candidate: d?.candidate });
  });

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    if (c.partner) {
      const p = clients.get(c.partner);
      if (p) {
        p.partner = null;
        leaveQueue(c);
        p.socket.emit('partner_left');
        joinQueue(p);
      }
    } else {
      leaveQueue(c);
    }
    io.emit('stats', stats());
  });
});

server.listen(PORT, HOST, () => {
  console.log('chatroulette listening on ' + HOST + ':' + PORT);
});
