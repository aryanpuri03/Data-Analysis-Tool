/**
 * computeProfile(dataset, columns, types)
 *
 * Returns { datasetStats, columnStats } where:
 *   datasetStats  = { rowCount, colCount, nullPercent, duplicateCount }
 *   columnStats   = { [colName]: { type, total, nullCount, nullPercent, ...typeSpecific } }
 */

import { isNullish } from './inferTypes'

export function computeProfile(dataset, columns, types) {
  if (!dataset || dataset.length === 0 || !columns || columns.length === 0) {
    return { datasetStats: null, columnStats: {} }
  }

  const rowCount = dataset.length
  const colCount = columns.length

  // ── Per-column stats ──
  const columnStats = {}
  let totalNulls = 0

  for (const col of columns) {
    const type = types[col] || 'freetext'
    const values = dataset.map(row => row[col])
    const nullCount = values.filter(v => isNullish(v)).length
    const nonNull = values.filter(v => !isNullish(v))
    totalNulls += nullCount

    const base = {
      type,
      total: rowCount,
      nullCount,
      nullPercent: rowCount > 0 ? ((nullCount / rowCount) * 100).toFixed(1) : '0.0',
    }

    if (type === 'numeric') {
      const nums = nonNull
        .map(v => {
          const cleaned = String(v).trim().replace(/,/g, '')
          return Number(cleaned)
        })
        .filter(n => isFinite(n))
        .sort((a, b) => a - b)

      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0)
        const mean = sum / nums.length
        const mid = Math.floor(nums.length / 2)
        const median = nums.length % 2 === 0
          ? (nums[mid - 1] + nums[mid]) / 2
          : nums[mid]

        // Outlier detection (IQR method)
        const q1Idx = Math.floor(nums.length * 0.25)
        const q3Idx = Math.floor(nums.length * 0.75)
        const q1 = nums[q1Idx]
        const q3 = nums[q3Idx]
        const iqr = q3 - q1
        const lowerFence = q1 - 1.5 * iqr
        const upperFence = q3 + 1.5 * iqr
        const outliers = nums.filter(n => n < lowerFence || n > upperFence)

        // Std dev for z-score outliers
        const variance = nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / nums.length
        const stdDev = Math.sqrt(variance)
        const zOutliers = nums.filter(n => Math.abs((n - mean) / (stdDev || 1)) > 3)

        columnStats[col] = {
          ...base,
          min: nums[0],
          max: nums[nums.length - 1],
          mean: Number(mean.toFixed(2)),
          median: Number(median.toFixed(2)),
          stdDev: Number(stdDev.toFixed(2)),
          q1: Number(q1.toFixed(2)),
          q3: Number(q3.toFixed(2)),
          iqr: Number(iqr.toFixed(2)),
          outlierCount: outliers.length,
          outlierExamples: outliers.slice(0, 5).map(n => Number(n.toFixed(2))),
          zOutlierCount: zOutliers.length,
          lowerFence: Number(lowerFence.toFixed(2)),
          upperFence: Number(upperFence.toFixed(2)),
          uniqueCount: new Set(nums).size,
        }
      } else {
        columnStats[col] = { ...base, min: null, max: null, mean: null, median: null, uniqueCount: 0 }
      }
    } else if (type === 'date') {
      const dates = nonNull
        .map(v => {
          const str = String(v).trim()
          const ts = Date.parse(str)
          return isNaN(ts) ? null : new Date(ts)
        })
        .filter(Boolean)
        .sort((a, b) => a - b)

      if (dates.length > 0) {
        // Try to detect the format from the first non-null value
        const sampleValue = String(nonNull[0]).trim()
        let detectedFormat = 'Unknown'
        if (/^\d{4}-\d{2}-\d{2}/.test(sampleValue)) detectedFormat = 'YYYY-MM-DD'
        else if (/^\d{2}\/\d{2}\/\d{4}/.test(sampleValue)) detectedFormat = 'DD/MM/YYYY'
        else if (/^\d{2}-\d{2}-\d{4}/.test(sampleValue)) detectedFormat = 'DD-MM-YYYY'
        else if (/\w{3}\s\d{2}/.test(sampleValue)) detectedFormat = 'Mon DD, YYYY'

        columnStats[col] = {
          ...base,
          earliest: dates[0].toISOString().split('T')[0],
          latest: dates[dates.length - 1].toISOString().split('T')[0],
          detectedFormat,
          uniqueCount: new Set(dates.map(d => d.toISOString().split('T')[0])).size,
        }
      } else {
        columnStats[col] = { ...base, earliest: null, latest: null, detectedFormat: 'Unknown', uniqueCount: 0 }
      }
    } else if (type === 'categorical') {
      const freq = {}
      for (const v of nonNull) {
        const key = String(v).trim()
        freq[key] = (freq[key] || 0) + 1
      }
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
      const top5 = sorted.slice(0, 5).map(([value, count]) => ({
        value,
        count,
        percent: ((count / nonNull.length) * 100).toFixed(1),
      }))

      columnStats[col] = {
        ...base,
        uniqueCount: sorted.length,
        top5,
      }
    } else {
      // freetext
      const lengths = nonNull.map(v => String(v).length)
      const uniqueCount = new Set(nonNull.map(v => String(v).trim().toLowerCase())).size

      columnStats[col] = {
        ...base,
        uniqueCount,
        avgLength: lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
        minLength: lengths.length > 0 ? Math.min(...lengths) : 0,
        maxLength: lengths.length > 0 ? Math.max(...lengths) : 0,
      }
    }
  }

  // ── Dataset-level stats ──
  const totalCells = rowCount * colCount
  const nullPercent = totalCells > 0 ? ((totalNulls / totalCells) * 100).toFixed(1) : '0.0'

  // Duplicate detection — stringify each row and count
  const seen = new Set()
  let duplicateCount = 0
  for (const row of dataset) {
    const key = JSON.stringify(row)
    if (seen.has(key)) duplicateCount++
    else seen.add(key)
  }

  const datasetStats = { rowCount, colCount, nullPercent, duplicateCount }

  return { datasetStats, columnStats }
}
