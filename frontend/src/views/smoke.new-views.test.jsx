// @vitest-environment happy-dom
// The Laud Fit screens must at least mount on a fresh profile, signed in or as a guest.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.__APP_VERSION__ ??= 'test'
vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(async () => ({ docs: [], now: 1, sessions: [] })) }))

import Nutrition from './Nutrition.jsx'
import Cardio from './Cardio.jsx'
import Awards from './Awards.jsx'
import Tools from './Tools.jsx'

let root, host
afterEach(() => { act(() => root.unmount()); host.remove() })
const mount = async el => {
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  const errs = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errs.push(a.join(' ')))
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>) })
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })
  spy.mockRestore()
  return errs
}
describe('new views mount', () => {
  it('Nutrition with a logged day, a plan and supplements', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const e = { id: 'e1', meal: 'lunch', food: null, name: 'Rice', grams: 100, m: { k: 130, p: 3, c: 28, f: 0, fi: 0, su: 0, na: 0 }, t: 1 }
    localStorage.setItem('laudfit_nutrition_v1:guest', JSON.stringify({ days: { [today]: { entries: [e], water: 500, supp: ['s1'] } }, supp: [{ id: 's1', name: 'Creatine' }], plan: { 0: [e], 1: [e], 2: [e], 3: [e], 4: [e], 5: [e], 6: [e] }, goal: { kcal: 2000, p: 140, c: 220, f: 60 } }))
    const errs = await mount(<Nutrition />)
    expect(errs, errs.join('\n')).toEqual([])
    expect(host.textContent).toContain('Creatine')
    expect(host.textContent).toContain('130')
  })
  for (const [name, C] of [['Nutrition', Nutrition], ['Cardio', Cardio], ['Awards', Awards], ['Tools', Tools]]) {
    it(name, async () => {
      const errs = await mount(<C />)
      expect(errs.filter(e => /Error|Cannot|undefined|not a function/.test(e)), errs.join('\n')).toEqual([])
      expect(host.textContent.length).toBeGreaterThan(20)
    })
  }
})
