// Laud Fit nutrition: pure helpers behind the Nutrition screen (energy, macros, daily goal, search).
// Food values are per 100 g (kcal, protein p, carbs c, fat f, optional fiber fi, sugar su, sodium na in mg);
// data/foods.json, from GymMane (GPL-3.0, "Based on GymMane by InlitX"). Estimates, not medical advice.

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks']
// Grams in one household portion when a food has none of its own.
export const PORTION_FALLBACK = { unit: 100, slice: 30, scoop: 30, tbsp: 15, tsp: 5, cup: 240, glass: 200 }

const r1 = n => Math.round(n * 10) / 10
const KEYS = ['k', 'p', 'c', 'f', 'fi', 'su', 'na']
export const ZERO = { k: 0, p: 0, c: 0, f: 0, fi: 0, su: 0, na: 0 }

/** Nutrients of `grams` of `food` (a library or custom food, values per 100 g). */
export function macrosOf(food, grams) {
  const m = {}
  for (const key of KEYS) m[key] = (Number(food[key]) || 0) * grams / 100
  return m
}
export function addMacros(a, b) { const m = {}; for (const key of KEYS) m[key] = (a[key] || 0) + (b[key] || 0); return m }
export const roundMacros = m => ({ k: Math.round(m.k), p: r1(m.p), c: r1(m.c), f: r1(m.f), fi: r1(m.fi), su: r1(m.su), na: Math.round(m.na) })

/**
 * Totals of a day's entries. An entry carries a snapshot of the food's numbers (`m`), so editing or
 * deleting a custom food later never rewrites what was eaten.
 */
export function dayTotals(entries) {
  const byMeal = Object.fromEntries(MEALS.map(m => [m, { ...ZERO }]))
  let total = { ...ZERO }
  for (const e of entries || []) {
    const m = e.m || ZERO
    byMeal[e.meal] = addMacros(byMeal[e.meal] || ZERO, m)
    total = addMacros(total, m)
  }
  return { total: roundMacros(total), byMeal: Object.fromEntries(Object.entries(byMeal).map(([k, v]) => [k, roundMacros(v)])) }
}

/** Grams for `n` household portions of a food ('unit' of a banana, 'tbsp' of oil...). */
export const portionGrams = food => (food.g > 0 ? food.g : PORTION_FALLBACK[food.kind] || 100)

// ---- energy and goals -------------------------------------------------------------------------
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 }

/** Basal metabolic rate, Mifflin-St Jeor (kcal/day). sex: 'male' | 'female'. */
export function bmr({ sex, kg, cm, age }) {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
}
export const tdee = (p, activity = 'light') => Math.round(bmr(p) * (ACTIVITY[activity] || ACTIVITY.light))
export const bmi = (kg, cm) => r1(kg / (cm / 100) ** 2)

// A kilo of body fat is about 7,700 kcal.
const KCAL_PER_KG = 7700
/** The lowest daily target this app will suggest on its own; below it is for a clinician, not a calculator. */
export const kcalFloor = sex => (sex === 'male' ? 1500 : 1200)

/**
 * A daily kcal target and macro grams for a goal. `weeklyKg` is the change per week: negative to lose,
 * positive to gain, 0 to maintain. Returns { kcal, p, c, f, floored } — `floored` is true when the
 * deficit asked for was cut back to the floor.
 */
export function dailyGoal(profile, activity, weeklyKg = 0) {
  const maintenance = tdee(profile, activity)
  let kcal = Math.round(maintenance + weeklyKg * KCAL_PER_KG / 7)
  const floor = kcalFloor(profile.sex)
  const floored = weeklyKg < 0 && kcal < floor
  if (floored) kcal = floor
  // Protein first (1.8 g per kg while cutting, 1.6 otherwise), fat 25% of energy, carbs take the rest.
  const p = Math.round(profile.kg * (weeklyKg < 0 ? 1.8 : 1.6))
  const f = Math.round(kcal * 0.25 / 9)
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4))
  return { kcal, p, c, f, maintenance, floored }
}

/** Weeks to go from `kg` to `goalKg` at `weeklyKg` per week (null when the direction does not fit). */
export function weeksToGoal(kg, goalKg, weeklyKg) {
  const diff = goalKg - kg
  if (!diff) return 0
  if (!weeklyKg || Math.sign(diff) !== Math.sign(weeklyKg)) return null
  return Math.ceil(diff / weeklyKg)
}

/** Energy of a cardio session, to show next to the day's intake (it does not change the goal). */
export const netKcal = (eaten, burned) => Math.round(eaten - (burned || 0))

// ---- search -----------------------------------------------------------------------------------
const FROM = 'áàâäãåąéèêëęíìîïıóòôöõőøúùûüűñńçćčłśşšźżžğýÿ'
const TO = 'aaaaaaaeeeeeiiiiiooooooouuuuunnccclssszzzgyy'
export const fold = s => [...String(s || '').toLowerCase()].map(c => { const i = FROM.indexOf(c); return i < 0 ? c : TO[i] }).join('')

export const nameOf = (food, lang) => food.name || food.n?.[lang] || food.n?.[String(lang).split('-')[0]] || food.n?.en || food.id

/**
 * Foods whose name (in `lang` or English) contains every word typed, best first: names that start
 * with the query, then shorter names. Custom foods come before library ones.
 */
export function searchFoods(foods, query, lang, limit = 40) {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored = []
  for (const f of foods) {
    const name = fold(nameOf(f, lang)), hay = name + ' ' + fold(f.n?.en || '')
    if (!words.every(w => hay.includes(w))) continue
    scored.push([(f.custom ? 0 : 4) + (name.startsWith(words[0]) ? 0 : 2) + (name.split(/\s+/).includes(words[0]) ? 0 : 1), name.length, f])
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(x => x[2])
}

/** A dish's items as { food, grams } rows and their summed macros. `byId` maps food id -> food. */
export function expandDish(dish, byId) {
  const rows = dish.items.map(([id, grams]) => ({ food: byId[id], grams })).filter(x => x.food)
  return { rows, total: roundMacros(rows.reduce((a, x) => addMacros(a, macrosOf(x.food, x.grams)), { ...ZERO })) }
}

/** The meal a log entry made at `hour` belongs to by default. */
export const mealForHour = h => (h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snacks' : 'dinner')

// ---- week, plan, supplements -------------------------------------------------------------------
const dayShift = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay()

/** The 7 days ending at `endISO`: per-day totals, plus the average over the days that have entries. */
export function weekSummary(days, endISO) {
  const rows = Array.from({ length: 7 }, (_, i) => {
    const date = dayShift(endISO, i - 6), d = days[date], total = dayTotals(d?.entries).total
    return { date, k: total.k, p: total.p, c: total.c, f: total.f, water: d?.water || 0, logged: !!d?.entries?.length }
  })
  const L = rows.filter(r => r.logged), avg = key => (L.length ? Math.round(L.reduce((a, r) => a + r[key], 0) / L.length) : 0)
  return { rows, logged: L.length, avg: { k: avg('k'), p: avg('p'), c: avg('c'), f: avg('f'), water: avg('water') } }
}

/** plan = { [weekday 0-6]: [entry without id/time] }. Saves a day's entries as that weekday's plan. */
export function planWith(plan, weekday, entries) {
  const rows = entries.map(({ id, t, ...rest }) => rest)
  const { [weekday]: _, ...others } = plan || {}
  return rows.length ? { ...others, [weekday]: rows } : others
}
/** The entries a weekday's plan adds to a day (fresh ids and time), or [] when there is none. */
export const planEntries = (plan, weekday, mkId, now = Date.now()) => (plan?.[weekday] || []).map(e => ({ ...e, id: mkId(), t: now }))

/** Supplement list: [{ id, name }]. Which are taken today lives in the day: day.supp = [id]. */
export const toggleSupp = (taken, id) => (taken.includes(id) ? taken.filter(x => x !== id) : [...taken, id])
