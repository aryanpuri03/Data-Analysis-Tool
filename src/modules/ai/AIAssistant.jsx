import { useState, useCallback, useRef, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import { buildInsightPrompt } from '../../utils/buildInsightPrompt'
import { isNullish } from '../../utils/inferTypes'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { getPyodide } from '../../utils/pyodideLoader'
import { AlertCircle, Send, Loader2, Trash2, Copy, Check, Bot, User, Sparkles, Upload, ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import { Link } from 'react-router-dom'

function buildDataContext(dataset, columns, types) {
  if (!dataset || !columns) return ''
  const colSummaries = columns.map(col => {
    const type = types[col] || 'freetext'
    const values = dataset.map(r => r[col])
    const nonNull = values.filter(v => !isNullish(v))
    const nullCount = values.length - nonNull.length
    let info = `"${col}" [${type}], ${nullCount} nulls`

    if (type === 'numeric') {
      const nums = nonNull.map(v => Number(String(v).replace(/,/g, ''))).filter(isFinite).sort((a, b) => a - b)
      if (nums.length) {
        const mean = (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
        const mid = Math.floor(nums.length / 2)
        const median = nums.length % 2 === 0 ? ((nums[mid - 1] + nums[mid]) / 2).toFixed(2) : nums[mid].toFixed(2)
        info += `, min=${nums[0]}, max=${nums[nums.length - 1]}, mean=${mean}, median=${median}`
      }
    } else if (type === 'categorical') {
      const freq = {}
      nonNull.forEach(v => { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 })
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
      const top = sorted.slice(0, 50)
      info += `, ${Object.keys(freq).length} unique, all: ${top.map(([v, c]) => `"${v}"(${c})`).join(', ')}`
    } else if (type === 'date') {
      const dates = nonNull.map(v => Date.parse(String(v))).filter(ts => !isNaN(ts)).sort((a, b) => a - b)
      if (dates.length) info += `, range: ${new Date(dates[0]).toISOString().split('T')[0]} to ${new Date(dates[dates.length - 1]).toISOString().split('T')[0]}`
    } else {
      const sample = nonNull.slice(0, 3).map(v => `"${String(v).slice(0, 60)}"`)
      info += `, e.g. ${sample.join(', ')}`
    }
    return `  - ${info}`
  }).join('\n')

  const MAX_CELLS = 3000
  const maxRows = Math.max(5, Math.min(300, Math.floor(MAX_CELLS / Math.max(1, columns.length))))
  const rowsToSend = dataset.slice(0, maxRows)
  const rowsLabel = dataset.length <= maxRows
    ? `All ${dataset.length} rows`
    : `Sample rows (first ${maxRows} of ${dataset.length} — column stats above cover the full dataset)`

  const sampleRows = rowsToSend.map((row, i) => {
    const vals = columns.map(c => `${c}=${JSON.stringify(row[c])}`)
    return `  Row ${i + 1}: ${vals.join(', ')}`
  }).join('\n')

  return `Dataset: ${dataset.length} rows, ${columns.length} columns.\n\nColumns:\n${colSummaries}\n\n${rowsLabel}:\n${sampleRows}`
}

function extractPythonCode(text) {
  const m = text.match(/```python\s*([\s\S]*?)```/)
  return m?.[1]?.trim() || null
}

function stripPythonBlock(text) {
  return text.replace(/```python[\s\S]*?```/g, '').trim()
}

async function runComputation(code, dataset, onUpdate) {
  try {
    onUpdate({ status: 'loading-pyodide' })
    const py = await getPyodide()
    onUpdate({ status: 'running' })

    py.globals.set('_records_json', JSON.stringify(dataset))
    py.globals.set('_user_code', code)

    await py.runPythonAsync(`
import sys, io, json
import pandas as pd
import numpy as np

_buf = io.StringIO()
sys.stdout = _buf
try:
    df = pd.DataFrame(json.loads(_records_json))
    for _c in df.columns:
        try:
            df[_c] = pd.to_numeric(df[_c])
        except Exception:
            pass

    def find_col(df, term):
        """Fuzzy-match a natural language term to the closest column name."""
        t = str(term).lower().strip()
        cols = list(df.columns)
        # 1. Exact (case-insensitive)
        for c in cols:
            if c.lower() == t:
                return c
        # 2. All keywords present
        kws = [w for w in t.split() if len(w) > 2]
        if kws:
            full = [c for c in cols if all(k in c.lower() for k in kws)]
            if full:
                return min(full, key=len)
        # 3. Score by keyword hits
        if kws:
            scored = sorted(
                [(sum(1 for k in kws if k in c.lower()), -len(c), c)
                 for c in cols if any(k in c.lower() for k in kws)],
                reverse=True
            )
            if scored:
                return scored[0][2]
        # 4. Single-word substring
        matches = [c for c in cols if t in c.lower()]
        return min(matches, key=len) if matches else None

    exec(_user_code, {"df": df, "pd": pd, "np": np, "print": print, "find_col": find_col})
except Exception as _e:
    print(f"Error: {_e}")
finally:
    sys.stdout = sys.__stdout__
    _output = _buf.getvalue()
`)
    const output = (py.globals.get('_output') || '').trim() || '(no output printed)'
    onUpdate({ status: 'done', output })
  } catch (err) {
    const msg = err.message || String(err)
    const traceStart = msg.indexOf('File "<exec>"')
    onUpdate({ status: 'error', error: traceStart !== -1 ? msg.slice(traceStart) : msg })
  }
}

function ComputeBlock({ compute, code }) {
  const [showCode, setShowCode] = useState(false)

  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden text-xs">
      {/* Status bar */}
      <div className={`flex items-center gap-2 px-3 py-2 ${
        compute.status === 'done' ? 'bg-emerald-50 border-b border-emerald-200' :
        compute.status === 'error' ? 'bg-red-50 border-b border-red-200' :
        'bg-slate-50 border-b border-border'
      }`}>
        {(compute.status === 'loading-pyodide' || compute.status === 'running') && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue shrink-0" />
        )}
        {compute.status === 'done' && <Terminal className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
        {compute.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
        <span className={`font-medium ${
          compute.status === 'done' ? 'text-emerald-700' :
          compute.status === 'error' ? 'text-red-600' :
          'text-slate-600'
        }`}>
          {compute.status === 'loading-pyodide' && 'Loading Python runtime…'}
          {compute.status === 'running' && 'Running computation on full dataset…'}
          {compute.status === 'done' && 'Computed result'}
          {compute.status === 'error' && 'Computation error'}
        </span>
        <button
          onClick={() => setShowCode(v => !v)}
          className="ml-auto flex items-center gap-1 text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          {showCode ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showCode ? 'Hide code' : 'View code'}
        </button>
      </div>

      {/* Code (collapsible) */}
      {showCode && (
        <pre className="px-3 py-2 bg-gray-950 text-gray-200 font-mono text-[11px] overflow-x-auto whitespace-pre">
          {code}
        </pre>
      )}

      {/* Output */}
      {compute.status === 'done' && (
        <pre className="px-3 py-2.5 bg-white text-emerald-900 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
          {compute.output}
        </pre>
      )}
      {compute.status === 'error' && (
        <pre className="px-3 py-2.5 bg-red-50 text-red-700 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
          {compute.error}
        </pre>
      )}
    </div>
  )
}

const SUGGESTED_QUESTIONS = [
  'What are the key patterns in this data?',
  'Which columns have the most missing values?',
  'Summarise this dataset in 3 bullet points',
  'Are there any outliers or unusual values?',
  'What are the top categories and their distribution?',
]

const PROVIDER_LABELS = {
  ollama: 'Local (Ollama)', groq: 'Groq (free)', gemini: 'Gemini (free)',
  nvidia: 'NVIDIA', openai: 'OpenAI', anthropic: 'Claude',
}
const PROVIDER_COLORS = {
  ollama: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  groq: 'bg-orange-50 text-orange-700 border-orange-200',
  gemini: 'bg-blue-50 text-blue-700 border-blue-200',
  nvidia: 'bg-green-50 text-green-700 border-green-200',
  openai: 'bg-violet-50 text-violet-700 border-violet-200',
  anthropic: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default function AIAssistant() {
  const { dataset, columns, types, fileName, dataStats } = useData()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [activeProvider, setActiveProvider] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const autoAnalyse = useCallback(async () => {
    if (!dataset) return
    setLoading(true)
    const prompt = buildInsightPrompt(dataset, columns, types, fileName, '')
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1500 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      if (data.provider) setActiveProvider(data.provider)
      setMessages([{ role: 'assistant', content: data.content || 'No response received.', isAnalysis: true }])
    } catch (err) {
      setMessages([{ role: 'assistant', content: `Error: ${err.message}`, isError: true }])
    } finally {
      setLoading(false)
    }
  }, [dataset, columns, types, fileName])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !dataset) return
    const userMsg = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    inputRef.current?.focus()

    const context = buildDataContext(dataset, columns, types)
    const history = newMessages.slice(-7, -1)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team.
RULES: Declarative statements only. Cite specific figures. No filler, no hedging.

LIVE COMPUTATION AVAILABLE: You have a Python/pandas executor with the FULL ${dataset.length}-row dataset loaded as \`df\`.
- Column names are full survey questions (e.g. "What age group do you fall into?"). Users will refer to them in shorthand ("age", "satisfaction", "rating") — you must map them to the correct column.
- A helper \`find_col(df, 'term')\` is available: it fuzzy-matches a natural language term to the closest column name. ALWAYS use it instead of hardcoding column names.
  Example: age_col = find_col(df, 'age')  →  returns "What age group do you fall into?"
           print(df[age_col].value_counts())
- For cross-column filtering, groupby, precise counts, correlations, or any row-level analysis: write a \`\`\`python code block
- Use print() to output results — they run automatically and appear to the user
- pandas and numpy are pre-imported; df is already loaded — do not import or reload them
- If the question IS answerable from the column stats below: answer directly without code

USER QUESTION:
${text.trim()}

DATASET CONTEXT:
${context}

CONVERSATION HISTORY:
${history}

Answer the USER QUESTION. For cross-column or row-level queries, write a \`\`\`python code block.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1500 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      if (data.provider) setActiveProvider(data.provider)

      const content = data.content || 'No response received.'
      const code = extractPythonCode(content)

      const assistantMsg = {
        role: 'assistant',
        content,
        compute: code ? { status: 'loading-pyodide' } : undefined,
        computeCode: code || undefined,
      }
      setMessages(prev => [...prev, assistantMsg])

      if (code) {
        await runComputation(code, dataset, (update) => {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.computeCode) {
              updated[updated.length - 1] = { ...last, compute: { ...last.compute, ...update } }
            }
            return updated
          })
        })
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, isError: true }])
    } finally {
      setLoading(false)
    }
  }, [dataset, columns, types, messages])

  const copyMessage = useCallback(async (text, idx) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }, [])

  if (!dataset) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Bot className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-1">AI Assistant</h1>
        <p className="text-sm text-text-secondary mb-6">Upload a dataset to start asking questions about your data.</p>
        <Link to="/upload">
          <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />Upload Data
          </button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3rem)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-text-primary">AI Assistant</h1>
              {activeProvider && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PROVIDER_COLORS[activeProvider] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {PROVIDER_LABELS[activeProvider] || activeProvider}
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {fileName} {dataStats && `· ${dataStats.rowCount.toLocaleString()} rows × ${dataStats.columnCount} cols`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={autoAnalyse}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading && messages.length === 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Auto-Analyse
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-2 text-text-secondary hover:text-red-500 border border-border rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-border bg-white mb-3 min-h-0">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">Ask anything about your data</p>
            <p className="text-xs text-text-secondary mb-6 max-w-sm">
              Click <strong>Auto-Analyse</strong> for an instant overview, or ask a question. Cross-column queries run Python automatically against the full dataset.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-xs font-medium text-brand-blue border border-brand-blue/25 rounded-full bg-blue-50/50 hover:bg-blue-100 transition-colors cursor-pointer">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 px-5 py-4 ${msg.role === 'assistant' ? 'bg-slate-50/60' : ''}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
                  msg.role === 'user' ? 'bg-brand-blue' : 'bg-white border border-border'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-3.5 h-3.5 text-white" />
                    : <Bot className="w-3.5 h-3.5 text-slate-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-text-primary">
                      {msg.role === 'user' ? 'You' : msg.isAnalysis ? 'Dataset Summary' : 'AI Assistant'}
                    </span>
                    {msg.role === 'assistant' && (
                      <button onClick={() => copyMessage(msg.content, i)}
                        className="ml-auto p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer opacity-60 hover:opacity-100">
                        {copiedIdx === i ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      </button>
                    )}
                  </div>
                  <div className={`text-sm leading-relaxed ${msg.isError ? 'text-red-600' : 'text-text-primary'}`}>
                    {msg.role === 'assistant' && !msg.isError
                      ? renderMarkdown(msg.computeCode ? stripPythonBlock(msg.content) : msg.content)
                      : msg.content}
                  </div>
                  {msg.computeCode && (
                    <ComputeBlock compute={msg.compute || { status: 'loading-pyodide' }} code={msg.computeCode} />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 px-5 py-4 bg-slate-50/60">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-white border border-border">
                  <Bot className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex items-center gap-1.5 pt-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 border border-border rounded-xl bg-white px-4 py-2.5 focus-within:border-brand-accent focus-within:ring-2 focus-within:ring-brand-accent/15 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) sendMessage(input) }}
            placeholder="Ask a question — cross-column queries run Python automatically…"
            disabled={loading}
            className="flex-1 text-sm outline-none bg-transparent disabled:opacity-50 placeholder:text-text-muted"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-text-muted text-center mt-1.5">Column stats cover 100% of data · Cross-column queries run Python locally in your browser</p>
    </div>
  )
}
