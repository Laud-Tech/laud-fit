/* Cardio sessions: the SQLite store (cardio.js) and the four /api/cardio routes, on the real server.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { openCardio, cleanSession, CardioError } from '../cardio.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const cookieFor = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const sess = (over = {}) => ({
  id: 'run-0001-abcd', activity: 'run', env: 'outdoor', source: 'gps', started: Date.now() - 3600000,
  duration_s: 1800, moving_s: 1700, distance_m: 5000, elev_gain_m: 40, calories: 320, note: 'manhã', ...over
});
const pts = [[0, -12.5, -55.7, 380, 5], [60, -12.501, -55.701, 381, 6]];

async function server(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-cardio-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const users = ['u1', 'u2'].map(id => ({ id, name: id, created: new Date().toISOString() }));
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', TRUST_PROXY: '1', ADMIN_UIDS: 'u1' }
  });
  let log = '';
  child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const api = `http://127.0.0.1:${await boundPort(child, () => log)}`;
  const req = async (method, p, { body, uid = 'u1' } = {}) => {
    const r = await fetch(api + p, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...(uid ? { Cookie: cookieFor(uid) } : {}) }
    });
    return { status: r.status, body: await r.json() };
  };
  return { req, dataDir };
}

test('routes need a session', async t => {
  const { req } = await server(t);
  for (const [m, p, b] of [['GET', '/api/cardio/sessions'], ['POST', '/api/cardio/sessions', {}], ['GET', '/api/cardio/track?id=x'], ['POST', '/api/cardio/delete', {}]])
    assert.equal((await req(m, p, { body: b, uid: null })).status, 401, p);
});

test('save, list, read the route, keep it on a later edit, delete', async t => {
  const { req } = await server(t);
  assert.equal((await req('POST', '/api/cardio/sessions', { body: { session: sess(), points: pts } })).status, 200);
  let l = (await req('GET', '/api/cardio/sessions')).body.sessions;
  assert.equal(l.length, 1); assert.equal(l[0].has_track, true); assert.equal(l[0].distance_m, 5000);
  assert.deepEqual((await req('GET', '/api/cardio/track?id=run-0001-abcd')).body.points, pts);
  // Edit the note without points: same row, route kept.
  await req('POST', '/api/cardio/sessions', { body: { session: sess({ note: 'editado' }) } });
  l = (await req('GET', '/api/cardio/sessions')).body.sessions;
  assert.equal(l.length, 1); assert.equal(l[0].note, 'editado');
  assert.equal((await req('GET', '/api/cardio/track?id=run-0001-abcd')).body.points.length, 2);
  assert.equal((await req('POST', '/api/cardio/delete', { body: { id: 'run-0001-abcd' } })).status, 200);
  assert.equal((await req('POST', '/api/cardio/delete', { body: { id: 'run-0001-abcd' } })).status, 404);
  assert.equal((await req('GET', '/api/cardio/track?id=run-0001-abcd')).status, 404);
});

test('a profile never sees or touches another profile\'s sessions', async t => {
  const { req } = await server(t);
  await req('POST', '/api/cardio/sessions', { body: { session: sess(), points: pts } });
  assert.equal((await req('GET', '/api/cardio/sessions', { uid: 'u2' })).body.sessions.length, 0);
  assert.equal((await req('GET', '/api/cardio/track?id=run-0001-abcd', { uid: 'u2' })).status, 404);
  assert.equal((await req('POST', '/api/cardio/delete', { uid: 'u2', body: { id: 'run-0001-abcd' } })).status, 404);
  // Same client id under another profile is its own row.
  await req('POST', '/api/cardio/sessions', { uid: 'u2', body: { session: sess({ distance_m: 1 }) } });
  assert.equal((await req('GET', '/api/cardio/sessions')).body.sessions[0].distance_m, 5000);
});

test('bad input is a 400, not a stored row', async t => {
  const { req } = await server(t);
  for (const bad of [sess({ id: 'x' }), sess({ activity: 'flying' }), sess({ env: 'moon' }), sess({ duration_s: 0 }),
    sess({ distance_m: -1 }), sess({ moving_s: 99999 }), sess({ started: 5 }), null]) {
    assert.equal((await req('POST', '/api/cardio/sessions', { body: { session: bad } })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await req('POST', '/api/cardio/sessions', { body: { session: sess(), points: [[0, 95, 0]] } })).status, 400);
  assert.equal((await req('GET', '/api/cardio/sessions')).body.sessions.length, 0);
});

test('deleting a profile removes its sessions', async t => {
  const { req, dataDir } = await server(t);
  await req('POST', '/api/cardio/sessions', { uid: 'u2', body: { session: sess() } });
  assert.equal((await req('POST', '/api/admin/user/delete', { body: { id: 'u2' } })).status, 200);
  const store = openCardio(dataDir);
  assert.equal(store.list('u2').length, 0);
  store.close();
});

test('cleanSession defaults moving time and clamps the note', () => {
  const s = cleanSession(sess({ moving_s: undefined, note: 'x'.repeat(900) }));
  assert.equal(s.moving_s, s.duration_s); assert.equal(s.note.length, 500);
  assert.throws(() => cleanSession('x'), CardioError);
});
