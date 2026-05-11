import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('xml2js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xml2js')>()
  return {
    ...actual,
    parseString: vi.fn(actual.parseString) as typeof actual.parseString,
  }
})

vi.mock('../../config/goodreads-config.js', () => ({
  GOODREADS_AI_READ_SHELF_PER_PAGE: 2,
  GOODREADS_AI_READ_SHELF_MAX_PAGES: 10,
}))

vi.mock('got', () => ({
  default: vi.fn(),
}))

vi.mock('../../config/backend-config.js', () => ({
  getGoodreadsConfig: vi.fn(() => ({
    apiKey: 'test-key',
    userId: 'user-42',
  })),
}))

import { parseString as parseStringMock } from 'xml2js'
import fetchFullReadShelfForAi from './fetch-full-read-shelf-for-ai.js'

import got from 'got'

describe('fetchFullReadShelfForAi', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('paginates until a short page and merges entries', async () => {
    const page1 = `<GoodreadsResponse><reviews start="1" end="2" total="3">
      <review>
        <read_at>2023-06-01</read_at><rating>5</rating>
        <book><title>Book One</title><isbn13>9781111111111</isbn13>
          <authors><author><name>Author A</name></author></authors>
        </book>
      </review>
      <review>
        <read_at>2023-05-01</read_at><rating>4</rating>
        <book><title>Book Two</title><isbn13>9782222222222</isbn13>
          <authors><author><name>Author B</name></author><author><name>Author C</name></author></authors>
        </book>
      </review>
    </reviews></GoodreadsResponse>`

    const page2 = `<GoodreadsResponse><reviews>
      <review>
        <read_at></read_at><date_added>2022-01-01</date_added><rating>3</rating>
        <book><title>No ISBN Book</title>
          <authors><author><name>Solo</name></author></authors>
        </book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got)
      .mockResolvedValueOnce({ body: page1 } as never)
      .mockResolvedValueOnce({ body: page2 } as never)

    const entries = await fetchFullReadShelfForAi()

    expect(got).toHaveBeenCalledTimes(2)
    expect(got.mock.calls[0][0]).toContain('user-42.xml')
    expect(got.mock.calls[0][0]).toContain('page=1')
    expect(got.mock.calls[1][0]).toContain('page=2')

    expect(entries).toEqual([
      {
        title: 'Book One',
        authors: ['Author A'],
        isbn: '9781111111111',
        rating: '5',
        finishedOrAddedDate: '2023-06-01',
      },
      {
        title: 'Book Two',
        authors: ['Author B', 'Author C'],
        isbn: '9782222222222',
        rating: '4',
        finishedOrAddedDate: '2023-05-01',
      },
      {
        title: 'No ISBN Book',
        authors: ['Solo'],
        isbn: null,
        rating: '3',
        finishedOrAddedDate: '2022-01-01',
      },
    ])
  })

  it('stops on empty page', async () => {
    vi.mocked(got).mockResolvedValueOnce({
      body: '<GoodreadsResponse><reviews></reviews></GoodreadsResponse>',
    } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries).toEqual([])
    expect(got).toHaveBeenCalledTimes(1)
  })

  it('rejects when XML parse fails', async () => {
    vi.mocked(parseStringMock).mockImplementationOnce((body, cb) => {
      cb(new Error('invalid xml'), undefined)
    })

    vi.mocked(got).mockResolvedValueOnce({ body: '<not-valid' } as never)

    await expect(fetchFullReadShelfForAi()).rejects.toThrow('invalid xml')
  })

  it('wraps non-Error parse failures as Error', async () => {
    vi.mocked(parseStringMock).mockImplementationOnce((body, cb) => {
      cb('not an Error instance', undefined)
    })

    vi.mocked(got).mockResolvedValueOnce({ body: '<x/>' } as never)

    await expect(fetchFullReadShelfForAi()).rejects.toThrow('not an Error instance')
  })

  it('drops reviews with no identifiable book and uses date_added when read_at is too short', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>n/a</read_at><date_added>2019-07-04</date_added><rating>5</rating>
        <book><title>Short Read Date</title><isbn13>9783333333333</isbn13></book>
      </review>
      <review><read_at>2020-01-01</read_at><rating>1</rating></review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries).toEqual([
      {
        authors: [],
        finishedOrAddedDate: '2019-07-04',
        isbn: '9783333333333',
        rating: '5',
        title: 'Short Read Date',
      },
    ])
  })

  it('returns no author names when the authors node has no author entries', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>2022-02-02</read_at><rating>3</rating>
        <book><title>Lonely Shelf</title><isbn13>9785555555555</isbn13><authors></authors></book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries[0].authors).toEqual([])
  })

  it('skips books that have neither title nor ISBN in the XML', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>2020-01-01</read_at><rating>2</rating>
        <book><authors><author><name>Ghost</name></author></authors></book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries).toEqual([])
  })

  it('uses null rating when the review has no rating element', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>2019-09-09</read_at>
        <book><title>Unrated</title><isbn13>9781212121212</isbn13></book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries[0].rating).toBeNull()
  })

  it('uses ISBN-10 when ISBN-13 is absent', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>2020-03-03</read_at><rating>4</rating>
        <book><title>Paperback</title><isbn>0451526538</isbn></book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries[0]).toMatchObject({
      title: 'Paperback',
      isbn: '0451526538',
    })
  })

  it('leaves finishedOrAddedDate null when read and added dates are too short', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>n/a</read_at><date_added>no</date_added><rating>3</rating>
        <book><title>Fuzzy Dates</title><isbn13>9787777777777</isbn13></book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries[0].finishedOrAddedDate).toBeNull()
  })

  it('handles malformed authors and odd author nodes from xml2js', async () => {
    vi.mocked(parseStringMock).mockImplementationOnce((body, cb) => {
      cb(null, {
        GoodreadsResponse: {
          reviews: [
            {
              review: [
                {
                  read_at: ['2020-04-04'],
                  rating: ['5'],
                  book: [
                    {
                      title: ['Odd Authors'],
                      isbn13: ['9788888888888'],
                      authors: 'not-an-array',
                    },
                  ],
                },
                {
                  read_at: ['2020-05-05'],
                  rating: ['4'],
                  book: [
                    {
                      title: ['Mixed Author Nodes'],
                      isbn13: ['9789999999999'],
                      authors: [
                        {
                          author: [null, 'skip-me', { name: [''] }, { name: ['Kept Name'] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      } as never)
    })

    vi.mocked(got)
      .mockResolvedValueOnce({ body: '<first/>' } as never)
      .mockResolvedValueOnce({
        body: '<GoodreadsResponse><reviews></reviews></GoodreadsResponse>',
      } as never)

    const entries = await fetchFullReadShelfForAi()

    expect(entries).toEqual([
      {
        title: 'Odd Authors',
        authors: [],
        finishedOrAddedDate: '2020-04-04',
        isbn: '9788888888888',
        rating: '5',
      },
      {
        title: 'Mixed Author Nodes',
        authors: ['Kept Name'],
        finishedOrAddedDate: '2020-05-05',
        isbn: '9789999999999',
        rating: '4',
      },
    ])
  })

  it('treats a single review object as an empty page', async () => {
    vi.mocked(parseStringMock).mockImplementationOnce((body, cb) => {
      cb(null, {
        GoodreadsResponse: {
          reviews: [
            {
              review: {
                read_at: ['2020-06-06'],
                rating: ['5'],
                book: [{ title: ['Lonely'], isbn13: ['9781010101010'] }],
              },
            },
          ],
        },
      } as never)
    })

    vi.mocked(got).mockResolvedValueOnce({ body: '<x/>' } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries).toEqual([])
  })

  it('returns empty author list when the authors wrapper omits author entries', async () => {
    vi.mocked(parseStringMock).mockImplementationOnce((body, cb) => {
      cb(null, {
        GoodreadsResponse: {
          reviews: [
            {
              review: [
                {
                  read_at: ['2018-03-03'],
                  rating: ['5'],
                  book: [
                    {
                      title: ['Wrapped Authors'],
                      isbn13: ['9786666666666'],
                      authors: [{}],
                    },
                  ],
                },
              ],
            },
          ],
        },
      } as never)
    })

    vi.mocked(got).mockResolvedValueOnce({ body: '<ignored/>' } as never)

    const entries = await fetchFullReadShelfForAi()

    expect(entries).toEqual([
      {
        title: 'Wrapped Authors',
        authors: [],
        finishedOrAddedDate: '2018-03-03',
        isbn: '9786666666666',
        rating: '5',
      },
    ])
  })

  it('includes ISBN-only rows and single-author shapes from xml2js', async () => {
    const body = `<GoodreadsResponse><reviews>
      <review><read_at>2021-01-01</read_at><rating>4</rating>
        <book><isbn13>9784444444444</isbn13>
          <authors><author><name>Only Author</name></author></authors>
        </book>
      </review>
    </reviews></GoodreadsResponse>`

    vi.mocked(got).mockResolvedValueOnce({ body } as never)

    const entries = await fetchFullReadShelfForAi()
    expect(entries).toEqual([
      {
        authors: ['Only Author'],
        finishedOrAddedDate: '2021-01-01',
        isbn: '9784444444444',
        rating: '4',
      },
    ])
  })
})
