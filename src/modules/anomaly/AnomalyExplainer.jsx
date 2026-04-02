import { useState, useCallback, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { extractJSONArray } from '../../utils/extractJSON'
import { AlertCircle, AlertTriangle, Loader2, Sparkles, Copy, Check } from 'lucide-react'

export default function AnomalyExplainer() {
  const { dataset, columns, types, fileName } = useData()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [anomalies, setAnomalies] = useState(null)
  const [copiedIdx, setCopiedIdx] = useState(null)

  // Detect anomalies client-side first
  const detectedAnomalies = useMemo(() => {
    if (!dataset || !columns) return []
    const results = []

    for (const col of columns) {
      if (types[col] !== 'numeric') continue
      const nums = dataset.map((r, i) => ({ val: Number(String(r[col] ?? '').replace(/,/g, '')), idx: i })).filter(d => isFinite(d.val))
      if (nums.length < 4) continue

      const sorted = nums.map(d => d.val).sort((a, b) => a - b)
      const q1 = sorted[Math.floor(sorted.length * 0.25)]
      const q3 = sorted[Math.floor(sorted.length * 0.75)]
      const iqr = q3 - q1
      const lower = q1 - 1.5 * iqr
      const upper = q3 + 1.5 * iqr
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length

      const outliers = nums.filter(d => d.val < lower || d.val > upper)
      if (outliers.length > 0) {
        results.push({
          column: col,
          type: 'outliers',
          count: outliers.length,
          range: `[${lower.toFixed(1)}, ${upper.toFixed(1)}]`,
          mean: mean.toFixed(2),
          examples: outliers.slice(0, 5).map(o => ({ row: o.idx + 1, value: o.val })),
        })
      }
    }

    // Check for sudden changes in date-ordered data
    const dateCol = columns.find(c => types[c] === 'date')
    if (dateCol) {
      for (const col of columns) {
        if (types[col] !== 'numeric') continue
        const pairs = dataset.map(r => ({ date: r[dateCol], val: Number(String(r[col] ?? '').replace(/,/g, '')) }))
          .filter(p => !isNullish(p.date) && isFinite(p.val))
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

        if (pairs.length < 5) continue
        const mean = pairs.reduce((s, p) => s + p.val, 0) / pairs.length
        const std = Math.sqrt(pairs.reduce((s, p) => s + (p.val - mean) ** 2, 0) / pairs.length)
        if (std === 0) continue

        for (let i = 1; i < pairs.length; i++) {
          const change = Math.abs(pairs[i].val - pairs[i - 1].val)
          if (change > 2.5 * std) {
            results.push({
              column: col,
              type: 'sudden_change',
              from: { date: pairs[i - 1].date, value: pairs[i - 1].val },
              to: { date: pairs[i].date, value: pairs[i].val },
              changePercent: pairs[i - 1].val !== 0 ? (((pairs[i].val - pairs[i - 1].val) / Math.abs(pairs[i - 1].val)) * 100).toFixed(1) : 'N/A',
            })
          }
        }
      }
    }

    // Null spikes
    for (const col of columns) {
      const nullCount = dataset.filter(r => isNullish(r[col])).length
      const pct = (nullCount / dataset.length) * 100
      if (pct > 15) {
        results.push({
          column: col,
          type: 'high_nulls',
          count: nullCount,
          percent: pct.toFixed(1),
        })
      }
    }

    return results
  }, [dataset, columns, types])

  const explainAnomalies = useCallback(async () => {
    if (!dataset || detectedAnomalies.length === 0) return
    setLoading(true)
    setError(null)

    const anomalySummary = detectedAnomalies.map((a, i) => {
      if (a.type === 'outliers') {
        return `${i + 1}. OUTLIERS in "${a.column}": ${a.count} values outside expected range ${a.range}, mean=${a.mean}. Examples: ${a.examples.map(e => `row ${e.row}: ${e.value}`).join(', ')}`
      } else if (a.type === 'sudden_change') {
        return `${i + 1}. SUDDEN CHANGE in "${a.column}": jumped from ${a.from.value} (${a.from.date}) to ${a.to.value} (${a.to.date}), change=${a.changePercent}%`
      } else if (a.type === 'high_nulls') {
        return `${i + 1}. HIGH NULLS in "${a.column}": ${a.count} nulls (${a.percent}%)`
      }
      return ''
    }).join('\n')

    // Build column context
    const colInfo = columns.map(col => {
      const type = types[col] || 'freetext'
      const values = dataset.map(r => r[col]).filter(v => !isNullish(v))
      let info = `"${col}" [${type}]`
      if (type === 'categorical') {
        const freq = {}
        values.forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5)
        info += `: ${top.map(([v, c]) => `"${v}"(${c})`).join(', ')}`
      }
      return `  - ${info}`
    }).join('\n')

    const prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team. Analyse the detected anomalies below and provide precise, professional explanations. Every cause must be plausible and specific to airport operations. Respond only with the JSON array requested.

Dataset: "${fileName}", ${dataset.length} rows, ${columns.length} columns.

Columns:
${colInfo}

Detected anomalies:
${anomalySummary}

For EACH anomaly, provide a JSON array of explanations. Each explanation should:
1. Describe what the anomaly is in plain English
2. Suggest 2-3 possible CAUSES — think about real-world airport operations (seasonal travel, airline schedules, terminal maintenance, system outages, survey distribution changes, holidays, events)
3. Rate the severity and suggest an action

Respond with ONLY a JSON array (no markdown):
[
  {
    "anomalyIndex": 1,
    "title": "short title",
    "explanation": "what this anomaly means in plain English",
    "possibleCauses": ["cause 1 with reasoning", "cause 2 with reasoning"],
    "severity": "high" | "medium" | "low",
    "suggestedAction": "what to do about it"
  }
]`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1500 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')

      const results = extractJSONArray(data.content || '')
      if (!results.length) throw new Error('AI did not return valid explanations')
      setAnomalies(results.filter(a => a.title))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dataset, columns, types, fileName, detectedAnomalies])

  const copyExplanation = useCallback(async (text, idx) => {
    try { await navigator.clipboard.writeText(text) } catch { /* noop */ }
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }, [])

  if (!dataset) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Anomaly Explainer</h1>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12">
          <AlertCircle className="w-8 h-8 text-text-secondary mb-3" />
          <p className="text-sm font-medium text-text-primary">No dataset loaded</p>
          <p className="mt-1 text-xs text-text-secondary">Upload a CSV or Excel file first.</p>
        </div>
      </div>
    )
  }

  const SEV_STYLES = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-amber-200 bg-amber-50',
    low: 'border-blue-200 bg-blue-50',
  }
  const SEV_BADGE = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Anomaly Explainer</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Detects outliers, sudden changes, and data quality issues — then uses AI to explain possible causes.
        </p>
      </div>

      {/* Detected anomalies summary */}
      <div className="rounded-lg border border-border bg-card-bg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <p className="text-sm font-semibold text-text-primary">
              {detectedAnomalies.length} anomal{detectedAnomalies.length === 1 ? 'y' : 'ies'} detected
            </p>
          </div>
          <button
            onClick={explainAnomalies}
            disabled={loading || detectedAnomalies.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Analysing…' : 'Explain with AI'}
          </button>
        </div>

        {detectedAnomalies.length === 0 ? (
          <p className="text-xs text-green-700">No significant anomalies detected in your data.</p>
        ) : (
          <div className="space-y-2">
            {detectedAnomalies.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-md border border-border bg-white text-xs">
                <span className="text-[10px] font-bold text-text-secondary bg-gray-100 px-1.5 py-0.5 rounded">#{i + 1}</span>
                <span className="font-mono text-brand-blue font-medium">{a.column}</span>
                {a.type === 'outliers' && (
                  <span className="text-text-primary">{a.count} outlier{a.count > 1 ? 's' : ''} outside {a.range}</span>
                )}
                {a.type === 'sudden_change' && (
                  <span className="text-text-primary">
                    Sudden {Number(a.changePercent) > 0 ? 'jump' : 'drop'} of {a.changePercent}% ({a.from.date} → {a.to.date})
                  </span>
                )}
                {a.type === 'high_nulls' && (
                  <span className="text-text-primary">{a.percent}% null values ({a.count} rows)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* AI Explanations */}
      {anomalies && anomalies.length > 0 && (
        <div className="space-y-4">
          {anomalies.map((a, i) => (
            <div key={i} className={`rounded-lg border p-5 ${SEV_STYLES[a.severity] || SEV_STYLES.medium}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${SEV_BADGE[a.severity] || SEV_BADGE.medium}`}>
                    {a.severity}
                  </span>
                  <h3 className="text-sm font-semibold text-text-primary">{a.title}</h3>
                </div>
                <button
                  onClick={() => copyExplanation(`${a.title}\n\n${a.explanation}\n\nPossible causes:\n${a.possibleCauses.map((c, j) => `${j + 1}. ${c}`).join('\n')}\n\nSuggested action: ${a.suggestedAction}`, i)}
                  className="shrink-0 p-1.5 text-text-secondary hover:text-text-primary rounded transition-colors cursor-pointer"
                >
                  {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-sm text-text-primary mb-3">{a.explanation}</p>

              <div className="mb-3">
                <p className="text-xs font-semibold text-text-secondary mb-1.5">Possible Causes:</p>
                <ul className="space-y-1">
                  {a.possibleCauses.map((cause, j) => (
                    <li key={j} className="text-xs text-text-primary flex items-start gap-2">
                      <span className="text-text-secondary mt-0.5">•</span>
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2.5 border-t border-black/10">
                <p className="text-xs">
                  <span className="font-semibold text-text-secondary">Suggested action: </span>
                  <span className="text-text-primary">{a.suggestedAction}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!anomalies && !loading && detectedAnomalies.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-800">
            <strong>How it works:</strong> We detect outliers (IQR method), sudden value changes, and high null rates client-side.
            Click "Explain with AI" to get possible real-world causes for each anomaly.
          </p>
        </div>
      )}
    </div>
  )
}
