import { useState, useCallback, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { computeProfile } from '../../utils/computeProfile'
import { isNullish } from '../../utils/inferTypes'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { AlertCircle, FileText, Loader2, Copy, Check, Download, Sparkles, RotateCw } from 'lucide-react'

export default function ReportBuilder() {
  const { dataset, columns, types, fileName } = useData()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const reportRef = useRef(null)

  const generateReport = useCallback(async () => {
    if (!dataset) return
    setLoading(true)
    setError(null)
    setReport(null)

    const { datasetStats, columnStats } = computeProfile(dataset, columns, types)

    // Build a rich summary for AI
    const colDetails = columns.map(col => {
      const s = columnStats[col]
      if (!s) return `  - "${col}": no stats`
      let info = `  - "${col}" [${s.type}]: ${s.nullPercent}% null`
      if (s.type === 'numeric') {
        info += `, min=${s.min}, max=${s.max}, mean=${s.mean}, median=${s.median}`
        if (s.outlierCount > 0) info += `, ${s.outlierCount} outliers`
      } else if (s.type === 'categorical') {
        info += `, ${s.uniqueCount} unique`
        if (s.topValues) info += `, top: ${s.topValues.slice(0, 5).map(v => `"${v.value}"(${v.count})`).join(', ')}`
      } else if (s.type === 'date') {
        info += `, range: ${s.earliest} to ${s.latest}`
      }
      return info
    }).join('\n')

    const prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team. Write a structured executive report based on the dataset profile below. Professional register. Every finding must cite a specific figure. No filler, no generic observations.

Dataset: "${fileName}" — ${datasetStats.rowCount} rows, ${datasetStats.colCount} columns, ${datasetStats.duplicateCount} duplicates, ${datasetStats.nullPercent}% overall nulls.

Column details:
${colDetails}

Sample rows (first 3):
${dataset.slice(0, 3).map((row, i) => `  Row ${i + 1}: ${columns.map(c => `${c}=${JSON.stringify(row[c])}`).join(', ')}`).join('\n')}

Write a complete executive report with these sections. Use markdown formatting:

# Executive Summary
2-3 sentences on what this dataset tells us overall.

# Data Overview
Table showing key dataset metrics (rows, columns, quality).

# Key Findings
3-5 most important insights from the data. Be specific — cite numbers, percentages, column names. Each finding should be a short paragraph.

# Data Quality Assessment
Issues found (nulls, duplicates, potential inconsistencies) and their impact.

# Trends & Patterns
Any notable trends, correlations, or distributions visible from the stats.

# Recommendations
3-5 actionable recommendations for the CX team based on the findings.

# Next Steps
Suggested follow-up analyses or data collection improvements.

Be specific, professional, and concise. Cite actual numbers from the data. Write as if this will be emailed to leadership.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 2500 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      setReport(data.content || 'No response received.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dataset, columns, types, fileName])

  const copyReport = useCallback(async () => {
    if (!report) return
    try { await navigator.clipboard.writeText(report) } catch {
      const ta = document.createElement('textarea')
      ta.value = report
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [report])

  const downloadReport = useCallback(() => {
    if (!report) return
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(fileName || 'data').replace(/\.[^.]+$/, '')}_report.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [report, fileName])

  if (!dataset) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Auto Report</h1>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12">
          <AlertCircle className="w-8 h-8 text-text-secondary mb-3" />
          <p className="text-sm font-medium text-text-primary">No dataset loaded</p>
          <p className="mt-1 text-xs text-text-secondary">Upload a CSV or Excel file first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Auto Report</h1>
          <p className="mt-1 text-sm text-text-secondary">
            One-click AI-generated executive report from your data — copy-paste ready for emails or presentations.
          </p>
        </div>
      </div>

      {/* Generate */}
      <div className="rounded-lg border border-border bg-card-bg p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-brand-blue" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Generate Executive Report</p>
            <p className="text-xs text-text-secondary">
              Creates a full report with findings, data quality assessment, trends, and recommendations.
            </p>
          </div>
        </div>
        <button
          onClick={generateReport}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Generating report…' : 'Generate Report'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-border bg-card-bg p-10 text-center">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-text-primary">Writing your report…</p>
          <p className="text-xs text-text-secondary mt-1">This may take 15–30 seconds</p>
        </div>
      )}

      {/* Report output */}
      {report && !loading && (
        <div className="rounded-lg border border-border bg-card-bg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-blue" />
              <h2 className="text-sm font-semibold text-text-primary">Report</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={downloadReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download .md
              </button>
              <button
                onClick={generateReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" /> Regenerate
              </button>
            </div>
          </div>
          <div ref={reportRef} className="px-6 py-5 max-w-none">
            {renderMarkdown(report)}
          </div>
        </div>
      )}
    </div>
  )
}
