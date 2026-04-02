import { useState, useCallback, useRef, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { getPyodide } from '../../utils/pyodideLoader'
import { AlertCircle, Send, Loader2, Trash2, Copy, Check, MessageSquare, Bot, User, ChevronDown, ChevronUp, Terminal } from 'lucide-react'

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
        const sum = nums.reduce((a, b) => a + b, 0)
        const mean = (sum / nums.length).toFixed(2)
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
    exec(_user_code, {"df": df, "pd": pd, "np": np, "print": print})
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

      {showCode && (
        <pre className="px-3 py-2 bg-gray-950 text-gray-200 font-mono text-[11px] overflow-x-auto whitespace-pre">
          {code}
        </pre>
      )}

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
  'What are the top categories and their distribution?',
  'Are there any outliers or unusual values?',
  'Summarise this dataset in 3 bullet points',
]

export default function DataChat() {
  const { dataset, columns, types, fileName } = useData()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !dataset) return
    const userMsg = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const context = buildDataContext(dataset, columns, types)
    const history = messages.slice(-5)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team.
RULES: Declarative statements only. Every claim must cite a specific figure. No filler, no hedging.

LIVE COMPUTATION AVAILABLE: You have a Python/pandas executor with the FULL ${dataset.length}-row dataset loaded as \`df\`.
- For cross-column filtering, groupby, precise counts, correlations, or any row-level analysis: write a \`\`\`python code block
- Use print() to output results — they will run automatically and be shown to the user
- pandas and numpy are pre-imported; df is already loaded — do not import or reload them
- Column names are EXACT and case-sensitive — use names from the schema below
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
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Chat with Your Data</h1>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12">
          <AlertCircle className="w-8 h-8 text-text-secondary mb-3" />
          <p className="text-sm font-medium text-text-primary">No dataset loaded</p>
          <p className="mt-1 text-xs text-text-secondary">Upload a CSV or Excel file first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-text-primary">Chat with Your Data</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Ask questions about <span className="font-medium text-text-primary">{fileName}</span> — {dataset.length.toLocaleString()} rows × {columns.length} columns · Cross-column queries run Python automatically
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-lg border border-border bg-card-bg mb-4">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <MessageSquare className="w-10 h-10 text-text-secondary/30 mb-4" />
            <p className="text-sm font-medium text-text-primary mb-1">Ask anything about your data</p>
            <p className="text-xs text-text-secondary mb-6 text-center max-w-md">
              The AI sees your full column statistics. For cross-column queries (e.g. "average score by age group"), it writes and runs Python locally against the complete dataset.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-full hover:bg-blue-50 transition-colors cursor-pointer">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((msg, i) => (
              <div key={i} className={`px-5 py-4 ${msg.role === 'assistant' ? 'bg-gray-50/50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-brand-blue text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-text-primary">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                      {msg.role === 'assistant' && (
                        <button onClick={() => copyMessage(msg.content, i)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all cursor-pointer"
                          style={{ opacity: copiedIdx === i ? 1 : undefined }}>
                          {copiedIdx === i ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-text-secondary" />}
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
              </div>
            ))}
            {loading && (
              <div className="px-5 py-4 bg-gray-50/50">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gray-200 text-gray-600">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
                    <span className="text-xs text-text-secondary">Thinking…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="shrink-0 p-2.5 text-text-secondary hover:text-red-500 border border-border rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            title="Clear chat">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 flex border border-border rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-blue/20 focus-within:border-brand-blue">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) sendMessage(input) }}
            placeholder="Ask a question — cross-column queries run Python automatically…"
            disabled={loading}
            className="flex-1 px-4 py-3 text-sm outline-none disabled:opacity-50"
          />
          <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
            className="px-4 text-brand-blue hover:text-brand-blue/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
