import { describe, it, expect } from 'vitest'

import { errorMessageFromUnknown, parseGotHttpErrorBody } from './sync-goodreads-data.js'

describe('sync-goodreads-data error helpers', () => {
  it('errorMessageFromUnknown handles Error, string, JSON, and JSON.stringify failure', () => {
    expect(errorMessageFromUnknown(new Error('e'))).toBe('e')
    expect(errorMessageFromUnknown('str')).toBe('str')
    expect(errorMessageFromUnknown({ a: 1 })).toBe('{"a":1}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessageFromUnknown(circular)).toBe('Unknown error')
  })

  it('parseGotHttpErrorBody returns null for missing body, parses string JSON, returns object body as-is', () => {
    expect(parseGotHttpErrorBody({})).toBeNull()
    expect(parseGotHttpErrorBody({ response: {} })).toBeNull()
    expect(parseGotHttpErrorBody({ response: { body: { x: 1 } } })).toEqual({ x: 1 })
    expect(parseGotHttpErrorBody({ response: { body: 'not json' } })).toBeNull()
    expect(
      parseGotHttpErrorBody({ response: { body: '{"err":true}' } }),
    ).toEqual({ err: true })
  })
})
