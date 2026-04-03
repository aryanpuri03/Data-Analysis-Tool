import { useState, useCallback, useRef, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import { buildInsightPrompt } from '../../utils/buildInsightPrompt'
import { isNullish } from '../../utils/inferTypes'
import { computeProfile } from '../../utils/computeProfile'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { AlertCircle, Send, Loader2, Trash2, Copy, Check, Bot, User, Sparkles, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'

function findRelevantColumns(question, columns) {
  const words = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  if (!words.length) return []
  return columns
    .map(col => ({ col, score: words.reduce((s, w) => s + (col.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.col)
    .slice(0, 12)
}

function formatColStats(col, colStat, allValues, total) {
  if (!colStat) return `  - "${col}": no data`
  const { type, nullCount } = colStat
  const nullPct = ((nullCount / total) * 100).toFixed(1)
  let line = `  - "${col}" [${type}], ${nullPct}% null`

  if (type === 'numeric') {
    const { min, max, mean, median, stdDev } = colStat
    line += `, min=${min}, max=${max}, mean=${mean}, median=${median}, stdDev=${stdDev}`
  } else if (type === 'categorical') {
    const dist = allValues[col]
    if (dist) {
      const nonNullTotal = total - nullCount
      const entries = Object.entries(dist).sort((a, b) => b[1] - a[1])
      const formatted = entries.map(([v, c]) => `"${v}"(${c}, ${((c / nonNullTotal) * 100).toFixed(1)}%)`).join(', ')
      line += `, ${entries.length} values: ${formatted}`
    }
  } else if (type === 'date') {
    const { earliest, latest } = colStat
    line += `, range: ${earliest} to ${latest}`
  } else {
    line += `, ${colStat.uniqueCount} unique values`
  }
  return line
}

function buildDataContext(dataset, columns, types, question = '') {
  if (!dataset || !columns) return ''

  const allValues = {}
  for (const col of columns) {
    if ((types[col] || 'freetext') === 'categorical') {
      const freq = {}
      dataset.forEach(r => {
        const v = r[col]
        if (!isNullish(v)) { const s = String(v).trim(); freq[s] = (freq[s] || 0) + 1 }
      })
      allValues[col] = freq
    }
  }

  const { columnStats } = computeProfile(dataset, columns, types)
  const relevant = question ? findRelevantColumns(question, columns) : []
  const buildSummary = col => formatColStats(col, columnStats[col], allValues, dataset.length)

  let ctx = `Dataset: ${dataset.length} rows, ${columns.length} columns.\n`
  ctx += `Column names are full survey questions — match user shorthand to the correct column using context.\n\n`

  if (relevant.length > 0) {
    ctx += `COLUMNS MOST RELEVANT TO THIS QUESTION:\n`
    ctx += relevant.map(buildSummary).join('\n')
    ctx += '\n\nALL COLUMNS:\n'
  } else {
    ctx += 'All columns:\n'
  }
  ctx += columns.map(buildSummary).join('\n')

  return ctx
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

    const context = buildDataContext(dataset, columns, types, text.trim())
    const history = newMessages.slice(-7, -1)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team.
RULES: Declarative statements only. Cite specific figures. No filler, no hedging.

IMPORTANT — Column naming: Columns are full survey questions. Match user shorthand ("age", "satisfaction", "terminal") to the correct column using your judgement. The stats include complete value distributions for every categorical column across all ${dataset.length} rows — answer directly from these figures.

USER QUESTION:
${text.trim()}

DATASET CONTEXT:
${context}

CONVERSATION HISTORY:
${history}

Answer the USER QUESTION directly from the stats above. Cite exact column names and figures.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1500 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      if (data.provider) setActiveProvider(data.provider)
      setMessages(prev => [...prev, { role: 'assistant', content: data.content || 'No response received.' }])
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
      <div className="flex items-center justify-between mb-4 shrink-0">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-border bg-white mb-3 min-h-0">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">Ask anything about your data</p>
            <p className="text-xs text-text-secondary mb-6 max-w-sm">
              Ask in plain English — no need to know exact column names. The AI sees full distributions for every column.
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
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-slate-500" />}
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
                    {msg.role === 'assistant' && !msg.isError ? renderMarkdown(msg.content) : msg.content}
                  </div>
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

      <div className="shrink-0 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 border border-border rounded-xl bg-white px-4 py-2.5 focus-within:border-brand-accent focus-within:ring-2 focus-within:ring-brand-accent/15 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) sendMessage(input) }}
            placeholder="Ask a question in plain English…"
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
      <p className="text-[10px] text-text-muted text-center mt-1.5">Full value distributions sent for every column · Raw data stays in your browser</p>
    </div>
  )
}
