// Client copy of the nutrition documents (days, custom foods, goal) per profile, with an outbox,
// like cardio-sync.js: every change is applied here first, so the diary works offline and as a
// guest, and is pushed when a push works. Server: api/docs.js. A document is replaced whole.
import { api } from './api.js'

const KEY = 'laudfit_nutrition_v1:'
let owner = null
let st = blank()
const subs = new Set()
function blank() { return { days: {}, foods: {}, goal: null, plan: null, supp: null, dirty: {}, deleted: [], since: 0, seq: 0 } }
const read = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const commit = () => { if (owner) { try { localStorage.setItem(KEY + owner, JSON.stringify(st)) } catch { /* storage full: memory only */ } } subs.forEach(f => f()) }

export function bind(uid) {
  if (owner === uid) return
  owner = uid
  st = { ...blank(), ...(read(KEY + uid) || {}) }
  subs.forEach(f => f())
}
export const getNutrition = () => st
export const subscribe = f => { subs.add(f); return () => subs.delete(f) }

const SLOT = { day: 'days', food: 'foods' }
const SINGLE = new Set(['goal', 'plan', 'supp']) // one document each, id 'main'
const slot = kind => SLOT[kind] || kind
const EMPTY_DAY = { entries: [], water: 0, supp: [] }
export const dayOf = date => st.days[date] || EMPTY_DAY

function put(kind, id, data) {
  const s = slot(kind)
  st = { ...st, [s]: SINGLE.has(s) ? data : { ...st[s], [id]: data }, seq: st.seq + 1, dirty: { ...st.dirty, [kind + ':' + id]: st.seq + 1 }, deleted: st.deleted.filter(d => !(d.kind === kind && d.id === id)) }
  commit(); flush()
}
function del(kind, id) {
  const s = slot(kind), { [id]: _, ...rest } = st[s] || {}
  const { [kind + ':' + id]: __, ...dirty } = st.dirty
  st = { ...st, [s]: rest, dirty, deleted: [...st.deleted, { kind, id }] }
  commit(); flush()
}

/** Replaces day `date` with fn(day). An emptied day is deleted rather than kept as a blank document. */
export function editDay(date, fn) {
  const cur = dayOf(date)
  const next = fn({ entries: [...cur.entries], water: cur.water, supp: [...(cur.supp || [])] })
  if (!next.entries.length && !next.water && !next.supp?.length) { if (st.days[date]) del('day', date) } else put('day', date, next)
}
export const saveFood = food => put('food', food.id, food)
export const removeFood = id => del('food', id)
export const saveGoal = goal => put('goal', 'main', goal)
export const savePlan = plan => put('plan', 'main', plan)
export const saveSupp = list => put('supp', 'main', list)

let flushing = null
/** Pushes the outbox, then pulls what changed on the server. Never throws: offline is normal. */
export function flush() {
  if (!owner) return Promise.resolve(false)
  flushing ??= (async () => {
    try {
      const keys = Object.keys(st.dirty), sent = { ...st.dirty }, sentDel = [...st.deleted]
      if (keys.length || st.deleted.length) {
        const putDocs = keys.map(k => { const [kind, ...r] = k.split(':'), id = r.join(':'), s = slot(kind); return { kind, id, data: SINGLE.has(s) ? st[s] : st[s][id] } }).filter(d => d.data)
        for (let i = 0; i < Math.max(putDocs.length, st.deleted.length); i += 100) {
          const b = { put: putDocs.slice(i, i + 100), del: st.deleted.slice(i, i + 100) }
          await api('/api/nutrition', { method: 'POST', body: JSON.stringify(b) })
        }
        // Only what was sent is cleared: an edit made while the push was in flight stays queued.
        st = { ...st, dirty: Object.fromEntries(Object.entries(st.dirty).filter(([k, v]) => sent[k] !== v)), deleted: st.deleted.filter(d => !sentDel.includes(d)) }; commit()
      }
      const r = await api('/api/nutrition?since=' + st.since)
      const next = { days: { ...st.days }, foods: { ...st.foods } }
      for (const d of r.docs) {
        if (st.dirty[d.kind + ':' + d.id]) continue
        const s = slot(d.kind)
        if (SINGLE.has(s)) next[s] = d.data
        else if (next[s]) next[s][d.id] = d.data
      }
      // A pull never deletes: removals reach the server first, and `since` only returns what exists.
      st = { ...st, ...next, since: r.now }
      commit()
      if (Object.keys(st.dirty).length || st.deleted.length) { flushing = null; return flush() }
      return true
    } catch (e) {
      // A 400 is a document the server will never take; keep it local instead of retrying forever.
      if (e.status === 400) { st = { ...st, dirty: {}, deleted: [] }; commit() }
      return false
    } finally { flushing = null }
  })()
  return flushing
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { flush() })
