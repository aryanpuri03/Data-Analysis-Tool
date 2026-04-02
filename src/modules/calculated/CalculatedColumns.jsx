import { useState, useCallback } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { extractJSONObject } from '../../utils/extractJSON'
import { AlertCircle, Plus, Loader2, Sparkles, Trash2, Check } from 'lucide-react'

const EXAMPLES = [
  'Create a column "nps_category" that labels values in nps_score: 9-10 = "Promoter", 7-8 = "Passive", 0-6 = "Detractor"',
  'Add a column "full_name" by combining first_name and last_name with a space',
  'Create a "year" column extracted from the date column',
  'Add a "is_high_value" column that is true when revenue > 1000',
  'Create a "rating_bucket" column: 1-2 = "Poor", 3 = "Average", 4-5 = "Good"',
]

export default function CalculatedColumns() {
  const { dataset, columns, types, updateDataset } = useData()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null) // { columnName, sampleValues, formula }
  const [addedCols, setAddedCols] = useState([])

  const generateColumn = useCallback(async () => {
    if (!prompt.trim() || !dataset) return
    setLoading(true)
    setError(null)
    setPreview(null)

    // Build column context
    const colInfo = columns.map(col => {
      const type = types[col] || 'freetext'
      const values = dataset.map(r => r[col]).filter(v => !isNullish(v))
      const samples = values.slice(0, 5).map(v => JSON.stringify(v)).join(', ')
      return `  - "${col}" [${type}]: sample values: ${samples}`
    }).join('\n')

    const aiPrompt = `ROLE: Data engineer. Generate a calculated column formula based on the user's specification. Respond only with the JSON object requested — no explanation, no preamble.

Dataset: ${dataset.length} rows, ${columns.length} columns.
Existing columns:
${colInfo}

User request: "${prompt}"

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "columnName": "the_new_column_name",
  "description": "what the column represents",
  "formula": "a JavaScript arrow function body that takes a row object and returns the new value. Use row['column_name'] to access values. The function body should be a single expression (no semicolons, no return statement). Example: row['price'] * row['quantity']"
}

Important rules for the formula:
- Access columns via row['column_name'] with exact column names from the list above
- Return primitive values (string, number, boolean, null)
- Handle null/undefined values gracefully (use ?? or ternary)
- For categorization, use ternary chains: condition1 ? 'A' : condition2 ? 'B' : 'C'
- For string operations: String(row['col'] ?? '').trim()
- For numeric operations: Number(row['col']) or parseFloat(row['col'])
- Do NOT use if/else, switch, semicolons, or multi-statement logic`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, maxTokens: 500 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')

      const result = extractJSONObject(data.content || '')
      if (!result) throw new Error('AI did not return valid JSON')
      if (!result.columnName || !result.formula) throw new Error('Missing columnName or formula in response')

      // Test the formula on first 5 rows
      const fn = new Function('row', `return (${result.formula})`)
      const sampleValues = dataset.slice(0, 8).map(row => {
        try { return fn(row) } catch { return '⚠ Error' }
      })

      setPreview({ ...result, sampleValues, fn })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [prompt, dataset, columns, types])

  const applyColumn = useCallback(() => {
    if (!preview || !dataset) return
    try {
      const fn = new Function('row', `return (${preview.formula})`)
      const newData = dataset.map(row => ({ ...row, [preview.columnName]: fn(row) }))
      updateDataset(newData)
      setAddedCols(prev => [...prev, { name: preview.columnName, description: preview.description }])
      setPreview(null)
      setPrompt('')
    } catch (err) {
      setError(`Failed to apply: ${err.message}`)
    }
  }, [preview, dataset, updateDataset])

  const removeColumn = useCallback((colName) => {
    if (!dataset) return
    const newData = dataset.map(row => {
      const r = { ...row }
      delete r[colName]
      return r
    })
    updateDataset(newData)
    setAddedCols(prev => prev.filter(c => c.name !== colName))
  }, [dataset, updateDataset])

  if (!dataset) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Calculated Columns</h1>
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Calculated Columns</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Describe a new column in plain English — the AI generates the formula and adds it to your dataset.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-lg border border-border bg-card-bg p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-brand-blue" />
          <p className="text-sm font-semibold text-text-primary">Describe your new column</p>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && prompt.trim()) generateColumn() }}
            placeholder='e.g. "Create a column that categorises age into Young, Middle, Senior"'
            className="flex-1 text-sm border border-border rounded-lg px-3 py-2.5"
          />
          <button
            onClick={generateColumn}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {/* Example prompts */}
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.filter(e => {
            const lower = e.toLowerCase()
            return columns.some(c => lower.includes(c.toLowerCase())) || true
          }).slice(0, 3).map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              className="px-2.5 py-1 text-[11px] text-text-secondary border border-border rounded-full hover:bg-gray-50 hover:text-text-primary transition-colors cursor-pointer"
            >
              {ex.length > 60 ? ex.slice(0, 60) + '…' : ex}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="rounded-lg border-2 border-brand-blue/30 bg-blue-50/30 p-5 mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">Preview: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-brand-blue">{preview.columnName}</code></p>
              <p className="text-xs text-text-secondary mt-0.5">{preview.description}</p>
            </div>
            <button
              onClick={applyColumn}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" /> Add Column
            </button>
          </div>
          <p className="text-[11px] text-text-secondary font-mono mb-2">Formula: {preview.formula}</p>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-text-secondary border-b border-border">Row</th>
                  {columns.slice(0, 4).map(c => (
                    <th key={c} className="px-3 py-1.5 text-left font-medium text-text-secondary border-b border-border">{c}</th>
                  ))}
                  <th className="px-3 py-1.5 text-left font-semibold text-brand-blue border-b border-brand-blue/30 bg-blue-50">{preview.columnName}</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleValues.map((val, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-text-secondary font-mono border-b border-border">{i + 1}</td>
                    {columns.slice(0, 4).map(c => (
                      <td key={c} className="px-3 py-1.5 text-text-primary border-b border-border">{String(dataset[i]?.[c] ?? '')}</td>
                    ))}
                    <td className="px-3 py-1.5 font-semibold text-brand-blue border-b border-brand-blue/30 bg-blue-50">{String(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Added columns log */}
      {addedCols.length > 0 && (
        <div className="rounded-lg border border-border bg-card-bg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gray-50">
            <p className="text-sm font-medium text-text-primary">Added Columns ({addedCols.length})</p>
          </div>
          <div className="divide-y divide-border">
            {addedCols.map((col, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <code className="text-xs font-semibold text-brand-blue bg-blue-50 px-1.5 py-0.5 rounded">{col.name}</code>
                  <span className="text-xs text-text-secondary ml-2">{col.description}</span>
                </div>
                <button
                  onClick={() => removeColumn(col.name)}
                  className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                  title="Remove column"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mt-6">
        <p className="text-xs text-blue-800">
          <strong>How it works:</strong> Describe what you want in plain English. The AI generates a JavaScript formula, you preview the results on your data, then click "Add Column" to apply it. The formula runs entirely in your browser.
        </p>
      </div>
    </div>
  )
}
