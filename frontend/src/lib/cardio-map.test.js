import { describe, it, expect } from 'vitest'
import { mapLayout, TILE_URL } from './cardio-map.js'

const route = [[0, -12.5, -55.7], [60, -12.51, -55.69], [120, -12.52, -55.7]]

describe('mapLayout', () => {
  it('fits the whole route inside the box with its padding', () => {
    const m = mapLayout(route, { width: 640, height: 400, pad: 28 })
    for (const [x, y] of m.line) {
      expect(x).toBeGreaterThanOrEqual(28 - 0.01); expect(x).toBeLessThanOrEqual(640 - 28 + 0.01)
      expect(y).toBeGreaterThanOrEqual(28 - 0.01); expect(y).toBeLessThanOrEqual(400 - 28 + 0.01)
    }
  })
  it('zooms in as far as it can, and out for a long route', () => {
    expect(mapLayout(route).z).toBeGreaterThanOrEqual(13)
    expect(mapLayout([[0, -12, -55], [60, -13, -54]]).z).toBeLessThan(12)
  })
  it('covers the box with tiles named by zoom/x/y', () => {
    const m = mapLayout(route)
    expect(m.tiles.length).toBeGreaterThan(0); expect(m.tiles.length).toBeLessThanOrEqual(9)
    expect(m.tiles[0].url).toMatch(new RegExp(`^https://tile\\.openstreetmap\\.org/${m.z}/\\d+/\\d+\\.png$`))
    // Every pixel of the box is under some tile.
    const xs = m.tiles.map(t => t.x), ys = m.tiles.map(t => t.y)
    expect(Math.min(...xs)).toBeLessThanOrEqual(0); expect(Math.max(...xs) + 256).toBeGreaterThanOrEqual(640)
    expect(Math.min(...ys)).toBeLessThanOrEqual(0); expect(Math.max(...ys) + 256).toBeGreaterThanOrEqual(400)
  })
  it('puts a known place on its known tile', () => {
    // Zoom 0 is one tile for the whole world, repeated sideways to fill a wider box.
    expect(TILE_URL(0, 0, 0)).toBe('https://tile.openstreetmap.org/0/0/0.png')
    const m = mapLayout([[0, 0, 0], [1, 0.0001, 0.0001]], { maxZoom: 0 })
    expect(new Set(m.tiles.map(t => t.url))).toEqual(new Set([TILE_URL(0, 0, 0)]))
  })
  it('needs two points', () => expect(mapLayout([[0, 1, 1]])).toBeNull())
})
