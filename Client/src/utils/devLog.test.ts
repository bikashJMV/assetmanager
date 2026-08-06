/**
 * GitHub #44 — [C-05] Sensitive token data logged to browser console in production.
 *
 * Two layers of cover:
 *   1. devLog/devWarn are stripped outside development; errorLog and describeError never
 *      surface an object that could carry token material.
 *   2. A source guard over the auth files, so a future edit cannot reintroduce a raw
 *      `console.log(data)` on the auth path without failing the suite.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { describeError, devLog, devWarn, errorLog } from './devLog'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')

const AUTH_FILES = [
  'utils/authNexus.api.ts',
  'utils/authService.ts',
  'components/pages/AuthCallback.tsx',
]

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('devLog helpers', () => {
  it('devLog is silent unless the build is development', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    devLog('trace')
    // import.meta.env.DEV is true under vitest, so the call passes through.
    expect(spy).toHaveBeenCalledTimes(import.meta.env.DEV ? 1 : 0)
  })

  it('devWarn routes through console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    devWarn('careful')
    expect(spy).toHaveBeenCalledTimes(import.meta.env.DEV ? 1 : 0)
  })

  it('errorLog emits the message and an optional scalar only', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    errorLog('refresh failed', 401)
    expect(spy).toHaveBeenCalledWith('refresh failed', 401)

    errorLog('no detail')
    expect(spy).toHaveBeenLastCalledWith('no detail')
  })

  it('describeError never returns the original object', () => {
    const leaky = { access_token: 'super-secret', refresh_token: 'also-secret' }
    const described = describeError(leaky)

    expect(typeof described).toBe('string')
    expect(described).toBe('unknown error')
    expect(described).not.toContain('super-secret')
  })

  it('describeError keeps Error messages and plain strings', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError('plain')).toBe('plain')
  })
})

describe('auth source guard (#44)', () => {
  it.each(AUTH_FILES)('%s has no ungated console.log / console.debug', (rel) => {
    const offenders = read(rel)
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /^\s*console\.(log|debug)\(/.test(line))

    expect(offenders, `ungated console.log/debug in ${rel}`).toEqual([])
  })

  it.each(AUTH_FILES)('%s never logs a token-bearing object', (rel) => {
    // Catches `console.error('...', data)` / `err` / `user` / `body` — the exact shape that
    // leaked in the original report (authNexus.api.ts:72 logged the full response object).
    const banned = /console\.\w+\([^)]*,\s*(data|body|err|error|user|response|config|headers)\s*\)/
    const offenders = read(rel)
      .split('\n')
      .filter((line) => banned.test(line))

    expect(offenders, `raw object passed to console in ${rel}`).toEqual([])
  })
})
