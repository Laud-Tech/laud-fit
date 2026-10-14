import { describe, it, expect } from 'vitest'
import {
  haversine, filterTrack, elevationGain, trackStats, splits, bestEffort, decimate,
  metFor, caloriesFor, fmtPace, fmtDuration, fmtDistance, toGpx
} from './cardio.js'

// A straight run due north at `mps` m/s, a fix every second. 1 degree of latitude = 111,195 m.
const M = 1 / 111195
const line = (secs, mps, extra = () => [null, null]) =>
  Array.from({ length: secs + 1 }, (_, t) => [t, -12 + t * mps * M, -55, ...extra(t)])

describe('haversine', () => {
  it('measures a known distance', () => {
    expect(haversine([0, 0, 0], [0, 1, 0])).toBeGreaterThan(111000)
    expect(haversine([0, 0, 0], [0, 1, 0])).toBeLessThan(111400)
    expect(haversine([0, -12, -55], [0, -12, -55])).toBe(0)
  })
})

describe('filterTrack', () => {
  it('drops poor fixes, standing jitter and teleports', () => {
    const p = [[0, -12, -55, null, 5], [1, -12.00001, -55, null, 80], [2, -12.00001, -55, null, 5], [3, -12.001, -55, null, 5], [4, 0, 0, null, 5]]
    const out = filterTrack(p)
    expect(out.map(x => x[0])).toEqual([0, 3])  // t1 poor accuracy, t2 only ~1 m, t4 a jump of thousands of km
  })
})

describe('trackStats', () => {
  it('counts distance and moving time, not the stop', () => {
    const run = line(100, 3)
    const stop = Array.from({ length: 20 }, (_, i) => [101 + i, run[100][1], -55, null, null])
    const s = trackStats([...run, ...stop])
    expect(s.distance_m).toBeGreaterThan(295); expect(s.distance_m).toBeLessThan(305)
    expect(s.moving_s).toBe(100); expect(s.duration_s).toBe(120)
  })
})

describe('elevationGain', () => {
  it('ignores wobble under the threshold', () => {
    expect(elevationGain([[0, 0, 0, 100], [1, 0, 0, 101], [2, 0, 0, 100], [3, 0, 0, 102]])).toBe(0)
    expect(elevationGain([[0, 0, 0, 100], [1, 0, 0, 110], [2, 0, 0, 105], [3, 0, 0, 120]])).toBe(25)
  })
  it('is 0 without altitude', () => expect(elevationGain(line(10, 3))).toBe(0))
})

describe('splits and best effort', () => {
  const p = line(1500, 4)   // 6 km at 4 m/s: 250 s per km
  it('cuts full kilometres with the right time each', () => {
    const s = splits(p)
    expect(s).toHaveLength(6)
    s.forEach(x => expect(Math.abs(x.s - 250)).toBeLessThanOrEqual(1))
  })
  it('adds a partial last split', () => {
    const s = splits(line(1000, 4))   // 4 km
    expect(s.filter(x => x.partial)).toHaveLength(0)
    const t = splits(line(1100, 4))   // 4.4 km
    expect(t[4].partial).toBe(true); expect(t[4].distance_m).toBeGreaterThan(390)
  })
  it('finds the fastest stretch, speeding up in the middle', () => {
    const fast = [...line(400, 3), ...line(300, 5).map(x => [x[0] + 400, x[1] + 400 * 3 * M, x[2], null, null])]
    expect(bestEffort(fast, 1000)).toBeLessThanOrEqual(201)
    expect(bestEffort(line(100, 3), 1000)).toBeNull()
  })
})

describe('decimate', () => {
  it('keeps first and last', () => {
    const p = line(9999, 1), d = decimate(p, 100)
    expect(d).toHaveLength(100); expect(d[0]).toBe(p[0]); expect(d[99]).toBe(p[9999])
    expect(decimate(p.slice(0, 5), 100)).toHaveLength(5)
  })
})

describe('calories', () => {
  it('uses MET x kg x hours with a speed-based MET', () => {
    // 10 km/h run for 30 min, 70 kg: MET 11 -> 385 kcal
    expect(caloriesFor('run', 70, 1800, 5000)).toBe(385)
    expect(metFor('walk', 5)).toBe(4.3)
    expect(metFor('treadmill_walk', 5)).toBe(metFor('walk', 5))   // same effort indoors
    expect(metFor('cycling', 30)).toBe(12)
    expect(metFor('swim')).toBe(7)
  })
  it('needs a weight and a time', () => {
    expect(caloriesFor('run', 0, 1800, 5000)).toBeNull()
    expect(caloriesFor('stairs', 80, 0, 0)).toBeNull()
  })
  it('falls back to a typical MET without distance (stationary bike, manual entry)', () => {
    expect(caloriesFor('stationary_bike', 70, 3600, null)).toBe(490)
  })
})

describe('formatting', () => {
  it('pace, duration, distance', () => {
    expect(fmtPace(305)).toBe('5:05'); expect(fmtPace(0)).toBe('–'); expect(fmtPace(NaN)).toBe('–')
    expect(fmtDuration(125)).toBe('2:05'); expect(fmtDuration(3725)).toBe('1:02:05')
    expect(fmtDistance(850)).toBe('850 m'); expect(fmtDistance(5200)).toBe('5.20 km')
  })
})

describe('toGpx', () => {
  it('writes a track, escaping the note', () => {
    const g = toGpx({ started: Date.UTC(2026, 9, 1, 10), activity: 'run', note: 'A & B <1>' }, [[0, -12.5, -55.7, 380], [60, -12.51, -55.7, null]])
    expect(g).toContain('<trkpt lat="-12.5" lon="-55.7"><ele>380</ele><time>2026-10-01T10:00:00.000Z</time>')
    expect(g).toContain('A &amp; B &lt;1&gt;')
    expect(g).toContain('2026-10-01T10:01:00.000Z')
  })
  it('is null without a route', () => expect(toGpx({ started: 1, activity: 'run' }, [[0, 1, 1]])).toBeNull())
})

import { fmtDist, fmtPaceU, fmtSpeedU, splitSize, toKm } from './cardio.js'
describe('miles', () => {
  it('km mode is unchanged', () => {
    expect(fmtDist(5200, false)).toBe('5.20 km')
    expect(fmtPaceU(330, false)).toBe('5:30 /km')
    expect(fmtSpeedU(10, false)).toBe('10.0 km/h')
    expect(splitSize(false)).toBe(1000)
  })
  it('imperial display', () => {
    expect(fmtDist(1609.344, true)).toBe('1.00 mi')
    expect(fmtPaceU(330, true)).toBe('8:51 /mi')
    expect(fmtSpeedU(16.09344, true)).toBe('10.0 mph')
    expect(toKm(1, true)).toBeCloseTo(1.609344, 6)
    expect(toKm(5, false)).toBe(5)
  })
})
