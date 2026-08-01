import { describe, expect, it } from 'vitest'
import { ELLIPSIS, LOADING } from './loading'

const entries = Object.entries(LOADING)

describe('LOADING constants', () => {
  it('exposes at least one message', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('never uses an ASCII ellipsis', () => {
    const offenders = entries.filter(([, value]) => value.includes('...'))
    expect(offenders).toEqual([])
  })

  it('uses the Unicode ellipsis where a message trails off', () => {
    expect(ELLIPSIS).toBe('…')
    const trailing = entries.filter(([, value]) => value.includes(ELLIPSIS))
    expect(trailing.length).toBeGreaterThan(0)
  })

  it('starts every message with a capital letter and has no leading/trailing space', () => {
    for (const [key, value] of entries) {
      expect(value, key).toBe(value.trim())
      expect(value[0], key).toBe(value[0].toUpperCase())
    }
  })

  it('has no duplicate messages', () => {
    const values = entries.map(([, value]) => value)
    expect(new Set(values).size).toBe(values.length)
  })
})
