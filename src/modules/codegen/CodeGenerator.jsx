import { useState, useCallback, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { AlertCircle, Code, Loader2, Copy, Check, AlertTriangle, ChevronDown, ChevronUp, Play, ImageOff } from 'lucide-react'

function buildSuggestions(columns, types) {
  if (!columns || !columns.length) return []

  const numerics = columns.filter(c => types[c] === 'numeric')
  const cats = columns.filter(c => types[c] === 'categorical')
  const dates = columns.filter(c => types[c] === 'date')

  const suggestions = []

  // Distribution of first numeric
  if (numerics[0]) suggestions.push(`Plot the distribution of "${numerics[0]}" as a histogram`)
  // Bar chart: first categorical by mean of first numeric
  if (cats[0] && numerics[0]) suggestions.push(`Bar chart of average "${numerics[0]}" grouped by "${cats[0]}"`)
  // Top N categories
  if (cats[0]) suggestions.push(`Show the top 10 most frequent values in "${cats[0]}"`)
  // Time series
  if (dates[0] && numerics[0]) suggestions.push(`Line chart of "${numerics[0]}" over time using "${dates[0]}"`)
  // Correlation between two numerics
  if (numerics.length >= 2) suggestions.push(`Scatter plot showing correlation between "${numerics[0]}" and "${numerics[1]}"`)
  // Null summary
  suggestions.push('Print a summary of null counts and fill rates for every column')
  // Cross-tab two categoricals
  if (cats.length >= 2) suggestions.push(`Crosstab of "${cats[0]}" vs "${cats[1]}" as a heatmap`)
  // Month-over-month if date exists
  if (dates[0] && numerics[0]) suggestions.push(`Calculate month-over-month change in "${numerics[0]}"`)

  return suggestions.slice(0, 6)
}

export default function CodeGenerator() {
  const { dataset, columns, types, fileName } = useData()

  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { code, explanation, validation }
  const [copiedCode, setCopiedCode] = useState(false)
  const [showValidation, setShowValidation] = useState(true)
  const [provider, setProvider] = useState(null)

  // Pyodide live execution
  const pyodideRef = useRef(null)
  const [pyStatus, setPyStatus] = useState('idle') // idle | loading | running | done | error
  const [plotSrc, setPlotSrc] = useState(null)
  const [runError, setRunError] = useState(null)

  const loadPyodide = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current

    // Inject the Pyodide script tag once
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js'
        s.onload = resolve
        s.onerror = () => reject(new Error('Failed to load Pyodide from CDN'))
        document.head.appendChild(s)
      })
    }

    const py = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
    })
    await py.loadPackage(['pandas', 'matplotlib', 'numpy'])
    pyodideRef.current = py
    return py
  }, [])

  const runCode = useCallback(async () => {
    if (!result?.code || !dataset) return
    setPlotSrc(null)
    setRunError(null)
    setPyStatus('loading')
    // Small delay so React flushes the cleared state before heavy work starts
    await new Promise(r => setTimeout(r, 50))

    try {
      const py = await loadPyodide()
      setPyStatus('running')

      // Strip micropip calls — all needed packages are pre-loaded
      const cleanCode = result.code
        .split('\n')
        .filter(l => !/^\s*import micropip/.test(l) && !/micropip\.install/.test(l))
        .join('\n')

      // Pass dataset as JSON string — safe cross-language transfer
      py.globals.set('_records_json', JSON.stringify(dataset))

      const wrapper = `
import io, base64, json
import pandas as pd
import numpy as np

# ── load dataset ──
df = pd.DataFrame(json.loads(_records_json))

# Auto-coerce columns to numeric where the data allows it
for _c in df.columns:
    try:
        df[_c] = pd.to_numeric(df[_c])
    except (ValueError, TypeError):
        pass  # keep as string/object

# ── matplotlib setup (safe to call after import) ──
import matplotlib
import matplotlib.pyplot as plt
plt.switch_backend('Agg')   # works even if pyplot already imported
plt.close('all')
_orig_show = plt.show
plt.show = lambda *a, **kw: None  # suppress interactive show

# ── generated code ──
${cleanCode}
# ── end generated code ──

plt.show = _orig_show

# ── capture any open figures ──
_plot_b64 = ""
_open_figs = [plt.figure(n) for n in plt.get_fignums()]
if _open_figs:
    _buf = io.BytesIO()
    _open_figs[-1].savefig(_buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    _buf.seek(0)
    _plot_b64 = base64.b64encode(_buf.read()).decode()
    plt.close('all')
`
      await py.runPythonAsync(wrapper)
      const b64 = py.globals.get('_plot_b64')

      if (b64) {
        setPlotSrc(`data:image/png;base64,${b64}`)
        setPyStatus('done')
      } else {
        setRunError('Code executed without errors but produced no chart.\n\nMake sure the code creates a matplotlib figure (e.g. plt.plot(...), plt.bar(...), df.plot(...)).')
        setPyStatus('error')
      }
    } catch (err) {
      // Clean up the Pyodide traceback to show just the useful part
      const msg = err.message || String(err)
      const traceStart = msg.indexOf('File "<exec>"')
      const clean = traceStart !== -1 ? msg.slice(traceStart) : msg
      setRunError(clean)
      setPyStatus('error')
    }
  }, [result, dataset, loadPyodide])

  // Build a tight schema string for the AI
  const buildSchema = useCallback(() => {
    if (!dataset || !columns) return ''
    const colInfo = columns.map(col => {
      const type = types[col] || 'freetext'
      const values = dataset.map(r => r[col]).filter(v => !isNullish(v))
      const nullCount = dataset.length - values.length

      let detail = `  "${col}": ${type}`
      if (nullCount > 0) detail += ` (${nullCount} nulls)`

      if (type === 'numeric') {
        const nums = values.map(v => Number(String(v).replace(/,/g, ''))).filter(isFinite).sort((a, b) => a - b)
        if (nums.length) {
          detail += ` — range [${nums[0]}, ${nums[nums.length - 1]}], e.g. ${nums.slice(0, 3).join(', ')}`
        }
      } else if (type === 'categorical') {
        const freq = {}
        values.forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => `"${v}"`).join(', ')
        detail += ` — values: ${top}`
      } else if (type === 'date') {
        const dates = values.map(v => String(v).trim()).sort()
        detail += ` — e.g. "${dates[0]}", "${dates[dates.length - 1]}"`
      } else {
        const sample = values.slice(0, 3).map(v => `"${String(v).slice(0, 40)}"`).join(', ')
        detail += ` — e.g. ${sample}`
      }
      return detail
    }).join('\n')

    return `File: "${fileName || 'data.csv'}" — ${dataset.length} rows, ${columns.length} columns\n\nColumns:\n${colInfo}`
  }, [dataset, columns, types, fileName])

  // Client-side validation: find df['col'] / df["col"] references that don't exist in the schema
  const validateCode = useCallback((code) => {
    const issues = []
    const referenced = [...code.matchAll(/df\[['"](.+?)['"]\]/g)].map(m => m[1])
    const unknown = referenced.filter(col => !columns.includes(col))
    if (unknown.length) {
      unknown.forEach(col => issues.push(`Column "${col}" not found in dataset — check spelling and casing`))
    }
    return { passed: issues.length === 0, issues }
  }, [columns])

  const generate = useCallback(async () => {
    if (!request.trim() || !dataset) return
    setLoading(true)
    setError(null)
    setResult(null)
    setPlotSrc(null)
    setRunError(null)
    setPyStatus('idle')
    setProvider(null)

    const schema = buildSchema()

    const prompt = `ROLE: Senior data analyst and Python developer, Edinburgh Airport CX team.

TASK: Write complete, runnable Python/pandas code for the request below.

DATASET SCHEMA:
${schema}

REQUEST: "${request}"

RULES:
- The dataset is already loaded as a pandas DataFrame named \`df\` with the exact columns listed above.
- Use only pandas, numpy, and matplotlib. Never import micropip, seaborn, or any package not in this list.
- Charts: figure size (12, 6), clear title, axis labels, legend, plt.tight_layout(), plt.show().
- Handle nulls with dropna() or fillna() where needed.
- Add a short comment on each logical block.
- Do NOT wrap the code in markdown backtick fences.
- Do NOT add any text before ###CODE.

Your response MUST use this exact format — nothing else:

###CODE
# complete Python code here
###EXPLANATION
One short paragraph explaining what the code does.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 2000,
          systemPrompt: 'You are an expert Python developer. Output ONLY the ###CODE and ###EXPLANATION sections. Never add text before ###CODE. Never use backtick fences inside the code block.',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      if (data.provider) setProvider(data.provider)

      const text = (data.content || '').trim()

      let code = ''
      let explanation = ''

      // Primary: ###CODE / ###EXPLANATION delimiters
      const delimCode = text.match(/###CODE\s*([\s\S]*?)(?:###EXPLANATION|###|$)/)
      const delimExp  = text.match(/###EXPLANATION\s*([\s\S]*)$/)

      // Fallback 1: ```python fences
      const fenceCode = text.match(/```(?:python|py)?\s*\n?([\s\S]*?)```/)

      if (delimCode?.[1]?.trim()) {
        code = delimCode[1].trim()
        explanation = delimExp?.[1]?.trim() || ''
      } else if (fenceCode?.[1]?.trim()) {
        code = fenceCode[1].trim()
        const afterFence = text.slice(text.lastIndexOf('```') + 3).trim()
        explanation = afterFence || ''
      } else {
        // Last resort: strip common preamble phrases and treat rest as code
        code = text.replace(/^(Here is|Here's|This code|Below is)[^\n]*\n/i, '').trim()
      }

      // Strip any stray backtick fences a model may have added inside the delimiter block
      code = code.replace(/^```(?:python|py)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
      explanation = explanation.trim() || `Python code for: ${request}`

      if (!code) throw new Error('No code was returned. Try rephrasing your request.')

      const validation = validateCode(code)
      setResult({ code, explanation, validation })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [request, dataset, buildSchema, validateCode])

  const copyCode = useCallback(async () => {
    if (!result?.code) return
    try { await navigator.clipboard.writeText(result.code) } catch {
      const ta = document.createElement('textarea')
      ta.value = result.code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }, [result])

  if (!dataset) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Code Generator</h1>
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">Code Generator</h1>
          {provider && (
            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${
              provider === 'ollama' ? 'bg-emerald-100 text-emerald-700' :
              provider === 'gemini' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {provider === 'ollama' ? 'DeepSeek (local)' : provider === 'gemini' ? 'Gemini' : provider}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Describe what you want to analyse or visualise. AI writes Python/pandas code validated against your actual dataset schema.
        </p>
      </div>

      {/* Request input */}
      <div className="rounded-lg border border-border bg-card-bg p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Code className="w-4 h-4 text-brand-blue" />
          <p className="text-sm font-semibold text-text-primary">What do you need?</p>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={request}
            onChange={e => setRequest(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && request.trim() && !loading) generate() }}
            placeholder='e.g. "Give me Python code to calculate LTV using this dataset"'
            className="flex-1 text-sm border border-border rounded-lg px-3 py-2.5"
          />
          <button
            onClick={generate}
            disabled={loading || !request.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {/* Dynamic suggestions based on loaded dataset */}
        {buildSuggestions(columns, types).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {buildSuggestions(columns, types).map((ex, i) => (
              <button
                key={i}
                onClick={() => setRequest(ex)}
                className="px-2.5 py-1 text-[11px] text-text-secondary border border-border rounded-full hover:bg-gray-50 hover:text-text-primary transition-colors cursor-pointer"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Validation banner */}
          <div
            className={`rounded-lg border px-4 py-3 cursor-pointer ${
              result.validation?.passed === false
                ? 'border-amber-200 bg-amber-50'
                : 'border-green-200 bg-green-50'
            }`}
            onClick={() => setShowValidation(v => !v)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.validation?.passed === false
                  ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                  : <Check className="w-4 h-4 text-green-600" />
                }
                <p className={`text-xs font-semibold ${result.validation?.passed === false ? 'text-amber-800' : 'text-green-800'}`}>
                  {result.validation?.passed === false
                    ? `Validation: ${result.validation.issues?.length || 1} issue${(result.validation.issues?.length || 1) > 1 ? 's' : ''} detected`
                    : 'Validation passed — code references valid columns and types'
                  }
                </p>
              </div>
              {showValidation
                ? <ChevronUp className="w-3.5 h-3.5 text-text-secondary" />
                : <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
              }
            </div>
            {showValidation && result.validation?.issues?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.validation.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="mt-0.5">•</span>{issue}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Explanation */}
          <div className="rounded-lg border border-border bg-card-bg p-4">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">What this code does</p>
            <p className="text-sm text-text-primary leading-relaxed">{result.explanation}</p>
          </div>

          {/* Code block */}
          <div className="rounded-lg border border-border bg-card-bg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-gray-900">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="text-xs text-gray-400 font-mono ml-1">analysis.py</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={runCode}
                  disabled={pyStatus === 'loading' || pyStatus === 'running'}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-emerald-400 hover:text-white border border-emerald-700 rounded-md hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pyStatus === 'loading' || pyStatus === 'running'
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Play className="w-3 h-3" />}
                  {pyStatus === 'loading' ? 'Loading Python…' : pyStatus === 'running' ? 'Running…' : 'Run'}
                </button>
              </div>
            </div>
            <div className="bg-gray-950 overflow-x-auto">
              <pre className="px-5 py-4 text-xs leading-relaxed text-gray-200 font-mono whitespace-pre">
                {result.code}
              </pre>
            </div>
          </div>

          {/* Plot output */}
          {pyStatus === 'loading' && (
            <div className="rounded-lg border border-border bg-card-bg p-6 text-center">
              <Loader2 className="w-5 h-5 text-brand-blue animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">Loading Python runtime…</p>
              <p className="text-xs text-text-secondary mt-1">Downloading pandas + matplotlib (~25 MB, first run only)</p>
            </div>
          )}
          {pyStatus === 'running' && (
            <div className="rounded-lg border border-border bg-card-bg p-6 text-center">
              <Loader2 className="w-5 h-5 text-brand-blue animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">Executing code…</p>
            </div>
          )}
          {runError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <ImageOff className="w-4 h-4 text-red-500" />
                <p className="text-xs font-semibold text-red-700">Runtime Error</p>
              </div>
              <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{runError}</pre>
            </div>
          )}
          {plotSrc && (
            <div className="rounded-lg border border-border bg-card-bg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-gray-50">
                <p className="text-xs font-semibold text-text-primary">Plot Output</p>
                <a
                  href={plotSrc}
                  download="plot.png"
                  className="text-xs text-brand-blue hover:underline cursor-pointer"
                >
                  Download PNG
                </a>
              </div>
              <div className="p-4 bg-white">
                <img src={plotSrc} alt="Generated plot" className="w-full h-auto rounded" />
              </div>
            </div>
          )}

          {/* Schema reference */}
          <details className="rounded-lg border border-border bg-card-bg overflow-hidden">
            <summary className="px-4 py-3 text-xs font-medium text-text-secondary cursor-pointer hover:text-text-primary hover:bg-gray-50 transition-colors">
              Dataset schema used for validation
            </summary>
            <pre className="px-4 py-3 text-xs text-text-secondary font-mono whitespace-pre-wrap border-t border-border bg-gray-50/50">
              {buildSchema()}
            </pre>
          </details>
        </div>
      )}

      {/* Info */}
      {!result && !loading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-800">
            <strong>How it works:</strong> Describe your analysis in plain English. The AI generates complete, runnable Python/pandas code using your exact column names and types, then validates it against your schema before returning. Copy the code into Jupyter, VS Code, or any Python environment.
          </p>
        </div>
      )}
    </div>
  )
}
