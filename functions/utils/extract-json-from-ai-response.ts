import { jsonrepair } from 'jsonrepair'

type JsonObject = Record<string, unknown>

const parseJsonObject = <T extends JsonObject>(text: string): T | null => {
  try {
    const parsed = JSON.parse(text) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return parsed as T
    }
    return null
  } catch {
    return null
  }
}

/**
 * Strict parse, then `jsonrepair` + parse (handles common LLM JSON defects:
 * unescaped `"` inside HTML string values, raw newlines inside strings, trailing commas, etc.).
 */
const tryParseJsonObject = <T extends JsonObject = JsonObject>(raw: string): T | null => {
  const trimmed = raw.trim()

  const direct = parseJsonObject<T>(trimmed)
  if (direct) {
    return direct
  }

  try {
    const repaired = jsonrepair(trimmed)
    return parseJsonObject<T>(repaired)
  } catch {
    return null
  }
}

/**
 * Parse JSON from an LLM text response (markdown ```json ... ```, generic fenced block,
 * raw JSON, or a `{...}` substring when the model adds a short preamble).
 * After strict `JSON.parse`, runs **`jsonrepair`** once for common LLM mistakes (unescaped
 * quotes in HTML strings, raw newlines inside strings, trailing commas).
 */
const extractJsonFromAiResponse = <T extends JsonObject = JsonObject>(
  str: string
): T | null => {
  if (typeof str !== 'string' || !str.trim()) {
    return null
  }

  // 1. Markdown fenced blocks — greedy ```json body so an early ``` inside invalid JSON
  //    does not truncate the capture before jsonrepair can fix the payload.
  const fencePatterns = [/```json\s*([\s\S]*)```/i, /```\s*([\s\S]*?)```/]
  for (const re of fencePatterns) {
    const m = str.match(re)
    if (m?.[1]) {
      const parsed = tryParseJsonObject<T>(m[1])
      if (parsed) {
        return parsed
      }
    }
  }

  // 2. Whole string is JSON
  const whole = tryParseJsonObject<T>(str)
  if (whole) {
    return whole
  }

  // 3. Preamble + JSON object (e.g. "Here is the summary:\n{...}")
  const start = str.indexOf('{')
  const end = str.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const parsed = tryParseJsonObject<T>(str.slice(start, end + 1))
    if (parsed) {
      return parsed
    }
  }

  return null
}

export default extractJsonFromAiResponse
