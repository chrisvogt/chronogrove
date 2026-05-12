import { describe, it, expect } from 'vitest'
import { simplifyTitleForGoogleBooksQuery } from './simplify-title-for-google-books-query.js'

describe('simplifyTitleForGoogleBooksQuery', () => {
  it('removes trailing Goodreads-style series parenthetical and volume tag', () => {
    expect(
      simplifyTitleForGoogleBooksQuery(
        'The Secret Commonwealth (The Book of Dust, #2)',
      ),
    ).toBe('The Secret Commonwealth')
  })

  it('removes nested-style trailing segment only', () => {
    expect(simplifyTitleForGoogleBooksQuery('Smile (graphic novel)')).toBe('Smile')
  })

  it('strips trailing #n outside parentheses', () => {
    expect(simplifyTitleForGoogleBooksQuery('Some Title #3')).toBe('Some Title')
  })

  it('truncates extremely long titles to avoid oversized q= parameters', () => {
    const long = `${'a'.repeat(250)}`
    expect(simplifyTitleForGoogleBooksQuery(long).length).toBe(200)
  })

  it('normalizes whitespace and leaves simple titles unchanged', () => {
    expect(simplifyTitleForGoogleBooksQuery('  The Great Gatsby  ')).toBe('The Great Gatsby')
  })
})
