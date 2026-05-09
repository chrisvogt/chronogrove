import { describe, it, expect } from 'vitest'
import extractJsonFromAiResponse from './extract-json-from-ai-response.js'

describe('extractJsonFromAiResponse', () => {
  it('parses JSON inside a markdown code block', () => {
    const str = '```json\n{"a":1}\n```'
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({ a: 1 })
  })

  it('parses nested objects inside a markdown json fence (regression: non-greedy inner `{` capture)', () => {
    const str = `\`\`\`json
{"response": "<p>x</p>", "debug": {"recentlyPlayedGames": [], "topPlayedGames": []}}
\`\`\``
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({
      response: '<p>x</p>',
      debug: { recentlyPlayedGames: [], topPlayedGames: [] },
    })
  })

  it('parses JSON after a short preamble', () => {
    const str = 'Here you go:\n{"ok": true}\nThanks!'
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({ ok: true })
  })

  it('parses raw JSON object string', () => {
    const str = '{"b": "hello"}'
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({ b: 'hello' })
  })

  it('returns null for invalid markdown JSON', () => {
    const str = '```json\n{ broken }\n```'
    const result = extractJsonFromAiResponse(str)
    expect(result).toBeNull()
  })

  it('returns null for primitives and non-objects', () => {
    expect(extractJsonFromAiResponse('123')).toBeNull()
    expect(extractJsonFromAiResponse('Just plain text')).toBeNull()
  })

  it('returns null for empty or whitespace', () => {
    expect(extractJsonFromAiResponse('')).toBeNull()
    expect(extractJsonFromAiResponse('   ')).toBeNull()
    expect(extractJsonFromAiResponse('not json')).toBeNull()
  })
})
