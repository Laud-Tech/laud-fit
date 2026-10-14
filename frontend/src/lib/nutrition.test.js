import { describe, it, expect } from 'vitest'
import {
  macrosOf, addMacros, dayTotals, portionGrams, bmr, tdee, bmi, dailyGoal, weeksToGoal, kcalFloor,
  fold, searchFoods, nameOf, expandDish, mealForHour, ZERO
} from './nutrition.js'
import data from '../data/foods.json'

const banana = { id: 'banana', n: { en: 'Banana', pt: 'Banana' }, k: 89, p: 1.1, c: 22.8, f: 0.3, kind: 'unit', g: 120 }

describe('macros', () => {
  it('scales per-100 g values to the grams eaten', () => {
    const m = macrosOf(banana, 120)
    expect(m.k).toBeCloseTo(106.8); expect(m.c).toBeCloseTo(27.36); expect(m.fi).toBe(0)
  })
  it('adds and totals a day by meal, from the snapshot on each entry', () => {
    const e = [{ meal: 'breakfast', m: macrosOf(banana, 120) }, { meal: 'breakfast', m: macrosOf(banana, 60) }, { meal: 'lunch', m: { k: 500, p: 30, c: 50, f: 10 } }]
    const t = dayTotals(e)
    expect(t.byMeal.breakfast.k).toBe(160); expect(t.total.k).toBe(660); expect(t.byMeal.dinner.k).toBe(0)
    expect(dayTotals([]).total).toEqual({ k: 0, p: 0, c: 0, f: 0, fi: 0, su: 0, na: 0 })
    expect(addMacros(ZERO, { k: 1 }).k).toBe(1)
  })
  it('knows a household portion, with a fallback', () => {
    expect(portionGrams(banana)).toBe(120)
    expect(portionGrams({ kind: 'tbsp' })).toBe(15)
    expect(portionGrams({})).toBe(100)
  })
})

describe('energy and goals', () => {
  const me = { sex: 'male', kg: 80, cm: 180, age: 30 }
  it('Mifflin-St Jeor, both sexes', () => {
    expect(bmr(me)).toBe(1780)                       // 800 + 1125 - 150 + 5
    expect(bmr({ ...me, sex: 'female' })).toBe(1614) // ... - 161
    expect(tdee(me, 'moderate')).toBe(Math.round(1780 * 1.55))
    expect(bmi(80, 180)).toBe(24.7)
  })
  it('turns a weekly loss into a daily deficit', () => {
    const g = dailyGoal(me, 'moderate', -0.5)
    expect(g.maintenance).toBe(2759)
    expect(g.kcal).toBe(Math.round(2759 - 0.5 * 7700 / 7))   // 2209
    expect(g.p).toBe(144)
    // Macros add back up to the target within rounding.
    expect(Math.abs(g.p * 4 + g.c * 4 + g.f * 9 - g.kcal)).toBeLessThan(12)
    expect(g.floored).toBe(false)
  })
  it('never suggests below the floor', () => {
    const small = { sex: 'female', kg: 55, cm: 160, age: 40 }
    const g = dailyGoal(small, 'sedentary', -1)
    expect(g.kcal).toBe(kcalFloor('female')); expect(g.floored).toBe(true)
    expect(dailyGoal(me, 'light', 0.25).floored).toBe(false)
  })
  it('estimates the weeks to a goal weight, or says it cannot', () => {
    expect(weeksToGoal(80, 70, -0.5)).toBe(20)
    expect(weeksToGoal(70, 80, -0.5)).toBeNull()
    expect(weeksToGoal(70, 70, -0.5)).toBe(0)
  })
})

describe('search', () => {
  it('ignores accents and case, needs every word', () => {
    expect(fold('Maçã')).toBe('maca')
    const foods = data.foods
    const r = searchFoods(foods, 'feijao preto', 'pt')
    expect(r.length).toBeGreaterThan(0); expect(r.every(f => /feij/i.test(fold(nameOf(f, 'pt'))))).toBe(true)
    expect(searchFoods(foods, '', 'pt')).toEqual([])
    expect(searchFoods(foods, 'zzzzzz', 'pt')).toEqual([])
  })
  it('puts names that start with the query first, custom foods before library ones', () => {
    const foods = [{ id: 'a', n: { en: 'Rice cake' } }, { id: 'b', n: { en: 'Brown rice' } }, { id: 'c', custom: true, name: 'Rice mine' }]
    expect(searchFoods(foods, 'rice', 'en').map(f => f.id)).toEqual(['c', 'a', 'b'])
  })
  it('falls back from a region code to the language, then English', () => {
    expect(nameOf({ id: 'x', n: { en: 'E', zh: '中' } }, 'zh-TW')).toBe('中')
    expect(nameOf({ id: 'x', n: { en: 'E' } }, 'hi')).toBe('E')
  })
})

describe('the bundled data', () => {
  it('has Brazilian staples with plausible numbers', () => {
    const f = data.foods.find(x => fold(x.n.pt) === 'feijao-carioca')
    expect(f.k).toBeGreaterThan(300)
    const rice = searchFoods(data.foods, 'arroz', 'pt')
    expect(rice.length).toBeGreaterThan(0)
  })
  it('every dish resolves to foods and has energy', () => {
    const byId = Object.fromEntries(data.foods.map(f => [f.id, f]))
    for (const d of data.dishes) { const x = expandDish(d, byId); expect(x.rows.length, d.id).toBe(d.items.length); expect(x.total.k, d.id).toBeGreaterThan(0) }
  })
  it('every food has a Portuguese name, and kcal agrees with its macros for all but a few', () => {
    // Alcohol, extracts, fibre-rich and leavening foods legitimately do not add up (vermouth, vanilla extract...).
    const off = data.foods.filter(f => {
      expect(f.n.pt, f.id).toBeTruthy()
      const est = f.p * 4 + (f.c - (f.fi || 0)) * 4 + f.f * 9 + (f.fi || 0) * 2
      return f.k > 20 && est > 20 && Math.abs(est - f.k) / f.k > 0.35
    })
    expect(off.length, off.map(f => f.id).join()).toBeLessThanOrEqual(12)
  })
})

describe('mealForHour', () => {
  it('picks a default meal', () => { expect([6, 12, 17, 20].map(mealForHour)).toEqual(['breakfast', 'lunch', 'snacks', 'dinner']) })
})

import { weekSummary, planWith, planEntries, toggleSupp, weekdayOf } from './nutrition.js'
describe('week, plan, supplements', () => {
  const e = (k, id = 'a') => ({ id, t: 1, meal: 'lunch', food: 'rice', name: 'Rice', grams: 100, m: { k, p: 1, c: 2, f: 3, fi: 0, su: 0, na: 0 } })
  it('weekSummary averages only logged days', () => {
    const w = weekSummary({ '2026-10-13': { entries: [e(500)], water: 1000 }, '2026-10-14': { entries: [e(700)], water: 2000 }, '2026-10-01': { entries: [e(9999)] } }, '2026-10-14')
    expect(w.rows).toHaveLength(7)
    expect(w.rows[6].date).toBe('2026-10-14')
    expect(w.logged).toBe(2)
    expect(w.avg.k).toBe(600)
    expect(w.avg.water).toBe(1500)
  })
  it('plan round trip drops ids, applying gives new ones', () => {
    const plan = planWith({}, 3, [e(500, 'x')])
    expect(plan[3][0].id).toBeUndefined()
    const got = planEntries(plan, 3, () => 'new', 5)
    expect(got).toEqual([{ ...plan[3][0], id: 'new', t: 5 }])
    expect(planEntries(plan, 4, () => 'n')).toEqual([])
    expect(planWith(plan, 3, [])).toEqual({})
  })
  it('weekdayOf and toggleSupp', () => {
    expect(weekdayOf('2026-10-14')).toBe(3)
    expect(toggleSupp(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSupp(['a', 'b'], 'a')).toEqual(['b'])
  })
})
