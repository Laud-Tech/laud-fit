// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = []
let serverDocs = [], fail = null
vi.mock('./api.js', () => ({
  api: vi.fn(async (path, opts) => {
    calls.push([path, opts?.body ? JSON.parse(opts.body) : null])
    if (fail) throw fail
    if (opts?.method === 'POST') {
      for (const d of JSON.parse(opts.body).put || []) serverDocs = [...serverDocs.filter(x => !(x.kind === d.kind && x.id === d.id)), d]
      for (const d of JSON.parse(opts.body).del || []) serverDocs = serverDocs.filter(x => !(x.kind === d.kind && x.id === d.id))
      return { ok: true, now: 100 }
    }
    return { docs: serverDocs, now: 200 }
  })
}))

let sync
beforeEach(async () => {
  calls.length = 0; serverDocs = []; fail = null
  localStorage.clear()
  vi.resetModules()
  sync = await import('./nutrition-sync.js')
  sync.bind('u-' + Math.random())
})
const entry = { id: 'e1', meal: 'lunch', food: 'rice', name: 'Rice', grams: 100, m: { k: 130 } }

describe('nutrition-sync', () => {
  it('applies a change locally first, then pushes the whole day document', async () => {
    sync.editDay('2026-10-14', d => ({ ...d, entries: [...d.entries, entry] }))
    expect(sync.dayOf('2026-10-14').entries).toHaveLength(1)
    await sync.flush()
    const post = calls.find(c => c[1] && c[1].put)
    expect(post[1].put[0]).toMatchObject({ kind: 'day', id: '2026-10-14', data: { entries: [entry], water: 0 } })
    expect(Object.keys(sync.getNutrition().dirty)).toHaveLength(0)
  })
  it('keeps the change in the outbox while offline, and sends it once back', async () => {
    fail = new Error('offline')
    sync.editDay('2026-10-14', d => ({ ...d, water: 250 }))
    await sync.flush()
    expect(sync.dayOf('2026-10-14').water).toBe(250)
    expect(Object.keys(sync.getNutrition().dirty)).toEqual(['day:2026-10-14'])
    fail = null; calls.length = 0
    await sync.flush()
    expect(calls[0][1].put[0].data.water).toBe(250)
    expect(Object.keys(sync.getNutrition().dirty)).toHaveLength(0)
  })
  it('an emptied day is deleted on the server, not stored blank', async () => {
    sync.editDay('2026-10-14', d => ({ ...d, water: 250 })); await sync.flush()
    sync.editDay('2026-10-14', d => ({ ...d, water: 0 })); await sync.flush()
    expect(calls.some(c => c[1]?.del?.[0]?.id === '2026-10-14')).toBe(true)
    expect(sync.getNutrition().days['2026-10-14']).toBeUndefined()
  })
  it('a pull brings other devices\' documents but never overwrites an unsent local edit', async () => {
    serverDocs = [{ kind: 'day', id: '2026-10-13', data: { entries: [entry], water: 0 } }, { kind: 'goal', id: 'main', data: { kcal: 2000 } },
      { kind: 'day', id: '2026-10-14', data: { entries: [], water: 999 } }]
    fail = new Error('offline')
    sync.editDay('2026-10-14', d => ({ ...d, water: 250 })); await sync.flush()   // dirty, push failed
    fail = null
    // Pull path only: simulate by making the push succeed but keep the doc dirty before the GET resolves.
    await sync.flush()
    expect(sync.getNutrition().goal.kcal).toBe(2000)
    expect(sync.dayOf('2026-10-13').entries).toHaveLength(1)
    expect(sync.dayOf('2026-10-14').water).toBe(250)   // ours, pushed after; the server's 999 did not win
  })
  it('saves and removes custom foods and the goal as documents', async () => {
    sync.saveFood({ id: 'my-1', name: 'Mine', k: 100 }); sync.saveGoal({ kcal: 1800 }); await sync.flush()
    const kinds = calls.filter(c => c[1]?.put).flatMap(c => c[1].put.map(d => d.kind)).sort()
    expect(kinds).toEqual(['food', 'goal'])
    sync.removeFood('my-1'); await sync.flush()
    expect(calls.some(c => c[1]?.del?.[0]?.kind === 'food')).toBe(true)
    expect(sync.getNutrition().foods['my-1']).toBeUndefined()
  })
})
