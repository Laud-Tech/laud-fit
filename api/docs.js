/* Laud Fit per-profile documents (nutrition days, custom foods, goals) in the same SQLite file as
   cardio.js. One small JSON document per (kind, id): a day is { entries, water }, a custom food is
   its numbers, the goal is one document. The client pushes whole documents; last write wins per
   document. ponytail: two devices editing the SAME day within one sync interval lose the older
   edit — split a day into per-entry rows if that ever bites. */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export const KINDS = ['day', 'food', 'goal', 'plan'];
export const MAX_DOC_BYTES = 64 * 1024;
export const MAX_DOCS = 20000;
export const MAX_BATCH = 200;

export class DocsError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}

const check = (d, withData) => {
  if (!d || typeof d !== 'object' || !KINDS.includes(d.kind)) throw new DocsError('bad kind');
  if (typeof d.id !== 'string' || !/^[A-Za-z0-9_:.-]{1,64}$/.test(d.id)) throw new DocsError('bad id');
  if (!withData) return null;
  if (!d.data || typeof d.data !== 'object' || Array.isArray(d.data)) throw new DocsError('data must be an object');
  const json = JSON.stringify(d.data);
  if (json.length > MAX_DOC_BYTES) throw new DocsError('document too large');
  return json;
};

export function openDocs(dir) {
  const db = new DatabaseSync(path.join(dir, 'laudfit.db'));
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS laudfit_docs (
      user_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL,
      PRIMARY KEY (user_id, kind, id)
    );
    CREATE INDEX IF NOT EXISTS laudfit_docs_by_time ON laudfit_docs (user_id, updated);`);
  const q = {
    count: db.prepare('SELECT COUNT(*) AS n FROM laudfit_docs WHERE user_id = ?'),
    since: db.prepare('SELECT kind, id, data, updated FROM laudfit_docs WHERE user_id = ? AND updated > ? ORDER BY updated'),
    put: db.prepare(`INSERT INTO laudfit_docs (user_id, kind, id, data, updated) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, updated = excluded.updated`),
    del: db.prepare('DELETE FROM laudfit_docs WHERE user_id = ? AND kind = ? AND id = ?'),
    delUser: db.prepare('DELETE FROM laudfit_docs WHERE user_id = ?')
  };
  return {
    /** Applies a batch atomically (all or nothing); returns the server time to ask `since` from next. */
    apply(uid, { put = [], del = [] } = {}) {
      if (!Array.isArray(put) || !Array.isArray(del) || put.length + del.length > MAX_BATCH) throw new DocsError('bad batch');
      const rows = put.map(d => [d.kind, d.id, check(d, true)]);
      del.forEach(d => check(d, false));
      if (rows.length && q.count.get(uid).n + rows.length > MAX_DOCS) throw new DocsError('too many documents');
      const now = Date.now();
      db.exec('BEGIN');
      try {
        for (const [kind, id, json] of rows) q.put.run(uid, kind, id, json, now);
        for (const d of del) q.del.run(uid, d.kind, d.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return now;
    },
    since: (uid, since = 0) => q.since.all(uid, Number(since) || 0).map(r => ({ kind: r.kind, id: r.id, data: JSON.parse(r.data), updated: r.updated })),
    removeUser: uid => q.delUser.run(uid).changes,
    close: () => db.close()
  };
}
