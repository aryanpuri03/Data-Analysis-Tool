import { useState, useCallback, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, X, AlertTriangle, ChevronDown, Sparkles, Loader2, AlertCircle, TrendingDown, TrendingUp, Trash2, Search, CheckCircle2 } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { inferColumnTypes, isNullish } from '../../utils/inferTypes'
import { extractJSONArray } from '../../utils/extractJSON'
import { Link } from 'react-router-dom'

const TYPE_OPTIONS = ['numeric', 'date', 'categorical', 'freetext']

const TYPE_BADGES = {
  numeric:     { label: 'Numeric',     cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  date:        { label: 'Date',        cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
  categorical: { label: 'Categorical', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  freetext:    { label: 'Free Text',   cls: 'bg-slate-50 text-slate-600 border border-slate-200' },
}

const SEVERITY_STYLES = {
  high:   { wrap: 'border-red-200 bg-red-50',    icon: 'text-red-500',   title: 'text-red-800',   body: 'text-red-700'   },
  medium: { wrap: 'border-amber-200 bg-amber-50', icon: 'text-amber-500', title: 'text-amber-800', body: 'text-amber-700' },
  low:    { wrap: 'border-blue-200 bg-blue-50',   icon: 'text-blue-500',  title: 'text-blue-800',  body: 'text-blue-700'  },
}

export default function DataUpload() {
  const { dataset, columns, types, fileName, dataStats, setDataset, updateTypes, clearDataset } = useData()
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  // Smart Alerts
  const [alerts, setAlerts] = useState(null)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState(null)
  const alertsRanRef = useRef(false)

  useEffect(() => {
    if (!dataset || !columns || alertsRanRef.current) return
    alertsRanRef.current = true
    runSmartAlerts()
  }, [dataset, columns])

  useEffect(() => {
    if (!dataset) alertsRanRef.current = false
  }, [dataset])

  const runSmartAlerts = useCallback(async () => {
    if (!dataset || !columns) return
    setAlertsLoading(true)
    setAlertsError(null)

    const colInfo = columns.map(col => {
      const type = types[col] || 'freetext'
      const values = dataset.map(r => r[col])
      const nonNull = values.filter(v => !isNullish(v))
      const nullCount = values.length - nonNull.length
      const nullPct = ((nullCount / values.length) * 100).toFixed(1)
      let info = `"${col}" [${type}]: ${nullPct}% null (${nullCount}/${values.length})`

      if (type === 'numeric') {
        const nums = nonNull.map(v => Number(String(v).replace(/,/g, ''))).filter(isFinite).sort((a, b) => a - b)
        if (nums.length) {
          const sum = nums.reduce((a, b) => a + b, 0)
          info += `, min=${nums[0]}, max=${nums[nums.length - 1]}, mean=${(sum / nums.length).toFixed(1)}`
        }
      } else if (type === 'categorical') {
        const freq = {}
        nonNull.forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5)
        info += `, ${Object.keys(freq).length} unique, top: ${top.map(([v, c]) => `"${v}"(${c})`).join(', ')}`
      }
      return `  - ${info}`
    }).join('\n')

    const seen = new Set()
    let dupes = 0
    for (const row of dataset) { const k = JSON.stringify(row); if (seen.has(k)) dupes++; else seen.add(k) }

    const prompt = `ROLE: Data quality auditor. Scan the dataset profile below and flag issues or significant patterns. Respond only with the JSON array requested — no preamble, no commentary.

Dataset: ${dataset.length} rows, ${columns.length} columns, ${dupes} duplicate rows.

Columns:
${colInfo}

Sample rows:
${dataset.slice(0, 3).map((row, i) => `  Row ${i + 1}: ${columns.map(c => `${c}=${JSON.stringify(row[c])}`).join(', ')}`).join('\n')}

Respond with ONLY a JSON array. Each alert:
{ "type": "warning"|"insight"|"quality", "title": "short title (max 8 words)", "detail": "one sentence with specific numbers", "severity": "high"|"medium"|"low" }
Max 6 alerts, sorted by severity. Return ONLY the JSON array.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 600 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      const parsed = extractJSONArray(data.content || '')
      if (parsed.length) setAlerts(parsed.filter(a => a.title && a.detail))
    } catch (err) {
      setAlertsError(err.message)
    } finally {
      setAlertsLoading(false)
    }
  }, [dataset, columns, types])

  const processFile = useCallback((file) => {
    setError(null)
    setLoading(true)
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          if (!results.data || results.data.length === 0) { setError('The CSV file appears to be empty.'); setLoading(false); return }
          const cols = Object.keys(results.data[0])
          setDataset(results.data, cols, inferColumnTypes(results.data), file.name)
          setLoading(false)
        },
        error: (err) => { setError(`CSV parsing failed: ${err.message}`); setLoading(false) },
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
          if (!data || data.length === 0) { setError('The Excel file appears to be empty.'); setLoading(false); return }
          const cols = Object.keys(data[0])
          setDataset(data, cols, inferColumnTypes(data), file.name)
          setLoading(false)
        } catch (err) { setError(`Excel parsing failed: ${err.message}`); setLoading(false) }
      }
      reader.readAsArrayBuffer(file)
    } else {
      setError('Unsupported file type. Please upload a .csv or .xlsx file.')
      setLoading(false)
    }
  }, [setDataset])

  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0])
  }, [processFile])

  const handleFileSelect = useCallback((e) => {
    if (e.target.files?.[0]) processFile(e.target.files[0])
  }, [processFile])

  const handleTypeChange = useCallback((col, newType) => {
    updateTypes({ [col]: newType })
  }, [updateTypes])

  // ── Upload state ──
  if (!dataset) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary">Upload Data</h1>
          <p className="text-sm text-text-secondary mt-0.5">Start by uploading a CSV or Excel file to analyse.</p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Data is processed entirely in your browser and is not stored anywhere. Refreshing the page will clear your dataset.
          </p>
        </div>

        <div
          className={`group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-14 transition-all duration-200 cursor-pointer ${
            dragActive ? 'border-brand-accent bg-blue-50/60' : 'border-border hover:border-brand-accent/40 hover:bg-slate-50/60'
          }`}
          onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${dragActive ? 'bg-brand-accent/15' : 'bg-slate-100 group-hover:bg-brand-accent/10'}`}>
            <Upload className={`w-7 h-7 transition-colors ${dragActive ? 'text-brand-accent' : 'text-slate-400 group-hover:text-brand-accent'}`} />
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">
            {dragActive ? 'Drop to upload' : 'Drag & drop your file here'}
          </p>
          <p className="text-xs text-text-secondary mb-4">or click to browse</p>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="px-2 py-0.5 rounded bg-slate-100 font-mono">.csv</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 font-mono">.xlsx</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 font-mono">.xls</span>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
        </div>

        {loading && (
          <div className="mt-6 flex items-center gap-3 px-5 py-4 rounded-xl border border-border bg-white">
            <Loader2 className="w-5 h-5 text-brand-blue animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-text-primary">Parsing file…</p>
              <p className="text-xs text-text-secondary">Large files may take a moment</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Data loaded state ──
  const previewRows = dataset.slice(0, 20)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Upload Data</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-text-secondary" />
              <span className="text-xs font-mono text-text-secondary">{fileName}</span>
            </div>
            {dataStats && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-xs text-text-secondary">{dataStats.rowCount.toLocaleString()} rows</span>
                <span className="text-text-muted">·</span>
                <span className="text-xs text-text-secondary">{dataStats.columnCount} columns</span>
                <span className="text-text-muted">·</span>
                <span className="text-xs text-text-secondary">{dataStats.nullRate}% null</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/profile">
            <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer">
              View Profile
            </button>
          </Link>
          <button
            onClick={clearDataset}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Data
          </button>
        </div>
      </div>

      {/* Smart Alerts */}
      {(alertsLoading || alerts || alertsError) && (
        <div className="rounded-xl border border-border bg-white overflow-hidden mb-5">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-slate-50/80">
            <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
            <span className="text-xs font-semibold text-text-primary">Smart Alerts</span>
            {alertsLoading && <Loader2 className="w-3 h-3 text-brand-blue animate-spin ml-auto" />}
          </div>
          <div className="p-4">
            {alertsLoading && (
              <div className="flex items-center gap-2">
                <div className="skeleton h-3 w-48" />
                <div className="skeleton h-3 w-32" />
              </div>
            )}
            {alertsError && (
              <p className="text-xs text-red-600">Could not generate alerts: {alertsError}</p>
            )}
            {alerts && alerts.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-green-700">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                No data quality issues detected.
              </div>
            )}
            {alerts && alerts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {alerts.map((alert, i) => {
                  const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low
                  const Icon = alert.type === 'insight' ? TrendingUp : alert.type === 'quality' ? Search : AlertTriangle
                  return (
                    <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border ${sev.wrap}`}>
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${sev.icon}`} />
                      <div>
                        <p className={`text-xs font-semibold ${sev.title}`}>{alert.title}</p>
                        <p className={`text-[11px] mt-0.5 leading-relaxed ${sev.body}`}>{alert.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-50/80">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Preview — first {previewRows.length} of {dataset.length.toLocaleString()} rows
          </span>
          <span className="text-[11px] text-text-muted">Click a type badge to change column type</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50/50">
                {columns.map(col => {
                  const badge = TYPE_BADGES[types[col]] || TYPE_BADGES.freetext
                  return (
                    <th key={col} className="px-3 py-3 text-left align-top">
                      <div className="text-xs font-semibold text-text-primary mb-1.5 whitespace-nowrap">{col}</div>
                      <div className="relative inline-flex">
                        <select
                          value={types[col] || 'freetext'}
                          onChange={e => handleTypeChange(col, e.target.value)}
                          className={`appearance-none text-[10px] font-medium pl-2 pr-5 py-0.5 rounded-full cursor-pointer ${badge.cls}`}
                        >
                          {TYPE_OPTIONS.map(t => (
                            <option key={t} value={t}>{TYPE_BADGES[t].label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 pointer-events-none opacity-60" />
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className={`border-b border-border/40 hover:bg-slate-50/60 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  {columns.map(col => (
                    <td key={col} className="px-3 py-2 text-xs font-mono text-text-primary whitespace-nowrap max-w-[200px] truncate">
                      {isNullish(row[col])
                        ? <span className="text-text-muted italic">null</span>
                        : String(row[col])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dataset.length > 20 && (
          <div className="px-4 py-2.5 border-t border-border bg-slate-50/60 text-center">
            <p className="text-xs text-text-muted">{(dataset.length - 20).toLocaleString()} more rows not shown</p>
          </div>
        )}
      </div>
    </div>
  )
}
