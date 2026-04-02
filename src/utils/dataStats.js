/**
 * dataStats.js
 * Efficient single-pass descriptive statistics for large datasets.
 * Uses Welford's online algorithm for numerically stable mean/variance.
 */

/**
 * Compute full descriptive stats for an array of numeric values.
 * @param {number[]} values  Already-filtered finite numbers
 * @returns {{ count, mean, variance, stdDev, min, max, median, mode, p5, p25, p75, p95, skewness }}
 */
export function computeColumnStats(values) {
  const n = values.length
  if (n === 0) return null

  // Single-pass: mean + variance (Welford)
  let mean = 0, M2 = 0, M3 = 0
  let min = Infinity, max = -Infinity

  for (let i = 0; i < n; i++) {
    const x = values[i]
    if (x < min) min = x
    if (x > max) max = x
    const delta = x - mean
    mean += delta / (i + 1)
    const delta2 = x - mean
    M2 += delta * delta2
    M3 += delta * delta2 * delta  // third central moment (approx)
  }

  const variance = n > 1 ? M2 / (n - 1) : 0
  const stdDev = Math.sqrt(variance)

  // Percentiles & median (requires sort)
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p) => {
    const idx = (p / 100) * (n - 1)
    const lo = Math.floor(idx), hi = Math.ceil(idx)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }

  // Mode (most frequent value)
  const freq = new Map()
  for (const v of values) freq.set(v, (freq.get(v) || 0) + 1)
  let mode = values[0], maxFreq = 0
  for (const [v, f] of freq) { if (f > maxFreq) { maxFreq = f; mode = v } }

  // Skewness (Fisher's definition)
  const skewness = stdDev > 0 ? (M3 / n) / (stdDev ** 3) : 0

  return {
    count: n,
    mean: round(mean),
    variance: round(variance),
    stdDev: round(stdDev),
    min: round(min),
    max: round(max),
    median: round(percentile(50)),
    mode: round(mode),
    p5:  round(percentile(5)),
    p25: round(percentile(25)),
    p75: round(percentile(75)),
    p95: round(percentile(95)),
    skewness: round(skewness),
  }
}

function round(v, dp = 4) {
  return Math.round(v * 10 ** dp) / 10 ** dp
}

/**
 * Compute stats for all numeric columns in a dataset.
 * @param {object[]} dataset
 * @param {string[]} columns
 * @param {object}   types  { colName: 'numeric' | ... }
 */
export function computeDatasetStats(dataset, columns, types) {
  const result = {}
  for (const col of columns) {
    if (types[col] !== 'numeric') continue
    const nums = dataset
      .map(r => Number(String(r[col] ?? '').replace(/,/g, '')))
      .filter(isFinite)
    result[col] = computeColumnStats(nums)
  }
  return result
}
