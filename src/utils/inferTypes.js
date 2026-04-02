/**
 * inferColumnTypes(dataset)
 *
 * Takes an array of row objects and returns an object mapping
 * each column name to one of: 'numeric', 'date', 'categorical', 'freetext'.
 *
 * Heuristics (evaluated on non-null values):
 *   1. numeric  — >80% of values parse as finite numbers
 *   2. date     — >80% of values match common date patterns or parse via Date
 *   3. categorical — ≤20 unique values OR unique ratio <10%
 *   4. freetext — everything else (default)
 */

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,                         // YYYY-MM-DD
  /^\d{2}\/\d{2}\/\d{4}$/,                       // DD/MM/YYYY or MM/DD/YYYY
  /^\d{2}-\d{2}-\d{4}$/,                         // DD-MM-YYYY
  /^\d{4}\/\d{2}\/\d{2}$/,                       // YYYY/MM/DD
  /^\d{2}\s\w{3}\s\d{4}$/,                       // 01 Jan 2024
  /^\w{3}\s\d{2},?\s\d{4}$/,                     // Jan 01, 2024
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,              // ISO datetime
  /^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}/,           // DD/MM/YYYY HH:MM
]

function looksNumeric(value) {
  if (value === '' || value === null || value === undefined) return null // skip nulls
  const cleaned = String(value).trim().replace(/,/g, '') // handle "1,234"
  const num = Number(cleaned)
  return isFinite(num) ? true : false
}

function looksLikeDate(value) {
  if (value === '' || value === null || value === undefined) return null
  const str = String(value).trim()
  // Check regex patterns first (fast)
  if (DATE_PATTERNS.some(p => p.test(str))) return true
  // Fallback: try Date.parse — but only if it looks vaguely date-like
  // (avoids false positives on plain numbers)
  if (/[\/\-]/.test(str) || /[a-zA-Z]/.test(str)) {
    const ts = Date.parse(str)
    if (!isNaN(ts)) {
      const year = new Date(ts).getFullYear()
      if (year >= 1900 && year <= 2100) return true
    }
  }
  return false
}

function isNullish(value) {
  if (value === null || value === undefined) return true
  const s = String(value).trim().toLowerCase()
  return s === '' || s === 'null' || s === 'na' || s === 'n/a' || s === 'nan' || s === '-' || s === 'none'
}

export function inferColumnTypes(dataset) {
  if (!dataset || dataset.length === 0) return {}

  const columns = Object.keys(dataset[0])
  const types = {}

  // Sample up to 200 rows for performance on large datasets
  const sample = dataset.length > 200 ? dataset.slice(0, 200) : dataset

  for (const col of columns) {
    const values = sample.map(row => row[col])
    const nonNull = values.filter(v => !isNullish(v))

    if (nonNull.length === 0) {
      types[col] = 'freetext'
      continue
    }

    // Check numeric
    const numericResults = nonNull.map(looksNumeric)
    const numericCount = numericResults.filter(r => r === true).length
    if (numericCount / nonNull.length >= 0.8) {
      types[col] = 'numeric'
      continue
    }

    // Check date
    const dateResults = nonNull.map(looksLikeDate)
    const dateCount = dateResults.filter(r => r === true).length
    if (dateCount / nonNull.length >= 0.8) {
      types[col] = 'date'
      continue
    }

    // Check categorical vs freetext
    const uniqueValues = new Set(nonNull.map(v => String(v).trim().toLowerCase()))
    const uniqueRatio = uniqueValues.size / nonNull.length
    if (uniqueValues.size <= 50 || uniqueRatio < 0.1) {
      types[col] = 'categorical'
      continue
    }

    types[col] = 'freetext'
  }

  return types
}

export { isNullish }
