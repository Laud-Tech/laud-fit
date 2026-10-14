import { describe, it, expect } from 'vitest'
import { squareCrop } from './food-photo.js'

describe('squareCrop', () => {
  it('takes the centre square of a landscape and of a portrait picture', () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, s: 200 })
    expect(squareCrop(200, 600)).toEqual({ sx: 0, sy: 200, s: 200 })
    expect(squareCrop(100, 100)).toEqual({ sx: 0, sy: 0, s: 100 })
  })
})
