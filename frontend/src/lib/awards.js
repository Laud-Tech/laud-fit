// Medals and level, derived from what is already stored — nothing new is persisted, so the
// medals can never drift from the history (and a deleted workout takes its medal back).
// Ported from GymMane's awards (same 20 medals); "streak" there is days, here a run of
// training days where a rest of up to STREAK_GAP_DAYS between two sessions keeps it alive.
import { workoutVolume, workoutDuration, workoutDay, setsDone } from './history.js'

export const STREAK_GAP_DAYS = 3
const LB_PER_KG = 2.2046226218

// id, icon, counter key, goal. The counter is read from stats() below.
export const AWARDS = [
  ['firstStep', 'flag', 'activity', 1],
  ['firstWorkout', 'dumbbell', 'workouts', 1],
  ['firstRoutine', 'list', 'routines', 1],
  ['firstRecord', 'trophy', 'records', 1],
  ['streak3', 'flame', 'bestStreak', 3],
  ['streak7', 'flame', 'bestStreak', 7],
  ['streak30', 'flame', 'bestStreak', 30],
  ['streak100', 'flame', 'bestStreak', 100],
  ['workouts10', 'medal', 'workouts', 10],
  ['workouts50', 'medal', 'workouts', 50],
  ['workouts100', 'medal', 'workouts', 100],
  ['workouts365', 'medal', 'workouts', 365],
  ['tonne1', 'dumbbell', 'tonnes', 1],
  ['tonne10', 'dumbbell', 'tonnes', 10],
  ['tonne100', 'dumbbell', 'tonnes', 100],
  ['sets100', 'check', 'sets', 100],
  ['sets1000', 'check', 'sets', 1000],
  ['hours10', 'clock', 'hours', 10],
  ['hours50', 'clock', 'hours', 50],
  ['hours100', 'clock', 'hours', 100],
].map(([id, icon, key, goal]) => ({ id, icon, key, goal }))

const dayNum = iso => Math.round(Date.parse(iso + 'T12:00:00Z') / 86400000)

/** Longest run of training days in which no two neighbouring sessions are more than
 *  STREAK_GAP_DAYS apart; the run counts the days trained. */
export function bestStreak(days) {
  const ds = [...new Set(days)].map(dayNum).sort((a, b) => a - b)
  let best = 0, run = 0
  ds.forEach((d, i) => {
    run = i && d - ds[i - 1] <= STREAK_GAP_DAYS ? run + 1 : 1
    if (run > best) best = run
  })
  return best
}

export function stats(S, extra = {}) {
  const ws = (S.workouts || []).filter(w => w && Array.isArray(w.entries))
  const kg = S.unit === 'lb' ? 1 / LB_PER_KG : 1
  const days = ws.map(workoutDay).filter(Boolean)
  const cardio = extra.cardio || 0
  return {
    activity: ws.length + cardio + (S.bodyweight || []).length,
    workouts: ws.length,
    routines: (S.routines || []).length,
    records: ws.reduce((n, w) => n + (Array.isArray(w.prs) ? w.prs.length : 0), 0),
    bestStreak: bestStreak(days),
    tonnes: ws.reduce((n, w) => n + workoutVolume(w), 0) * kg / 1000,
    sets: ws.reduce((n, w) => n + setsDone(w), 0),
    hours: ws.reduce((n, w) => n + workoutDuration(w), 0) / 3600000,
  }
}

export const XP = { workout: 100, set: 5, record: 50, medal: 200 }
export const levelOf = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1
export const levelStart = lvl => (lvl - 1) ** 2 * 100

/** { list: [{id, icon, goal, value, done, pct}], xp, level, into, span } */
export function awards(S, extra) {
  const st = stats(S, extra)
  const list = AWARDS.map(a => {
    const value = st[a.key]
    return { ...a, value, done: value >= a.goal, pct: Math.min(1, value / a.goal) }
  })
  const xp = Math.round(st.workouts * XP.workout + st.sets * XP.set + st.records * XP.record
    + list.filter(a => a.done).length * XP.medal)
  const level = levelOf(xp), from = levelStart(level)
  return { list, st, xp, level, into: xp - from, span: levelStart(level + 1) - from }
}
