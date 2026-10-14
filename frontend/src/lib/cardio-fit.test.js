import { describe, it, expect } from 'vitest'
import { cardioFit, sportOf } from './cardio-fit.js'
import { fitCrc } from './fit-export.js'

const s = { id: 'abcdefgh', activity: 'run', started: Date.UTC(2026, 9, 14, 10), duration_s: 600, moving_s: 590, distance_m: 1500, calories: 120, elev_gain_m: 5 }
// Sorriso-MT is south and west of the origin: both coordinates are negative.
const pts = [[0, -12.55, -55.71, 360, 5], [30, -12.5495, -55.7105, 361, 5], [60, -12.549, -55.711, null, 5]]

describe('cardio fit', () => {
  it('writes a valid file: header, length and both CRCs', () => {
    const f = cardioFit(s, pts)
    expect(String.fromCharCode(...f.slice(8, 12))).toBe('.FIT')
    const dv = new DataView(f.buffer)
    expect(14 + dv.getUint32(4, true) + 2).toBe(f.length)
    expect(dv.getUint16(12, true)).toBe(fitCrc(f.subarray(0, 12)))
    expect(dv.getUint16(f.length - 2, true)).toBe(fitCrc(f.subarray(0, f.length - 2)))
  })
  it('keeps negative coordinates (two\'s complement semicircles)', () => {
    const f = cardioFit(s, pts)
    const lat = Math.round(-12.55 * 2 ** 31 / 180) >>> 0
    const bytes = [lat & 255, (lat >>> 8) & 255, (lat >>> 16) & 255, lat >>> 24]
    const hay = [...f].join(',')
    expect(hay.includes(bytes.join(','))).toBe(true)
  })
  it('works without a route (treadmill)', () => {
    expect(cardioFit({ ...s, activity: 'treadmill_run' }, []).length).toBeGreaterThan(60)
    expect(sportOf('treadmill_run')).toEqual([1, 1])
    expect(sportOf('jump_rope')).toEqual([0, 0])
  })
})
