import { describe, it, expect } from 'vitest'

import { errorMessageFromUnknown, getIsbnFromGoodreadsBookFields, parseGotHttpErrorBody } from './sync-goodreads-data.js'

describe('sync-goodreads-data error helpers', () => {
  it('errorMessageFromUnknown handles Error, string, JSON, and JSON.stringify failure', () => {
    expect(errorMessageFromUnknown(new Error('e'))).toBe('e')
    expect(errorMessageFromUnknown('str')).toBe('str')
    expect(errorMessageFromUnknown({ a: 1 })).toBe('{"a":1}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessageFromUnknown(circular)).toBe('Unknown error')
  })

  it('getIsbnFromGoodreadsBookFields returns null when book is undefined', () => {
    expect(getIsbnFromGoodreadsBookFields(undefined)).toBeNull()
  })

  it('getIsbnFromGoodreadsBookFields reads ISBN_13 / ISBN from Goodreads XML shapes', () => {
    expect(
      getIsbnFromGoodreadsBookFields({
        isbn13: '9780000000000',
        title: 'T',
      } as never),
    ).toBe('9780000000000')
    expect(getIsbnFromGoodreadsBookFields({ isbn: '0140000000', title: 'T' } as never)).toBe('0140000000')
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
