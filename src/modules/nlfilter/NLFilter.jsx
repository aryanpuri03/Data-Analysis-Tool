import { useState, useCallback, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { extractJSONObject } from '../../utils/extractJSON'
import { AlertCircle, Search, Loader2, Sparkles, X, Filter, Download } from 'lucide-react'
import Papa from 'papaparse'

export default function NLFilter() {
  const { dataset, columns, types, fileName } = useData()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filterFn, setFilterFn] = useState(null)
  const [filterDesc, setFilterDesc] = useState('')
  const [filterCode, setFilterCode] = useState('')

  const filteredData = useMemo(() => {
    if (!filterFn || !dataset) return null
    try {
      return dataset.filter(filterFn)
    } catch {
      return null
    }
  }, [dataset, filterFn])

  const applyFilter = useCallback(async () => {
    if (!query.trim() || !dataset) return
    setLoading(true)
    setError(null)
    setFilterFn(null)
    setFilterDesc('')

    const colInfo = columns.map(col => {
      const type = types[col] || 'freetext'
      const values = dataset.map(r => r[col]).filter(v => !isNullish(v))
      const samples = values.slice(0, 5).map(v => JSON.stringify(v)).join(', ')
      return `  - "${col}" [${type}]: samples: ${samples}`
    }).join('\n')

    const prompt = `ROLE: Data engineer. Convert the analyst's filter description into a JavaScript row filter. Respond only with the JSON object requested — no explanation, no preamble.

Dataset columns:
${colInfo}

User's filter request: "${query}"

Respond with ONLY a JSON object (no markdown):
{
  "description": "human-readable description of the filter being applied",
  "condition": "a JavaScript expression that takes 'row' as the variable and returns true/false. Access columns via row['column_name']. Use exact column names from above.",
  "matchEstimate": "rough description like 'rows where X' "
}

Rules for the condition:
- Access values via row['column_name'] with exact names
- For string comparisons, use String(row['col'] ?? '').toLowerCase()
- For numeric comparisons, use Number(row['col'])
- Handle nulls: check for null/undefined before comparing
- Return a single boolean expression — no semicolons, no if statements
- For "contains" checks: String(row['col'] ?? '').toLowerCase().includes('search')
- For date comparisons: new Date(row['col']) > new Date('2024-01-01')
- For "top N" or "bottom N": these cannot be done with a row filter, return condition "true" and explain in description that full dataset is shown`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 400 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')

      const result = extractJSONObject(data.content || '')
      if (!result) throw new Error('AI did not return a valid filter')
      if (!result.condition) throw new Error('Missing filter condition')

      const fn = new Function('row', `return (${result.condition})`)
      // Test it on first row
      fn(dataset[0])

      setFilterFn(() => fn)
      setFilterDesc(result.description || query)
      setFilterCode(result.condition)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [query, dataset, columns, types])

  const clearFilter = useCallback(() => {
    setFilterFn(null)
    setFilterDesc('')
    setFilterCode('')
    setQuery('')
    setError(null)
  }, [])

  const exportFiltered = useCallback(() => {
    if (!filteredData) return
    const csv = Papa.unparse(filteredData, { columns })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(fileName || 'data').replace(/\.[^.]+$/, '')}_filtered.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredData, columns, fileName])

  if (!dataset) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Smart Filter</h1>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12">
          <AlertCircle className="w-8 h-8 text-text-secondary mb-3" />
          <p className="text-sm font-medium text-text-primary">No dataset loaded</p>
          <p className="mt-1 text-xs text-text-secondary">Upload a CSV or Excel file first.</p>
        </div>
      </div>
    )
  }

  const displayData = filteredData || dataset
  const previewRows = displayData.slice(0, 30)

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Smart Filter</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Type a filter in plain English — the AI converts it to a query on your data.
        </p>
      </div>

      {/* Search bar */}
      <div className="rounded-lg border border-border bg-card-bg p-4 mb-4">
        <div className="flex gap-2">
          <div className="flex-1 flex border border-border rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-blue/20 focus-within:border-brand-blue">
            <div className="pl-3 flex items-center">
              <Search className="w-4 h-4 text-text-secondary" />
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && query.trim()) applyFilter() }}
              placeholder='e.g. "show me only EasyJet flights from January with rating below 3"'
              className="flex-1 px-3 py-2.5 text-sm outline-none"
            />
            {filterFn && (
              <button onClick={clearFilter} className="px-2 text-text-secondary hover:text-red-500 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={applyFilter}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Filter
          </button>
        </div>

        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[
            `Show rows where ${columns[0]} is not null`,
            columns.find(c => types[c] === 'numeric') ? `${columns.find(c => types[c] === 'numeric')} greater than average` : null,
            columns.find(c => types[c] === 'categorical') ? `Show only the most common ${columns.find(c => types[c] === 'categorical')} value` : null,
          ].filter(Boolean).slice(0, 3).map((s, i) => (
            <button
              key={i}
              onClick={() => { setQuery(s); }}
              className="px-2.5 py-1 text-[11px] text-text-secondary border border-border rounded-full hover:bg-gray-50 hover:text-text-primary transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Active filter banner */}
      {filterFn && filteredData && (
        <div className="flex items-center justify-between rounded-lg border border-brand-blue/30 bg-blue-50 px-4 py-2.5 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-brand-blue" />
            <span className="text-xs font-medium text-brand-blue">{filterDesc}</span>
            <span className="text-xs text-text-secondary">— {filteredData.length.toLocaleString()} of {dataset.length.toLocaleString()} rows</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportFiltered} className="flex items-center gap-1 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-white transition-colors cursor-pointer">
              <Download className="w-3 h-3" /> Export
            </button>
            <button onClick={clearFilter} className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-md hover:bg-red-50 transition-colors cursor-pointer">
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="rounded-xl border border-border bg-card-bg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-gray-50">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {filterFn ? `Filtered results — ${previewRows.length} of ${filteredData.length.toLocaleString()} shown` : `All data — first ${previewRows.length} of ${dataset.length.toLocaleString()} rows`}
          </p>
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-medium text-text-secondary w-10">#</th>
                {columns.map(col => (
                  <th key={col} className="px-3 py-2 text-left text-xs font-medium text-text-primary whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-1.5 text-[10px] text-text-secondary font-mono">{i + 1}</td>
                  {columns.map(col => (
                    <td key={col} className="px-3 py-1.5 text-xs text-text-primary whitespace-nowrap font-mono max-w-[180px] truncate">
                      {isNullish(row[col]) ? <span className="text-text-secondary italic">null</span> : String(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
