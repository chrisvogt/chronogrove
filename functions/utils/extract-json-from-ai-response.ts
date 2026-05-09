type JsonObject = Record<string, unknown>

/**
 * Parse JSON from an LLM text response (markdown ```json ... ``` or raw JSON).
 */
const extractJsonFromAiResponse = <T extends JsonObject = JsonObject>(
  str: string
): T | null => {
  if (typeof str !== 'string' || !str.trim()) {
    return null
  }

  // 1. Try markdown code block
  const markdownMatch = str.match(/```json\s*({[\s\S]*?})\s*```/)
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]) as T
    } catch {
      return null
    }
  }

  // 2. Try parsing the whole string as JSON
  try {
    const parsed = JSON.parse(str) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}

export default extractJsonFromAiResponse
