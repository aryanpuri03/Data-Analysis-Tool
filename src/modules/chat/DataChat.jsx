import { useState, useCallback, useRef, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import { isNullish } from '../../utils/inferTypes'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { AlertCircle, Send, Loader2, Trash2, Copy, Check, MessageSquare, Bot, User } from 'lucide-react'

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
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8)
      info += `, ${Object.keys(freq).length} unique, top: ${top.map(([v, c]) => `"${v}"(${c})`).join(', ')}`
    } else if (type === 'date') {
      const dates = nonNull.map(v => Date.parse(String(v))).filter(ts => !isNaN(ts)).sort((a, b) => a - b)
      if (dates.length) info += `, range: ${new Date(dates[0]).toISOString().split('T')[0]} to ${new Date(dates[dates.length - 1]).toISOString().split('T')[0]}`
    }
    return `  - ${info}`
  }).join('\n')

  // Sample rows
  const sampleRows = dataset.slice(0, 5).map((row, i) => {
    const vals = columns.map(c => `${c}=${JSON.stringify(row[c])}`)
    return `  Row ${i + 1}: ${vals.join(', ')}`
  }).join('\n')

  return `Dataset: ${dataset.length} rows, ${columns.length} columns.\n\nColumns:\n${colSummaries}\n\nSample rows:\n${sampleRows}`
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !dataset) return
    const userMsg = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const context = buildDataContext(dataset, columns, types)
    // Build conversation history (last 6 messages for context)
    const history = [...messages.slice(-6), userMsg]
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const prompt = `ROLE: Senior data analyst, Edinburgh Airport CX team.
RULES: Declarative statements only. Every claim must cite a specific figure from the dataset context. No filler, no hedging, no conversational language. If the data is insufficient to answer, state precisely what is missing. Use bullet points for lists.

DATASET CONTEXT:
${context}

CONVERSATION:
${history}

Respond to the analyst's latest question directly and precisely.`

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1200 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      setMessages(prev => [...prev, { role: 'assistant', content: data.content || 'No response received.' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, isError: true }])
    } finally {
      setLoading(false)
    }
  }, [dataset, columns, types, messages])

  const copyMessage = useCallback(async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
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
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-text-primary">Chat with Your Data</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Ask questions about <span className="font-medium text-text-primary">{fileName}</span> in plain English — {dataset.length.toLocaleString()} rows × {columns.length} columns
        </p>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-lg border border-border bg-card-bg mb-4">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <MessageSquare className="w-10 h-10 text-text-secondary/30 mb-4" />
            <p className="text-sm font-medium text-text-primary mb-1">Ask anything about your data</p>
            <p className="text-xs text-text-secondary mb-6 text-center max-w-md">
              The AI sees your column stats and sample rows — not the full dataset. Ask about patterns, distributions, quality issues, or comparisons.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                >
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
                        <button
                          onClick={() => copyMessage(msg.content, i)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all cursor-pointer"
                          style={{ opacity: copiedIdx === i ? 1 : undefined }}
                        >
                          {copiedIdx === i ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-text-secondary" />}
                        </button>
                      )}
                    </div>
                    <div className={`text-sm leading-relaxed ${msg.isError ? 'text-red-600' : 'text-text-primary'}`}>
                      {msg.role === 'assistant' && !msg.isError
                        ? renderMarkdown(msg.content)
                        : msg.content
                      }
                    </div>
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

      {/* Input bar */}
      <div className="flex items-center gap-2">
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="shrink-0 p-2.5 text-text-secondary hover:text-red-500 border border-border rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 flex border border-border rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-blue/20 focus-within:border-brand-blue">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) sendMessage(input) }}
            placeholder="Ask a question about your data…"
            disabled={loading}
            className="flex-1 px-4 py-3 text-sm outline-none disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-4 text-brand-blue hover:text-brand-blue/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
