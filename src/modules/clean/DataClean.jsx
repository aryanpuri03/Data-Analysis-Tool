import { useState, useCallback } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { extractJSONArray } from '../../utils/extractJSON'
import { AlertCircle, Trash2, Search, Scissors, Droplets, ChevronDown, ChevronUp, History, Download, Sparkles, Loader2, Check, Undo2, Redo2, Upload, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const PRIORITY_STYLES = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-gray-100 text-gray-600 border-gray-200',
}

export default function DataClean() {
  const { dataset, columns, types, fileName, updateDataset, canUndo, canRedo, undoClean, redoClean } = useData()
  const [stepsLog, setStepsLog] = useState([])
  const [activePanel, setActivePanel] = useState(null)

  // ── Null handling state ──
  const [nullCol, setNullCol] = useState('')
  const [nullAction, setNullAction] = useState('drop')
  const [nullFillValue, setNullFillValue] = useState('')

  // ── Find & Replace state ──
  const [frCol, setFrCol] = useState('')
  const [findValue, setFindValue] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [frCaseSensitive, setFrCaseSensitive] = useState(false)

  // ── Helpers ──
  const addStep = useCallback((description, rowsBefore, rowsAfter) => {
    setStepsLog(prev => [...prev, {
      id: Date.now(),
      description,
      rowsBefore,
      rowsAfter,
      delta: rowsAfter - rowsBefore,
      timestamp: new Date().toLocaleTimeString(),
    }])
  }, [])

  const getColumnValues = useCallback((col) => {
    if (!dataset) return []
    return dataset.map(row => row[col]).filter(v => !isNullish(v))
  }, [dataset])

  const getColumnStats = useCallback((col) => {
    const values = getColumnValues(col)
    const type = types[col]
    if (type === 'numeric') {
      const nums = values.map(v => Number(String(v).replace(/,/g, ''))).filter(isFinite)
      if (nums.length === 0) return { mean: 0, median: 0, mode: '' }
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length
      const sorted = [...nums].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
      const freq = {}
      nums.forEach(n => freq[n] = (freq[n] || 0) + 1)
      const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      return { mean: Number(mean.toFixed(2)), median: Number(median.toFixed(2)), mode }
    } else {
      const freq = {}
      values.forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
      const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      return { mean: '', median: '', mode }
    }
  }, [getColumnValues, types])

  // ── Operations ──
  const handleNulls = useCallback(() => {
    if (!nullCol || !dataset) return
    const before = dataset.length
    let newData
    if (nullAction === 'drop') {
      newData = dataset.filter(row => !isNullish(row[nullCol]))
      addStep(`Dropped rows with nulls in "${nullCol}"`, before, newData.length)
    } else {
      let fillVal = nullFillValue
      if (nullAction === 'mean' || nullAction === 'median' || nullAction === 'mode') {
        const stats = getColumnStats(nullCol)
        fillVal = String(stats[nullAction])
      }
      newData = dataset.map(row => isNullish(row[nullCol]) ? { ...row, [nullCol]: fillVal } : row)
      const actionLabel = nullAction === 'custom' ? `"${fillVal}"` : nullAction
      addStep(`Filled nulls in "${nullCol}" with ${actionLabel}`, before, newData.length)
    }
    updateDataset(newData)
  }, [dataset, nullCol, nullAction, nullFillValue, updateDataset, addStep, getColumnStats])

  const removeDuplicates = useCallback(() => {
    if (!dataset) return
    const before = dataset.length
    const seen = new Set()
    const newData = dataset.filter(row => {
      const key = JSON.stringify(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    addStep('Removed duplicate rows', before, newData.length)
    updateDataset(newData)
  }, [dataset, updateDataset, addStep])

  const findAndReplace = useCallback(() => {
    if (!frCol || !findValue || !dataset) return
    const before = dataset.length
    let replacedCount = 0
    const newData = dataset.map(row => {
      const val = String(row[frCol] ?? '')
      const matches = frCaseSensitive ? val.includes(findValue) : val.toLowerCase().includes(findValue.toLowerCase())
      if (matches) {
        replacedCount++
        const regex = new RegExp(findValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), frCaseSensitive ? 'g' : 'gi')
        return { ...row, [frCol]: val.replace(regex, replaceValue) }
      }
      return row
    })
    addStep(`Find & replace in "${frCol}": "${findValue}" → "${replaceValue}" (${replacedCount} cells)`, before, newData.length)
    updateDataset(newData)
  }, [dataset, frCol, findValue, replaceValue, frCaseSensitive, updateDataset, addStep])

  const trimWhitespace = useCallback(() => {
    if (!dataset) return
    const before = dataset.length
    let trimmedCount = 0
    const newData = dataset.map(row => {
      const newRow = { ...row }
      for (const col of columns) {
        if (typeof newRow[col] === 'string') {
          const trimmed = newRow[col].trim()
          if (trimmed !== newRow[col]) { trimmedCount++; newRow[col] = trimmed }
        }
      }
      return newRow
    })
    addStep(`Trimmed whitespace across all columns (${trimmedCount} cells affected)`, before, newData.length)
    updateDataset(newData)
  }, [dataset, columns, updateDataset, addStep])

  // ── Export ──
  const baseName = (fileName || 'data').replace(/\.[^.]+$/, '') + '_cleaned'

  const exportCsv = useCallback(() => {
    if (!dataset) return
    const csv = Papa.unparse(dataset, { columns })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${baseName}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [dataset, columns, baseName])

  const exportExcel = useCallback(() => {
    if (!dataset) return
    const ws = XLSX.utils.json_to_sheet(dataset, { header: columns })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cleaned Data')
    XLSX.writeFile(wb, `${baseName}.xlsx`)
  }, [dataset, columns, baseName])

  // ── AI Suggestions ──
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const getAiSuggestions = useCallback(async () => {
    if (!dataset) return
    setAiLoading(true); setAiError(null); setAiSuggestions([])
    const colSummaries = columns.map(col => {
      const type = types[col] || 'freetext'
      const values = dataset.map(r => r[col])
      const nullCount = values.filter(v => isNullish(v)).length
      const nullPct = ((nullCount / values.length) * 100).toFixed(1)
      let extra = ''
      if (type === 'numeric') {
        const nums = values.filter(v => !isNullish(v)).map(v => Number(String(v).replace(/,/g, ''))).filter(isFinite)
        if (nums.length) extra = `, mean=${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)}`
      } else if (type === 'categorical') {
        const freq = {}
        values.filter(v => !isNullish(v)).forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, c]) => `"${v}"(${c})`).join(', ')
        extra = `, ${Object.keys(freq).length} unique, top: ${top}`
      }
      return `  - "${col}" [${type}]: ${nullPct}% null (${nullCount}/${values.length})${extra}`
    }).join('\n')
    const seen = new Set(); let dupes = 0
    for (const row of dataset) { const k = JSON.stringify(row); if (seen.has(k)) dupes++; else seen.add(k) }
    const prompt = `ROLE: Data quality analyst. Identify cleaning actions required based on the dataset profile below. No filler, no explanations — produce only the JSON output requested.

Dataset: ${dataset.length} rows, ${columns.length} columns, ${dupes} duplicate rows.
Columns:\n${colSummaries}

Respond with ONLY a JSON array. Each item: { "description": string, "action": "drop_nulls"|"fill_mean"|"fill_median"|"fill_mode"|"remove_duplicates"|"trim_whitespace"|"find_replace", "column": string, "find": string, "replace": string, "priority": "high"|"medium"|"low" }. Max 8. Return ONLY the JSON array.`
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 800 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      const suggestions = extractJSONArray(data.content || '')
      if (!suggestions.length) throw new Error('AI did not return valid suggestions')
      setAiSuggestions(suggestions.filter(s => s.description && s.action))
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }, [dataset, columns, types])

  const applySuggestion = useCallback((suggestion) => {
    if (!dataset) return
    const before = dataset.length
    let newData = [...dataset]
    switch (suggestion.action) {
      case 'drop_nulls':
        if (suggestion.column) {
          newData = newData.filter(row => !isNullish(row[suggestion.column]))
          addStep(`AI: Dropped rows with nulls in "${suggestion.column}"`, before, newData.length)
        }
        break
      case 'fill_mean': case 'fill_median': case 'fill_mode': {
        const col = suggestion.column; if (!col) break
        const stats = getColumnStats(col); const method = suggestion.action.replace('fill_', '')
        const fillVal = String(stats[method] ?? '')
        newData = newData.map(row => isNullish(row[col]) ? { ...row, [col]: fillVal } : row)
        addStep(`AI: Filled nulls in "${col}" with ${method} (${fillVal})`, before, newData.length)
        break
      }
      case 'remove_duplicates': {
        const seen = new Set()
        newData = newData.filter(row => { const k = JSON.stringify(row); if (seen.has(k)) return false; seen.add(k); return true })
        addStep('AI: Removed duplicate rows', before, newData.length)
        break
      }
      case 'trim_whitespace': {
        let count = 0
        newData = newData.map(row => {
          const r = { ...row }
          for (const col of columns) { if (typeof r[col] === 'string') { const t = r[col].trim(); if (t !== r[col]) { count++; r[col] = t } } }
          return r
        })
        addStep(`AI: Trimmed whitespace (${count} cells)`, before, newData.length)
        break
      }
      case 'find_replace': {
        const col = suggestion.column; if (!col || !suggestion.find) break
        let count = 0
        const regex = new RegExp(suggestion.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        newData = newData.map(row => {
          const val = String(row[col] ?? '')
          if (regex.test(val)) { count++; return { ...row, [col]: val.replace(regex, suggestion.replace || '') } }
          return row
        })
        addStep(`AI: Find & replace in "${col}": "${suggestion.find}" → "${suggestion.replace || ''}" (${count} cells)`, before, newData.length)
        break
      }
    }
    updateDataset(newData)
    setAiSuggestions(prev => prev.filter(s => s !== suggestion))
  }, [dataset, columns, updateDataset, addStep, getColumnStats])

  // ── No data state ──
  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Scissors className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Data Cleaning</h1>
        <p className="text-sm text-text-secondary mb-6">Upload a dataset to start cleaning operations.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Data
          </button>
        </Link>
      </div>
    )
  }

  const nullCountForCol = (col) => dataset.filter(row => isNullish(row[col])).length

  const panels = [
    { id: 'nulls',       Icon: Droplets, title: 'Handle Nulls',       desc: 'Drop or fill null values in a column' },
    { id: 'duplicates',  Icon: Trash2,   title: 'Remove Duplicates',  desc: 'Detect and remove duplicate rows' },
    { id: 'findreplace', Icon: Search,   title: 'Find & Replace',     desc: 'Normalise inconsistent values' },
    { id: 'trim',        Icon: Scissors, title: 'Trim Whitespace',    desc: 'Strip leading/trailing spaces from all text' },
  ]

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Data Cleaning</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {dataset.length.toLocaleString()} rows × {columns.length} columns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <button
            onClick={undoClean}
            disabled={!canUndo}
            title="Undo last clean operation"
            className="p-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redoClean}
            disabled={!canRedo}
            title="Redo"
            className="p-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Operations ── */}
        <div className="lg:col-span-2 space-y-2">
          {panels.map(({ id, Icon, title, desc }) => (
            <div key={id} className="bg-white rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setActivePanel(activePanel === id ? null : id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-brand-blue" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{title}</p>
                  <p className="text-xs text-text-secondary">{desc}</p>
                </div>
                {activePanel === id
                  ? <ChevronUp className="w-4 h-4 text-text-muted shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
                }
              </button>

              {/* Null Handling */}
              {activePanel === 'nulls' && id === 'nulls' && (
                <div className="px-4 pb-4 pt-2 border-t border-border space-y-3 bg-slate-50/40">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1.5">Column</label>
                      <select value={nullCol} onChange={e => setNullCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
                        <option value="">Select column…</option>
                        {columns.map(col => (
                          <option key={col} value={col}>{col} ({nullCountForCol(col)} nulls)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1.5">Action</label>
                      <select value={nullAction} onChange={e => setNullAction(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
                        <option value="drop">Drop rows with nulls</option>
                        <option value="mean">Fill with mean</option>
                        <option value="median">Fill with median</option>
                        <option value="mode">Fill with mode</option>
                        <option value="custom">Fill with custom value</option>
                      </select>
                    </div>
                  </div>
                  {nullAction === 'custom' && (
                    <input type="text" value={nullFillValue} onChange={e => setNullFillValue(e.target.value)} placeholder="Custom fill value…" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent" />
                  )}
                  <button onClick={handleNulls} disabled={!nullCol} className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                    Apply
                  </button>
                </div>
              )}

              {/* Duplicates */}
              {activePanel === 'duplicates' && id === 'duplicates' && (
                <div className="px-4 pb-4 pt-2 border-t border-border bg-slate-50/40">
                  <p className="text-xs text-text-secondary mb-3">Removes rows that are exact duplicates of another row across all columns.</p>
                  <button onClick={removeDuplicates} className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
                    Remove Duplicates
                  </button>
                </div>
              )}

              {/* Find & Replace */}
              {activePanel === 'findreplace' && id === 'findreplace' && (
                <div className="px-4 pb-4 pt-2 border-t border-border space-y-3 bg-slate-50/40">
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">Column</label>
                    <select value={frCol} onChange={e => setFrCol(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent cursor-pointer">
                      <option value="">Select column…</option>
                      {columns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-text-secondary block mb-1.5">Find</label>
                      <input type="text" value={findValue} onChange={e => setFindValue(e.target.value)} placeholder="e.g. easyjet" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted mb-2.5 shrink-0" />
                    <div className="flex-1">
                      <label className="text-xs font-medium text-text-secondary block mb-1.5">Replace with</label>
                      <input type="text" value={replaceValue} onChange={e => setReplaceValue(e.target.value)} placeholder="e.g. EasyJet" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-accent" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                      <input type="checkbox" checked={frCaseSensitive} onChange={e => setFrCaseSensitive(e.target.checked)} className="rounded" />
                      Case sensitive
                    </label>
                    <button onClick={findAndReplace} disabled={!frCol || !findValue} className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                      Replace
                    </button>
                  </div>
                </div>
              )}

              {/* Trim Whitespace */}
              {activePanel === 'trim' && id === 'trim' && (
                <div className="px-4 pb-4 pt-2 border-t border-border bg-slate-50/40">
                  <p className="text-xs text-text-secondary mb-3">Strips leading and trailing spaces from all text values across every column.</p>
                  <button onClick={trimWhitespace} className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
                    Trim All Columns
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* AI Suggestions */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-blue" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">AI Suggestions</p>
                  <p className="text-xs text-text-secondary">Smart cleaning recommendations</p>
                </div>
              </div>
              <button onClick={getAiSuggestions} disabled={aiLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiLoading ? 'Analysing…' : 'Analyse'}
              </button>
            </div>
            <div className="px-4 py-3">
              {aiError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{aiError}</p>
                </div>
              )}
              {aiSuggestions.length === 0 && !aiLoading && !aiError && (
                <p className="text-xs text-text-secondary py-2">Click "Analyse" to get AI-powered cleaning suggestions based on your data profile.</p>
              )}
              {aiSuggestions.length > 0 && (
                <div className="space-y-2">
                  {aiSuggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-slate-50/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.low}`}>
                            {s.priority}
                          </span>
                          {s.column && <span className="text-[10px] text-text-muted font-mono bg-slate-100 px-1.5 py-0.5 rounded">{s.column}</span>}
                        </div>
                        <p className="text-xs text-text-primary leading-relaxed">{s.description}</p>
                      </div>
                      <button onClick={() => applySuggestion(s)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer">
                        <Check className="w-3 h-3" /> Apply
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Steps Log ── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-border overflow-hidden sticky top-8">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <History className="w-4 h-4 text-brand-blue" />
              <h2 className="text-sm font-semibold text-text-primary">Steps Applied</h2>
              {stepsLog.length > 0 && (
                <span className="ml-auto text-[10px] font-mono bg-brand-blue/10 text-brand-blue px-1.5 py-0.5 rounded-full">
                  {stepsLog.length}
                </span>
              )}
            </div>
            {stepsLog.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <History className="w-6 h-6 text-text-muted mx-auto mb-2" />
                <p className="text-xs text-text-secondary">No steps applied yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                {[...stepsLog].reverse().map((step, i) => (
                  <div key={step.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {stepsLog.length - i}
                      </span>
                      <span className="text-[10px] text-text-muted">{step.timestamp}</span>
                    </div>
                    <p className="text-xs text-text-primary leading-relaxed pl-7">{step.description}</p>
                    {step.delta !== 0 && (
                      <p className={`text-[10px] font-mono mt-0.5 pl-7 ${step.delta < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {step.delta < 0 ? `−${Math.abs(step.delta).toLocaleString()}` : `+${step.delta.toLocaleString()}`} rows
                        · {step.rowsAfter.toLocaleString()} remaining
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
