import { describe, it, expect } from 'vitest'
import extractJsonFromAiResponse from './extract-json-from-ai-response.js'

describe('extractJsonFromAiResponse', () => {
  it('parses JSON inside a markdown code block', () => {
    const str = '```json\n{"a":1}\n```'
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({ a: 1 })
  })

  it('repairs invalid JSON inside a json fence (unescaped quotes in HTML string)', () => {
    const badInner =
      '{"response": "<p>He said ' + '"' + 'hi' + '"' + '</p>", "debug": {"x": 1}}'
    const str = '```json\n' + badInner + '\n```'
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({
      response: '<p>He said "hi"</p>',
      debug: { x: 1 },
    })
  })

  it('repairs invalid JSON with raw newlines inside the response string', () => {
    const badInner = '{"response": "<p>line1\nline2</p>", "debug": {}}'
    const str = '```json\n' + badInner + '\n```'
    const result = extractJsonFromAiResponse(str)
    expect(result).toEqual({
      response: '<p>line1\nline2</p>',
      debug: {},
    })
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

  it('returns null for empty or unparsable json markdown fence body', () => {
    // Empty fenced body: jsonrepair can turn many broken `{...}` snippets into objects, so do not use those to assert null.
    expect(extractJsonFromAiResponse('```json\n\n```')).toBeNull()
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
