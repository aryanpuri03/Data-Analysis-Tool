import { useState, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'
import { Type, Sparkles, Loader2, AlertCircle, RefreshCw, Search, X } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { analyseColumn, buildBM25Index, bm25Search, extractKeywords, extractPhrases, scoreSentiment } from '../../utils/textAnalysisUtils'

const SENTIMENT_COLOURS = { positive: '#10B981', neutral: '#94A3B8', negative: '#EF4444' }
const SENTIMENT_LABELS = ['positive', 'neutral', 'negative']

function SentimentBadge({ label }) {
  const cls = {
    positive: 'bg-emerald-100 text-emerald-700',
    neutral: 'bg-slate-100 text-slate-500',
    negative: 'bg-red-100 text-red-600',
  }[label] || 'bg-slate-100 text-slate-500'
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{label}</span>
}

function Panel({ title, children }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">{title}</h3>
      {children}
    </div>
  )
}

// Highlight matched terms inside a text string — returns mixed string/JSX array
function highlightText(text, terms) {
  if (!terms || terms.length === 0) return text
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 font-medium not-italic">{part}</mark>
      : part
  )
}

export default function TextAnalysis() {
  const { dataset, columns, types } = useData()
  const [activeCol, setActiveCol] = useState(null)
  const [aiOutput, setAiOutput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [sentimentTab, setSentimentTab] = useState('all')

  // Topic search state
  const [searchQuery, setSearchQuery]           = useState('')
  const [expandedTerms, setExpandedTerms]       = useState([])
  const [searchResults, setSearchResults]       = useState(null)
  const [searchLoading, setSearchLoading]       = useState(false)
  const [searchError, setSearchError]           = useState(null)
  const [focusedAnalysis, setFocusedAnalysis]   = useState(null)
  const [focusedAiOutput, setFocusedAiOutput]   = useState('')
  const [focusedAiLoading, setFocusedAiLoading] = useState(false)
  const [focusedAiError, setFocusedAiError]     = useState(null)
  const expandCacheRef = useRef({})

  function computeFocusedAnalysis(matchedTexts) {
    if (!matchedTexts.length) return null
    const sentiments = matchedTexts.map(t => scoreSentiment(t))
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }
    for (const s of sentiments) sentimentCounts[s.label]++
    const avgScore = sentiments.reduce((a, s) => a + s.score, 0) / sentiments.length
    return {
      texts: matchedTexts,
      total: matchedTexts.length,
      sentiments,
      sentimentCounts,
      avgScore,
      keywords: extractKeywords(matchedTexts, 12),
      phrases: extractPhrases(matchedTexts, 8),
    }
  }

  // Detect text columns: freetext type, or categorical with avg length > 20
  const textColumns = useMemo(() => {
    if (!dataset || !columns) return []
    return columns.filter(col => {
      if (types[col] === 'freetext') return true
      if (types[col] === 'categorical') {
        const vals = dataset.map(r => String(r[col] || '')).filter(v => v.length > 0)
        const avg = vals.reduce((a, v) => a + v.length, 0) / (vals.length || 1)
        return avg > 20
      }
      return false
    })
  }, [dataset, columns, types])

  // Run analysis when column selected
  const analysis = useMemo(() => {
    if (!activeCol || !dataset) return null
    return analyseColumn(dataset, activeCol)
  }, [activeCol, dataset])

  // BM25 index — built once per column, reused across searches
  const bm25Index = useMemo(() => {
    if (!analysis) return null
    return buildBM25Index(analysis.texts)
  }, [analysis])

  // Reset AI output when column changes
  const selectColumn = useCallback((col) => {
    setActiveCol(col)
    setAiOutput('')
    setAiError(null)
    setSentimentTab('all')
    setSearchQuery('')
    setExpandedTerms([])
    setSearchResults(null)
    setSearchError(null)
    setFocusedAnalysis(null)
    setFocusedAiOutput('')
    setFocusedAiError(null)
  }, [])

  // Natural language topic search — AI expands description → BM25 → full FTA on results
  const runFocusedSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q || !analysis || !bm25Index) return
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults(null)
    setFocusedAnalysis(null)
    setFocusedAiOutput('')
    setFocusedAiError(null)

    try {
      let terms = expandCacheRef.current[q.toLowerCase()]

      if (!terms) {
        // Prompt handles both single words AND natural language descriptions
        const prompt = `You are a text analysis assistant for Edinburgh Airport's CX team.

The analyst wants to search customer feedback for responses related to: "${q}"

Generate a JSON array of 20–25 specific words and short phrases (max 3 words each) that airport customers would actually write when talking about this topic. Include:
- Direct topic words and their plural/verb forms
- Common synonyms and related terms
- Informal language customers might use
- Specific sub-topics within this area

Return ONLY a valid JSON array of lowercase strings. No explanation, no markdown.

Examples:
- "queue" → ["queue","queues","queuing","queued","wait","waiting","waited","delay","delays","delayed","line","backlog","hold","slow","congestion"]
- "kids softplay" → ["softplay","soft play","soft-play","kids area","children","play area","toddler","toddlers","family area","kids room","playroom","playground","child friendly","family friendly","kids entertainment","slides","ball pool","climbing"]
- "food and drink" → ["food","drink","drinks","cafe","restaurant","coffee","tea","meal","snack","sandwich","hungry","thirsty","menu","overpriced","expensive","bar","eating","dining","refreshments","water","bottle"]`

        const res = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, maxTokens: 400 }),
        })
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const { content } = await res.json()

        const match = content.match(/\[[\s\S]*?\]/)
        if (!match) throw new Error('AI returned unexpected format')
        terms = JSON.parse(match[0]).filter(t => typeof t === 'string' && t.length > 0)
        expandCacheRef.current[q.toLowerCase()] = terms
      }

      setExpandedTerms(terms)
      const results = bm25Search(terms, analysis.texts, bm25Index)
      setSearchResults(results)

      // Run full FTA on matched responses
      const matchedTexts = results.map(r => r.text)
      setFocusedAnalysis(computeFocusedAnalysis(matchedTexts))
    } catch (e) {
      // Fallback: substring search
      const fallback = analysis.texts
        .map((text, idx) => ({ text, idx, normScore: text.toLowerCase().includes(q.toLowerCase()) ? 1 : 0 }))
        .filter(r => r.normScore > 0)
      setExpandedTerms([q])
      setSearchResults(fallback)
      setFocusedAnalysis(computeFocusedAnalysis(fallback.map(r => r.text)))
      if (fallback.length === 0) setSearchError(e.message || 'Search failed')
    } finally {
      setSearchLoading(false)
    }
  }, [searchQuery, analysis, bm25Index])

  const removeTerm = useCallback((term) => {
    setExpandedTerms(prev => {
      const next = prev.filter(t => t !== term)
      if (analysis && bm25Index && next.length > 0) {
        const results = bm25Search(next, analysis.texts, bm25Index)
        setSearchResults(results)
        setFocusedAnalysis(computeFocusedAnalysis(results.map(r => r.text)))
      } else {
        setSearchResults(null)
        setFocusedAnalysis(null)
      }
      return next
    })
  }, [analysis, bm25Index])

  // AI deep-dive on the focused (filtered) results
  const runFocusedAiAnalysis = useCallback(async () => {
    if (!focusedAnalysis || !searchQuery) return
    setFocusedAiLoading(true)
    setFocusedAiError(null)
    setFocusedAiOutput('')

    const samples = focusedAnalysis.texts.slice(0, 60).map((t, i) => `${i + 1}. ${t}`).join('\n')
    const prompt = `You are a CX analyst for Edinburgh Airport. A team member searched for: "${searchQuery}"

This returned ${focusedAnalysis.total} matching customer responses:

${samples}

Provide a focused analysis of ONLY these responses:
1. **What customers are saying** — summarise the key points about this topic
2. **Sentiment & Emotions** — overall tone, strong feelings expressed
3. **Specific Complaints or Issues** — exact problems mentioned, with examples
4. **Positive Aspects** — what customers appreciate about this area
5. **Recommendations** — 2–3 specific, actionable improvements for this topic

Reference actual phrases from the responses where relevant.`

    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1200 }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const { content } = await res.json()
      setFocusedAiOutput(content || 'No response received.')
    } catch (e) {
      setFocusedAiError(e.message || 'Failed to contact AI service.')
    } finally {
      setFocusedAiLoading(false)
    }
  }, [focusedAnalysis, searchQuery])

  const runAiAnalysis = useCallback(async () => {
    if (!analysis) return
    setAiLoading(true)
    setAiError(null)
    setAiOutput('')

    const samples = analysis.texts.slice(0, 80).join('\n- ')
    const prompt = `You are a CX analyst for Edinburgh Airport. Analyse the following ${analysis.total} customer feedback responses from the column "${activeCol}".

Sample responses:
- ${samples}

Please provide:
1. **Main Themes** — identify 3–5 recurring topics or themes in the feedback with specific examples
2. **Sentiment Patterns** — describe the overall emotional tone and any notable patterns
3. **Top Complaints or Issues** — list specific pain points mentioned most frequently
4. **Positive Highlights** — what customers appreciate or praise
5. **Recommendations** — 2–3 actionable improvements based on this feedback

Be specific and reference actual phrases from the data where relevant.`

    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1200 }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const { content } = await res.json()
      setAiOutput(content || 'No response received.')
    } catch (e) {
      setAiError(e.message || 'Failed to contact AI service.')
    } finally {
      setAiLoading(false)
    }
  }, [analysis, activeCol])

  // Row explorer filtered by sentiment tab
  const filteredRows = useMemo(() => {
    if (!analysis) return []
    const pairs = analysis.texts.map((text, i) => ({ text, sentiment: analysis.sentiments[i] }))
    if (sentimentTab === 'all') return pairs.slice(0, 50)
    return pairs.filter(p => p.sentiment.label === sentimentTab).slice(0, 50)
  }, [analysis, sentimentTab])

  // ── Empty states ──
  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-secondary">
        <Type className="w-8 h-8 opacity-30" />
        <p className="text-sm">No data loaded — upload a file first.</p>
      </div>
    )
  }

  if (textColumns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-secondary">
        <Type className="w-8 h-8 opacity-30" />
        <p className="text-sm">No text columns detected in this dataset.</p>
        <p className="text-xs opacity-60">Text Analysis works with free-text or long categorical columns.</p>
      </div>
    )
  }

  const pieData = analysis
    ? SENTIMENT_LABELS.map(label => ({
        name: label.charAt(0).toUpperCase() + label.slice(1),
        value: analysis.sentimentCounts[label],
      })).filter(d => d.value > 0)
    : []

  const avgLabel = !analysis ? null
    : analysis.avgScore > 0.02 ? 'positive' : analysis.avgScore < -0.02 ? 'negative' : 'neutral'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Type className="w-5 h-5 text-brand-blue" />
          Text Analysis
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Sentiment, keywords and AI topic insights from free-text columns
        </p>
      </div>

      {/* Column selector */}
      <div className="flex flex-wrap gap-2">
        {textColumns.map(col => (
          <button
            key={col}
            onClick={() => selectColumn(col)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activeCol === col
                ? 'bg-brand-blue text-white border-brand-blue'
                : 'bg-white text-text-secondary border-border hover:border-brand-blue hover:text-brand-blue'
            }`}
          >
            {col}
          </button>
        ))}
      </div>

      {!activeCol && (
        <p className="text-sm text-text-secondary">Select a column above to begin analysis.</p>
      )}

      {analysis && (
        <>
          {/* 4-panel grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Panel 1: Sentiment Overview */}
            <Panel title="Sentiment Overview">
              <div className="flex gap-3 mb-4">
                {SENTIMENT_LABELS.map(label => (
                  <div key={label} className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLOURS[label] }}>
                      {analysis.sentimentCounts[label]}
                    </p>
                    <p className="text-[11px] text-text-secondary capitalize mt-0.5">{label}</p>
                    <p className="text-[10px] text-text-muted">
                      {analysis.total ? Math.round(analysis.sentimentCounts[label] / analysis.total * 100) : 0}%
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-text-secondary">Overall tone:</span>
                {avgLabel && <SentimentBadge label={avgLabel} />}
                <span className="text-xs text-text-muted ml-auto">
                  score {analysis.avgScore >= 0 ? '+' : ''}{(analysis.avgScore * 100).toFixed(1)}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={SENTIMENT_COLOURS[entry.name.toLowerCase()]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Panel>

            {/* Panel 2: Top Keywords */}
            <Panel title="Top Keywords">
              {analysis.keywords.length === 0 ? (
                <p className="text-xs text-text-secondary">Not enough text data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={analysis.keywords.slice(0, 15).reverse()}
                    layout="vertical"
                    margin={{ left: 8, right: 16, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="word" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => [v, 'count']} />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                      {analysis.keywords.slice(0, 15).map((_, i) => (
                        <Cell key={i} fill="#2563EB" fillOpacity={0.7 + i * 0.02} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* Panel 3: Key Phrases */}
            <Panel title="Key Phrases">
              {analysis.phrases.length === 0 ? (
                <p className="text-xs text-text-secondary">No recurring phrases found.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {analysis.phrases.map(({ phrase, count }) => (
                    <span
                      key={phrase}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-xs text-text-primary"
                    >
                      {phrase}
                      <span className="bg-white text-brand-blue font-semibold px-1.5 py-0.5 rounded-full text-[10px]">
                        {count}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </Panel>

            {/* Panel 4: AI Topic Analysis */}
            <Panel title="AI Topic Analysis">
              {!aiOutput && !aiLoading && (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <Sparkles className="w-7 h-7 text-brand-blue opacity-60" />
                  <p className="text-xs text-text-secondary text-center">
                    Send responses to AI for deep theme and topic analysis
                  </p>
                  <button
                    onClick={runAiAnalysis}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-brand-blue/90 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Analyse Topics with AI
                  </button>
                </div>
              )}

              {aiLoading && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 text-brand-blue animate-spin" />
                  <p className="text-xs text-text-secondary">Analysing…</p>
                </div>
              )}

              {aiError && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{aiError}</p>
                  </div>
                  <button
                    onClick={runAiAnalysis}
                    className="flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                </div>
              )}

              {aiOutput && !aiLoading && (
                <div className="space-y-3">
                  <div className="prose prose-sm max-w-none text-sm">
                    {renderMarkdown(aiOutput)}
                  </div>
                  <button
                    onClick={runAiAnalysis}
                    className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-brand-blue transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Re-analyse
                  </button>
                </div>
              )}
            </Panel>
          </div>

          {/* Topic Search & Focused FTA */}
          <div className="bg-white border border-border rounded-xl p-5 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-4 h-4 text-brand-blue" />
                <h3 className="text-sm font-semibold text-text-primary">Topic Search</h3>
              </div>
              <p className="text-xs text-text-secondary">
                Describe what you're looking for in plain English — AI expands your description into every related term, then runs full sentiment + keyword analysis on the matched responses.
              </p>
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runFocusedSearch()}
                placeholder='e.g. "kids softplay", "find comments about queue wait times", "food and drink"'
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-brand-blue bg-white text-text-primary placeholder:text-text-muted"
              />
              <button
                onClick={runFocusedSearch}
                disabled={!searchQuery.trim() || searchLoading}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {searchLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</>
                  : <><Search className="w-3.5 h-3.5" /> Search</>}
              </button>
            </div>

            {/* Expanded terms */}
            {expandedTerms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-3 bg-blue-50 rounded-lg">
                <span className="text-[11px] text-blue-600 font-medium self-center mr-1 shrink-0">AI expanded to:</span>
                {expandedTerms.map(term => (
                  <span key={term} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 rounded-full text-[11px] text-blue-700">
                    {term}
                    <button onClick={() => removeTerm(term)} className="hover:text-red-500 transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {searchError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700">{searchError}</p>
              </div>
            )}

            {/* ── Focused FTA results ── */}
            {focusedAnalysis && searchResults !== null && (
              <div className="space-y-5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">
                    Focused Analysis
                    <span className="ml-2 text-xs font-normal text-text-secondary">
                      — {focusedAnalysis.total} matching response{focusedAnalysis.total !== 1 ? 's' : ''}
                    </span>
                  </p>
                </div>

                {/* Sentiment mini-dashboard */}
                <div className="grid grid-cols-3 gap-3">
                  {SENTIMENT_LABELS.map(label => (
                    <div key={label} className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold" style={{ color: SENTIMENT_COLOURS[label] }}>
                        {focusedAnalysis.sentimentCounts[label]}
                      </p>
                      <p className="text-[11px] text-text-secondary capitalize mt-0.5">{label}</p>
                      <p className="text-[10px] text-text-muted">
                        {Math.round(focusedAnalysis.sentimentCounts[label] / focusedAnalysis.total * 100)}%
                      </p>
                    </div>
                  ))}
                </div>

                {/* Keywords + Phrases side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Top Keywords</p>
                    {focusedAnalysis.keywords.length === 0
                      ? <p className="text-xs text-text-muted">Not enough data.</p>
                      : <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={focusedAnalysis.keywords.slice(0, 10).reverse()} layout="vertical" margin={{ left: 4, right: 12, top: 0, bottom: 0 }}>
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="word" tick={{ fontSize: 10 }} width={72} />
                            <Tooltip formatter={v => [v, 'count']} />
                            <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                              {focusedAnalysis.keywords.slice(0, 10).map((_, i) => (
                                <Cell key={i} fill="#2563EB" fillOpacity={0.6 + i * 0.04} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                    }
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Key Phrases</p>
                    {focusedAnalysis.phrases.length === 0
                      ? <p className="text-xs text-text-muted">No recurring phrases.</p>
                      : <div className="flex flex-wrap gap-1.5">
                          {focusedAnalysis.phrases.map(({ phrase, count }) => (
                            <span key={phrase} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full text-xs text-text-primary">
                              {phrase}
                              <span className="bg-white text-brand-blue font-semibold px-1 rounded-full text-[10px]">{count}</span>
                            </span>
                          ))}
                        </div>
                    }
                  </div>
                </div>

                {/* AI deep-dive */}
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-brand-blue" /> AI Deep-Dive
                    </p>
                    {focusedAiOutput && !focusedAiLoading && (
                      <button onClick={runFocusedAiAnalysis} className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-brand-blue">
                        <RefreshCw className="w-3 h-3" /> Re-analyse
                      </button>
                    )}
                  </div>
                  {!focusedAiOutput && !focusedAiLoading && !focusedAiError && (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <p className="text-xs text-text-secondary text-center">
                        Get AI analysis of only these {focusedAnalysis.total} matched responses
                      </p>
                      <button
                        onClick={runFocusedAiAnalysis}
                        className="flex items-center gap-2 px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-brand-blue/90 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Analyse with AI
                      </button>
                    </div>
                  )}
                  {focusedAiLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
                      <p className="text-xs text-text-secondary">Analysing {focusedAnalysis.total} responses…</p>
                    </div>
                  )}
                  {focusedAiError && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-red-50 rounded">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-xs text-red-700">{focusedAiError}</p>
                      </div>
                      <button onClick={runFocusedAiAnalysis} className="text-xs text-brand-blue hover:underline flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Retry
                      </button>
                    </div>
                  )}
                  {focusedAiOutput && !focusedAiLoading && (
                    <div className="prose prose-sm max-w-none text-sm">
                      {renderMarkdown(focusedAiOutput)}
                    </div>
                  )}
                </div>

                {/* Matched responses */}
                <div>
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Matched Responses</p>
                  <div className="divide-y divide-border">
                    {searchResults.slice(0, 50).map(({ text, idx, normScore }, i) => (
                      <div key={idx} className="py-2.5 flex items-start gap-3">
                        <div className="w-1 self-stretch rounded-full bg-slate-100 relative shrink-0">
                          <div className="absolute bottom-0 left-0 w-full rounded-full bg-brand-blue" style={{ height: `${Math.round(normScore * 100)}%` }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary leading-relaxed">{highlightText(text, expandedTerms)}</p>
                          <span className="text-[10px] text-text-muted mt-0.5 block">row {idx + 1} · {Math.round(normScore * 100)}% match</span>
                        </div>
                        <SentimentBadge label={focusedAnalysis.sentiments[i]?.label || 'neutral'} />
                      </div>
                    ))}
                  </div>
                  {searchResults.length > 50 && (
                    <p className="text-[11px] text-text-muted mt-3">Showing top 50 of {searchResults.length} matches.</p>
                  )}
                </div>
              </div>
            )}

            {/* Idle state */}
            {searchResults === null && !searchLoading && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-text-secondary">
                <Search className="w-7 h-7 opacity-20" />
                <p className="text-xs opacity-60">Describe any topic above to begin</p>
              </div>
            )}
          </div>

          {/* Row explorer */}
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Response Explorer</h3>
              <div className="flex gap-1">
                {['all', ...SENTIMENT_LABELS].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSentimentTab(tab)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      sentimentTab === tab
                        ? 'bg-brand-blue text-white'
                        : 'text-text-secondary hover:bg-slate-100'
                    }`}
                  >
                    {tab === 'all'
                      ? `All (${analysis.total})`
                      : `${tab} (${analysis.sentimentCounts[tab]})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border">
              {filteredRows.length === 0 ? (
                <p className="text-xs text-text-secondary py-4">No responses in this category.</p>
              ) : (
                filteredRows.map(({ text, sentiment }, i) => (
                  <div key={i} className="py-2.5 flex items-start gap-3">
                    <span className="text-[11px] text-text-muted w-6 shrink-0 pt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-text-primary flex-1 leading-relaxed">{text}</p>
                    <SentimentBadge label={sentiment.label} />
                  </div>
                ))
              )}
            </div>
            {analysis.total > 50 && (
              <p className="text-[11px] text-text-muted mt-3">
                Showing first 50 of {analysis.total} responses.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
