/* Nutrition documents: the store (docs.js) and the two /api/nutrition routes on the real server.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const cookieFor = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const day = (n = 1) => ({ kind: 'day', id: '2026-10-14', data: { entries: [{ id: 'e1', meal: 'lunch', n }], water: 500 } });

async function server(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-nutri-'));
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
  return { req };
}

test('both routes need a session', async t => {
  const { req } = await server(t);
  assert.equal((await req('GET', '/api/nutrition', { uid: null })).status, 401);
  assert.equal((await req('POST', '/api/nutrition', { uid: null, body: {} })).status, 401);
});

test('put, read back, replace, ask only for what changed since, delete', async t => {
  const { req } = await server(t);
  const a = await req('POST', '/api/nutrition', { body: { put: [day(1), { kind: 'goal', id: 'main', data: { kcal: 2000 } }] } });
  assert.equal(a.status, 200);
  let r = (await req('GET', '/api/nutrition')).body;
  assert.equal(r.docs.length, 2);
  assert.equal(r.docs.find(d => d.kind === 'day').data.water, 500);
  await new Promise(res => setTimeout(res, 5));
  await req('POST', '/api/nutrition', { body: { put: [day(2)] } });
  r = (await req('GET', `/api/nutrition?since=${a.body.now}`)).body;
  assert.deepEqual(r.docs.map(d => d.kind), ['day']);
  assert.equal(r.docs[0].data.entries[0].n, 2);
  await req('POST', '/api/nutrition', { body: { del: [{ kind: 'day', id: '2026-10-14' }] } });
  assert.deepEqual((await req('GET', '/api/nutrition')).body.docs.map(d => d.kind), ['goal']);
});

test('a profile only ever sees its own documents', async t => {
  const { req } = await server(t);
  await req('POST', '/api/nutrition', { body: { put: [day()] } });
  assert.equal((await req('GET', '/api/nutrition', { uid: 'u2' })).body.docs.length, 0);
  await req('POST', '/api/nutrition', { uid: 'u2', body: { del: [{ kind: 'day', id: '2026-10-14' }] } });
  assert.equal((await req('GET', '/api/nutrition')).body.docs.length, 1);
});

test('a bad batch is a 400 and stores nothing, not even its good half', async t => {
  const { req } = await server(t);
  const bad = [
    { put: [day(), { kind: 'weird', id: 'x', data: {} }] }, { put: [{ kind: 'day', id: '../x', data: {} }] },
    { put: [{ kind: 'day', id: 'ok', data: [] }] }, { put: [{ kind: 'day', id: 'big', data: { s: 'x'.repeat(70000) } }] },
    { put: Array.from({ length: 201 }, (_, i) => ({ kind: 'food', id: 'f' + i, data: {} })) }
  ];
  for (const body of bad) assert.equal((await req('POST', '/api/nutrition', { body })).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal((await req('GET', '/api/nutrition')).body.docs.length, 0);
});

test('deleting a profile removes its documents', async t => {
  const { req } = await server(t);
  await req('POST', '/api/nutrition', { uid: 'u2', body: { put: [day()] } });
  assert.equal((await req('POST', '/api/admin/user/delete', { body: { id: 'u2' } })).status, 200);
});
