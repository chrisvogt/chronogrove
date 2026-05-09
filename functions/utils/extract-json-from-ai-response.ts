type JsonObject = Record<string, unknown>

const tryParseJsonObject = <T extends JsonObject>(raw: string): T | null => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown
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
 * Parse JSON from an LLM text response (markdown ```json ... ```, generic fenced block,
 * raw JSON, or a `{...}` substring when the model adds a short preamble).
 */
const extractJsonFromAiResponse = <T extends JsonObject = JsonObject>(
  str: string
): T | null => {
  if (typeof str !== 'string' || !str.trim()) {
    return null
  }

  // 1. Markdown fenced blocks — parse the full fence body (nested `{`/`}` safe)
  const fencePatterns = [/```json\s*([\s\S]*?)```/i, /```\s*([\s\S]*?)```/]
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
