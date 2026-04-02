/**
 * buildInsightPrompt(dataset, columns, types, fileName)
 *
 * Constructs a concise context summary from the dataset to send to Claude.
 * We don't send the raw data — we send computed stats so the prompt stays small.
 */

import { isNullish } from './inferTypes'

export function buildInsightPrompt(dataset, columns, types, fileName, customQuestion = '') {
  if (!dataset || dataset.length === 0) return ''

  const rowCount = dataset.length
  const colCount = columns.length

  // ── Per-column summaries ──
  const colSummaries = columns.map(col => {
    const type = types[col] || 'freetext'
    const values = dataset.map(r => r[col])
    const nonNull = values.filter(v => !isNullish(v))
    const nullCount = values.length - nonNull.length
    const nullPct = ((nullCount / values.length) * 100).toFixed(1)

    let stats = `  - ${col} (${type}): ${nullPct}% null`

    if (type === 'numeric') {
      const nums = nonNull.map(v => Number(String(v).replace(/,/g, ''))).filter(isFinite).sort((a, b) => a - b)
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0)
        const mean = (sum / nums.length).toFixed(2)
        const mid = Math.floor(nums.length / 2)
        const median = nums.length % 2 === 0 ? ((nums[mid - 1] + nums[mid]) / 2).toFixed(2) : nums[mid].toFixed(2)
        stats += `, min=${nums[0]}, max=${nums[nums.length - 1]}, mean=${mean}, median=${median}`
      }
    } else if (type === 'date') {
      const dates = nonNull.map(v => Date.parse(String(v))).filter(ts => !isNaN(ts)).sort((a, b) => a - b)
      if (dates.length > 0) {
        stats += `, range=${new Date(dates[0]).toISOString().split('T')[0]} to ${new Date(dates[dates.length - 1]).toISOString().split('T')[0]}`
      }
    } else if (type === 'categorical') {
      const freq = {}
      nonNull.forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5)
      const topStr = top.map(([v, c]) => `"${v}"(${c})`).join(', ')
      stats += `, ${Object.keys(freq).length} unique, top: ${topStr}`
    } else {
      const unique = new Set(nonNull.map(v => String(v).trim().toLowerCase())).size
      stats += `, ${unique} unique values`
    }

    return stats
  })

  // ── Detect duplicates ──
  const seen = new Set()
  let dupes = 0
  for (const row of dataset) {
    const key = JSON.stringify(row)
    if (seen.has(key)) dupes++
    else seen.add(key)
  }

  // ── Build prompt ──
  let prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team. Respond in a professional, precise register. No filler phrases. No hedging. Every statement must be supported by a specific figure from the data below.

Dataset: "${fileName}"
Rows: ${rowCount.toLocaleString()} | Columns: ${colCount} | Duplicates: ${dupes}

Column summaries:
${colSummaries.join('\n')}

`

  const sampleRows = dataset.slice(0, 3)
  prompt += `\nSample rows (first 3):\n`
  sampleRows.forEach((row, i) => {
    const vals = columns.map(c => `${c}=${JSON.stringify(row[c])}`).join(', ')
    prompt += `  Row ${i + 1}: ${vals}\n`
  })

  if (customQuestion) {
    prompt += `\nQuestion: ${customQuestion}\n`
    prompt += `\nRules for your answer:
- If the question asks for a ranked list or top N results, respond with a numbered list (1. 2. 3. ...).
- If the question asks for a comparison, use a markdown table with clear column headers.
- If the question is a single factual lookup, answer in one or two sentences.
- Always cite the exact column name and value. No filler phrases.
- If the data is insufficient to answer definitively, state precisely what is missing.`
  } else {
    prompt += `\nDeliver the following sections. Use **bold** headers. Bullet points only — no prose paragraphs.

**Key Findings** — 3–5 statistically significant patterns, ranked by impact. Cite exact numbers.
**Data Quality** — flag nulls, duplicates, type mismatches. State counts and percentages.
**Trends** — directional changes, correlations, and outliers with supporting figures.
**Recommended Actions** — specific, prioritised next steps for the CX team. No generic advice.`
  }

  return prompt
}
