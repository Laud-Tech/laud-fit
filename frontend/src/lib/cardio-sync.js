// Client copy of the cardio sessions, per profile, with an outbox for what the server has not
// seen yet. A session is saved here first and pushed after, so recording works with no signal,
// as a guest, and on a phone that is not paired: the outbox simply keeps it until a push works.
// Server routes: api/cardio.js. Pure maths lives in cardio.js.
import { api } from './api.js'
import { decimate } from './cardio.js'

const KEY = 'laudfit_cardio_v1:'
const DRAFT = 'laudfit_cardio_draft_v1'
let owner = null
let st = { sessions: [], pending: {}, removed: [] }
const subs = new Set()
const read = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode or full: the session stays in memory */ } }
const commit = () => { if (owner) write(KEY + owner, st); subs.forEach(f => f()) }

/** Switches to a profile's copy ('guest' when nobody is signed in). */
export function bind(uid) {
  if (owner === uid) return
  owner = uid
  const s = read(KEY + uid)
  st = { sessions: s?.sessions || [], pending: s?.pending || {}, removed: s?.removed || [] }
  subs.forEach(f => f())
}
export const getCardio = () => st
export const subscribe = f => { subs.add(f); return () => subs.delete(f) }

/** Saves (or edits) a session; `points` only when there is a route to send. */
export function saveSession(session, points) {
  const pts = points && points.length ? decimate(points, 3000) : undefined   // ponytail: 3000 points ~ a few km of detail per 10 m; raise if routes look jagged
  st = {
    ...st,
    sessions: [{ ...session, has_track: !!pts || !!st.sessions.find(x => x.id === session.id)?.has_track }, ...st.sessions.filter(x => x.id !== session.id)],
    pending: { ...st.pending, [session.id]: { session, points: pts } },
    removed: st.removed.filter(id => id !== session.id)
  }
  commit()
  return flush()
}

export function removeSession(id) {
  const { [id]: _, ...pending } = st.pending
  st = { ...st, sessions: st.sessions.filter(x => x.id !== id), pending, removed: [...new Set([...st.removed, id])] }
  commit()
  return flush()
}

let flushing = null
/** Pushes the outbox, then asks the server for the list. Never throws: offline is a normal state. */
export function flush() {
  if (!owner) return Promise.resolve(false)
  flushing ??= (async () => {
    try {
      for (const id of [...st.removed]) {
        try { await api('/api/cardio/delete', { method: 'POST', body: JSON.stringify({ id }) }) }
        catch (e) { if (e.status !== 404) throw e }
        st = { ...st, removed: st.removed.filter(x => x !== id) }; commit()
      }
      for (const [id, { session, points }] of Object.entries(st.pending)) {
        const sent = st.pending[id]
        await api('/api/cardio/sessions', { method: 'POST', body: JSON.stringify({ session, points }) })
        // Edited again while it was being sent: leave that newer copy queued.
        if (st.pending[id] === sent) { const { [id]: _, ...rest } = st.pending; st = { ...st, pending: rest }; commit() }
      }
      const { sessions } = await api('/api/cardio/sessions')
      // What is still waiting to be pushed wins over the server's older copy.
      const keep = Object.values(st.pending).map(p => p.session)
      st = { ...st, sessions: [...keep.map(s => ({ ...s, has_track: !!st.pending[s.id].points })), ...sessions.filter(s => !st.pending[s.id] && !st.removed.includes(s.id))].sort((a, b) => b.started - a.started) }
      commit()
      return true
    } catch (e) {
      // 400 from the server means the session itself is bad: dropping it from the outbox beats retrying forever.
      if (e.status === 400) {
        const bad = Object.keys(st.pending)[0]
        if (bad) { const { [bad]: _, ...rest } = st.pending; st = { ...st, pending: rest }; commit() }
      }
      return false
    } finally { flushing = null }
  })()
  return flushing
}

/** The route of a session: the outbox copy if it is still there, else the server's. */
export async function getTrack(id) {
  const p = st.pending[id]
  if (p) return p.points || []
  try { return (await api('/api/cardio/track?id=' + encodeURIComponent(id))).points } catch { return null }
}

// A recording in progress survives a reload or a killed tab.
export const loadDraft = () => read(DRAFT)
export const saveDraft = d => write(DRAFT, d)
export const clearDraft = () => { try { localStorage.removeItem(DRAFT) } catch { /* nothing to clear */ } }

if (typeof window !== 'undefined') window.addEventListener('online', () => { flush() })
