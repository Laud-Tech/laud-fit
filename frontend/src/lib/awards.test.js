import { describe, it, expect } from 'vitest'
import { awards, bestStreak, levelOf, levelStart } from './awards.js'

const w = (d, kgs = 100, reps = 10) => ({ d, start: 0, end: 3600000, prs: [], entries: [{ sets: [{ done: true, w: kgs, r: reps }] }] })

describe('awards', () => {
  it('bestStreak lets short rests keep the run alive', () => {
    expect(bestStreak(['2026-01-01', '2026-01-03', '2026-01-06', '2026-01-20'])).toBe(3)
    expect(bestStreak([])).toBe(0)
  })
  it('empty profile has nothing', () => {
    const a = awards({ workouts: [], routines: [], bodyweight: [] })
    expect(a.list.filter(x => x.done)).toHaveLength(0)
    expect(a.level).toBe(1)
  })
  it('counts workouts, sets, hours and a first record', () => {
    const S = { workouts: [{ ...w('2026-01-01'), prs: [{}] }, w('2026-01-02')], routines: [{}], bodyweight: [] }
    const done = awards(S).list.filter(x => x.done).map(x => x.id)
    expect(done).toEqual(expect.arrayContaining(['firstStep', 'firstWorkout', 'firstRoutine', 'firstRecord']))
    expect(done).not.toContain('workouts10')
  })
  it('converts lb volume to tonnes', () => {
    const S = { unit: 'lb', workouts: [w('2026-01-01', 2204.6226, 10)], routines: [], bodyweight: [] }
    expect(awards(S).st.tonnes).toBeCloseTo(10, 0)
  })
  it('levels grow with xp', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(levelStart(5))).toBe(5)
  })
})
