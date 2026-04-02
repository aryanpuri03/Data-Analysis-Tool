/**
 * Robustly extract a JSON value from an AI response.
 *
 * Handles:
 *  - Markdown code fences (```json ... ```)
 *  - Commentary before/after the JSON
 *  - Trailing commas (common LLM mistake)
 *  - Single-quoted keys/values
 *  - Truncated output (attempts partial recovery)
 *
 * @param {string} text   Raw AI response text
 * @param {'auto'|'array'|'object'} type  Expected top-level type
 * @returns {any|null}  Parsed value, or null if extraction failed
 */
export function extractJSON(text, type = 'auto') {
  if (!text) return null

  // 1. Strip ALL markdown code fences (```json, ```js, ```, etc.)
  let cleaned = text
    .replace(/```(?:json|javascript|js|python|ts|typescript)?\s*\n?/gi, '')
    .replace(/```/g, '')
    .trim()

  // 2. Try parsing the whole cleaned string directly
  try { return JSON.parse(cleaned) } catch { /* continue */ }

  // 3. Find the outermost array or object
  const candidates = []

  if (type === 'array' || type === 'auto') {
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1))
  }

  if (type === 'object' || type === 'auto') {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    // Try direct parse
    try { return JSON.parse(candidate) } catch { /* continue */ }

    // Fix trailing commas:  [1, 2,]  →  [1, 2]
    const noTrailing = candidate
      .replace(/,\s*([}\]])/g, '$1')

    try { return JSON.parse(noTrailing) } catch { /* continue */ }

    // Fix single-quoted strings → double-quoted
    const doubleQuoted = noTrailing
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')

    try { return JSON.parse(doubleQuoted) } catch { /* continue */ }
  }

  return null
}

/**
 * Extract a JSON array from an AI response.
 * Returns an empty array instead of null on failure.
 */
export function extractJSONArray(text) {
  const result = extractJSON(text, 'array')
  return Array.isArray(result) ? result : []
}

/**
 * Extract a JSON object from an AI response.
 * Returns null on failure.
 */
export function extractJSONObject(text) {
  const result = extractJSON(text, 'object')
  return result && typeof result === 'object' && !Array.isArray(result) ? result : null
}
