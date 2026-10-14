import { describe, it, expect } from 'vitest'
import { bmiBand, waterMl, bodyFatNavy, healthyRange, percentOf } from './tools.js'

describe('tools', () => {
  it('bmi bands', () => { expect([17, 22, 27, 33].map(bmiBand)).toEqual(['under', 'normal', 'over', 'obese']) })
  it('water', () => { expect(waterMl(70)).toBe(2450); expect(waterMl(70, 1)).toBe(2950) })
  it('navy body fat, man 180cm neck 38 waist 90', () => { expect(bodyFatNavy({ sex: 'male', cm: 180, neck: 38, waist: 90 })).toBeCloseTo(19.8, 0) })
  it('navy needs hip for women and sane numbers', () => {
    expect(bodyFatNavy({ sex: 'female', cm: 165, neck: 32, waist: 75 })).toBeNull()
    expect(bodyFatNavy({ sex: 'male', cm: 180, neck: 95, waist: 90 })).toBeNull()
  })
  it('healthy range', () => { expect(healthyRange(170)).toEqual([53.5, 72]) })
  it('percentOf rounds to the plate step', () => { expect(percentOf(100, 85)).toBe(85); expect(percentOf(103, 70)).toBe(72.5) })
})
