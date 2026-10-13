/* Standalone cardio sessions (run, ride, swim, treadmill...) — the first Laud Fit data that lives in
   SQLite (laudfit.db in DATA_DIR) instead of the openGym JSON files. node:sqlite is built into
   Node 22, so this adds no dependency. Users, passkeys and the workout state stay in JSON.

   A session is keyed by an id the client makes (so an offline device can queue it and push it
   later, and a retry is an update, not a duplicate); the route is one JSON column read only by
   `track`, so listing stays light. */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export const ACTIVITIES = [
  'run', 'walk', 'hike', 'cycling', 'mtb', 'stationary_bike', 'treadmill_run', 'treadmill_walk',
  'inline', 'swim', 'rowing', 'elliptical', 'stairs', 'jump_rope', 'other'
];
export const ENVS = ['indoor', 'outdoor'];
export const SOURCES = ['gps', 'manual', 'estimated'];
export const MAX_POINTS = 20000;
export const MAX_SESSIONS = 5000; // per profile; list() returns at most this many

export class CardioError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}

const num = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new CardioError(`${name} out of range`);
  return n;
};
const optNum = (v, name, min, max) => (v == null ? null : num(v, name, min, max));

/** Validates and normalises one session; throws CardioError. Never trusts a derived number to be right,
 *  only to be sane — speed/pace/splits are computed by the client from what is stored. */
export function cleanSession(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new CardioError('session required');
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(s.id)) throw new CardioError('bad id');
  if (!ACTIVITIES.includes(s.activity)) throw new CardioError('bad activity');
  if (!ENVS.includes(s.env)) throw new CardioError('bad env');
  if (!SOURCES.includes(s.source)) throw new CardioError('bad source');
  const duration = Math.round(num(s.duration_s, 'duration_s', 1, 7 * 86400));
  const moving = s.moving_s == null ? duration : Math.round(num(s.moving_s, 'moving_s', 0, duration));
  return {
    id: s.id, activity: s.activity, env: s.env, source: s.source,
    started: Math.round(num(s.started, 'started', 946684800000, Date.now() + 86400000)),
    duration_s: duration, moving_s: moving,
    distance_m: optNum(s.distance_m, 'distance_m', 0, 1e6),
    elev_gain_m: optNum(s.elev_gain_m, 'elev_gain_m', 0, 20000),
    calories: optNum(s.calories, 'calories', 0, 50000),
    note: typeof s.note === 'string' ? s.note.slice(0, 500) : ''
  };
}

/** Points are [t_seconds_from_start, lat, lon, alt|null, accuracy|null]. */
export function cleanPoints(pts) {
  if (pts == null) return null;
  if (!Array.isArray(pts) || pts.length > MAX_POINTS) throw new CardioError('bad points');
  return pts.map(p => {
    if (!Array.isArray(p) || p.length < 3) throw new CardioError('bad point');
    return [
      Math.round(num(p[0], 't', 0, 7 * 86400)),
      +num(p[1], 'lat', -90, 90).toFixed(6), +num(p[2], 'lon', -180, 180).toFixed(6),
      p[3] == null ? null : Math.round(num(p[3], 'alt', -1000, 10000)),
      p[4] == null ? null : Math.round(num(p[4], 'acc', 0, 100000))
    ];
  });
}

export function openCardio(dir) {
  const db = new DatabaseSync(path.join(dir, 'laudfit.db'));
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS cardio_sessions (
      user_id TEXT NOT NULL, id TEXT NOT NULL, activity TEXT NOT NULL, env TEXT NOT NULL, source TEXT NOT NULL,
      started INTEGER NOT NULL, duration_s INTEGER NOT NULL, moving_s INTEGER NOT NULL,
      distance_m REAL, elev_gain_m REAL, calories REAL, note TEXT NOT NULL DEFAULT '',
      track TEXT, updated INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS cardio_by_user_time ON cardio_sessions (user_id, started DESC);`);
  const COLS = 'id, activity, env, source, started, duration_s, moving_s, distance_m, elev_gain_m, calories, note, updated, track IS NOT NULL AS has_track';
  const q = {
    count: db.prepare('SELECT COUNT(*) AS n FROM cardio_sessions WHERE user_id = ? AND id <> ?'),
    list: db.prepare(`SELECT ${COLS} FROM cardio_sessions WHERE user_id = ? ORDER BY started DESC LIMIT ?`),
    track: db.prepare('SELECT track FROM cardio_sessions WHERE user_id = ? AND id = ?'),
    del: db.prepare('DELETE FROM cardio_sessions WHERE user_id = ? AND id = ?'),
    delUser: db.prepare('DELETE FROM cardio_sessions WHERE user_id = ?'),
    // A push without points keeps the stored route: editing a note must not erase the track.
    put: db.prepare(`INSERT INTO cardio_sessions (user_id, id, activity, env, source, started, duration_s, moving_s,
        distance_m, elev_gain_m, calories, note, track, updated)
      VALUES (:user_id, :id, :activity, :env, :source, :started, :duration_s, :moving_s,
        :distance_m, :elev_gain_m, :calories, :note, :track, :updated)
      ON CONFLICT (user_id, id) DO UPDATE SET activity = excluded.activity, env = excluded.env,
        source = excluded.source, started = excluded.started, duration_s = excluded.duration_s,
        moving_s = excluded.moving_s, distance_m = excluded.distance_m, elev_gain_m = excluded.elev_gain_m,
        calories = excluded.calories, note = excluded.note, updated = excluded.updated,
        track = COALESCE(excluded.track, cardio_sessions.track)`)
  };
  const shape = r => ({ ...r, has_track: !!r.has_track });
  return {
    upsert(uid, session, points) {
      const s = cleanSession(session), pts = cleanPoints(points);
      if (q.count.get(uid, s.id).n >= MAX_SESSIONS) throw new CardioError('too many sessions');
      q.put.run({ user_id: uid, ...s, track: pts && pts.length ? JSON.stringify(pts) : null, updated: Date.now() });
      return s.id;
    },
    list: (uid, limit = MAX_SESSIONS) => q.list.all(uid, Math.min(Math.max(1, limit | 0), MAX_SESSIONS)).map(shape),
    track(uid, id) {
      const r = q.track.get(uid, String(id));
      return r === undefined ? undefined : r.track ? JSON.parse(r.track) : [];
    },
    remove: (uid, id) => q.del.run(uid, String(id)).changes > 0,
    removeUser: uid => q.delUser.run(uid).changes,
    close: () => db.close()
  };
}
