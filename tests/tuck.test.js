import { describe, it, expect } from 'vitest'
import { canTuck, drawingPlan, tuckLine } from '../src/lib/tuck.js'

const shirt = { id: 'shirt', category: 'top', layer: 'base', dollTucked: true }
const jumper = { id: 'jumper', category: 'top', layer: 'mid' }
const jeans = { id: 'jeans', category: 'bottom' }
const boots = { id: 'boots', category: 'shoes' }
const coat = { id: 'coat', category: 'outerwear' }
const dress = { id: 'dress', category: 'dress' }
const order = (plan) => plan.map((p) => p.item.id)

describe('tucking a top in', () => {
  it('only tops can be tucked', () => {
    expect([shirt, jumper, jeans, coat, dress].map(canTuck)).toEqual([true, true, false, false, false])
  })

  it('draws an untucked top over the trousers, as before', () => {
    const plan = drawingPlan([{ ...shirt, dollTucked: false }, jeans, boots])
    expect(order(plan)).toEqual(['boots', 'jeans', 'shirt'])
    expect(plan.every((p) => !p.tuckedInto)).toBe(true)
  })

  it('draws a tucked top under the trousers, cut at their waistband', () => {
    const plan = drawingPlan([shirt, jeans, boots])
    expect(order(plan)).toEqual(['boots', 'shirt', 'jeans'])
    expect(plan.find((p) => p.item.id === 'shirt').tuckedInto).toBe('jeans')
  })

  it('keeps a jumper worn over a tucked shirt on top of everything', () => {
    expect(order(drawingPlan([jumper, shirt, jeans]))).toEqual(['shirt', 'jeans', 'jumper'])
  })

  it('looks normal when there is nothing to tuck into', () => {
    const plan = drawingPlan([shirt, boots])
    expect(order(plan)).toEqual(['boots', 'shirt'])
    expect(plan.every((p) => !p.tuckedInto)).toBe(true)
  })

  it('cuts just inside the waistband of the trousers as drawn', () => {
    // Trousers drawn at y 330–790; their waistband starts 4% down the picture.
    const line = tuckLine({ x: 120, y: 330, width: 160, height: 460 }, { anchor: { y: 0.04 } })
    expect(line).toBeGreaterThan(330 + 0.04 * 460)
    expect(line).toBeLessThan(330 + 0.04 * 460 + 20)
  })
})
