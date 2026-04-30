import { useState, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'
import {
  Type, Sparkles, Loader2, AlertCircle, RefreshCw, Search, X,
  CheckCircle2, XCircle, Download, TrendingUp, MessageSquare, Hash,
  ChevronRight, FileText,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useData } from '../../context/DataContext'
import { renderMarkdown } from '../../utils/renderMarkdown'
import {
  analyseColumn, buildBM25Index, bm25Search,
  extractKeywords, extractPhrases, scoreSentiment, parseQueryIntent,
} from '../../utils/textAnalysisUtils'

const SENTIMENT_COLOURS = { positive: '#10B981', neutral: '#94A3B8', negative: '#EF4444' }
const SENTIMENT_BG      = { positive: 'bg-emerald-50', neutral: 'bg-slate-50', negative: 'bg-red-50' }
const SENTIMENT_TEXT    = { positive: 'text-emerald-600', neutral: 'text-slate-500', negative: 'text-red-500' }
const SENTIMENT_BORDER  = { positive: 'border-emerald-200', neutral: 'border-slate-200', negative: 'border-red-200' }
const SENTIMENT_BAR     = { positive: 'bg-emerald-400', neutral: 'bg-slate-300', negative: 'bg-red-400' }
const SENTIMENT_LABELS  = ['positive', 'neutral', 'negative']
const RELEVANCE_BATCH   = 40

// ── Area presets (label → variant spellings) ─────────────────────
const MUST_CONTAIN_PRESETS = {
  fastpark: {
    label: 'Fastpark',
    color: 'indigo',
    variants: ['fastpark', 'fast park', 'fast-park', 'faspark', 'fastpak', 'fastpar', 'fast pak', 'fstpark', 'fast prk', 'fastparkk'],
  },
  carpark: {
    label: 'Car Park',
    color: 'violet',
    variants: ['car park', 'carpark', 'car-park', 'car parks', 'carparks', 'car prk', 'cark park', 'car prak', 'car par', 'car prak', 'carpar', 'multi-storey', 'multistorey', 'multi storey', 'short stay', 'long stay', 'short-stay', 'long-stay', 'car parking', 'carparking'],
  },
  checkin: {
    label: 'Check-in',
    color: 'sky',
    variants: ['check-in', 'check in', 'checkin', 'checking in', 'checked in', 'check-ins', 'chek in', 'chceck in', 'chekc in', 'check inn', 'chck in', 'checin', 'chckin', 'check desk', 'check-in desk', 'baggage drop', 'bag drop', 'bag-drop', 'bagdrop', 'chek-in', 'chekkin', 'checckin'],
  },
  security: {
    label: 'Security',
    color: 'amber',
    variants: ['security', 'securty', 'secuirty', 'secirity', 'securiy', 'secrity', 'secutiry', 'scurity', 'securitiy', 'securit', 'security check', 'security queue', 'security screening', 'security lane', 'scanner', 'body scanner', 'x-ray', 'xray', 'pat down', 'pat-down', 'secuirty check'],
  },
  gates: {
    label: 'Gates',
    color: 'teal',
    variants: ['gate', 'gates', 'gated', 'boarding gate', 'departure gate', 'at the gate', 'gate lounge', 'gate area', 'boarding', 'board', 'boarded', 'boarding pass', 'boarding card', 'gate number', 'gaet', 'gtae', 'bording', 'borading', 'bordeing'],
  },
  departures: {
    label: 'Departures',
    color: 'blue',
    variants: ['departure', 'departures', 'depertures', 'depatures', 'deparure', 'depature', 'departure lounge', 'departures lounge', 'departures hall', 'departure hall', 'outbound', 'depratures', 'dpeartures', 'departues', 'dpeatures'],
  },
  arrivals: {
    label: 'Arrivals',
    color: 'emerald',
    variants: ['arrival', 'arrivals', 'arrivls', 'arivvals', 'arriving', 'arrived', 'arrivals hall', 'arrivals lounge', 'baggage reclaim', 'baggage claim', 'luggage reclaim', 'luggage claim', 'arival', 'arivals', 'arrivels', 'arrivels'],
  },
  staff: {
    label: 'Staff',
    color: 'rose',
    variants: ['staff', 'staf', 'staaf', 'employee', 'employees', 'worker', 'workers', 'agent', 'agents', 'crew', 'personnel', 'team member', 'assistant', 'officer', 'guard', 'stff', 'staf member', 'stafff', 'memebr of staff', 'member of staff'],
  },
  passport: {
    label: 'Passport Control',
    color: 'orange',
    variants: ['passport', 'passport control', 'border control', 'immigration', 'e-gate', 'egate', 'e gate', 'pasport', 'passort', 'passprt', 'passport controle', 'border force', 'uk border'],
  },
}

function matchesPresets(text, presetKeys) {
  const lower = text.toLowerCase()
  return presetKeys.every(key => {
    const preset = MUST_CONTAIN_PRESETS[key]
    return preset?.variants.some(v => lower.includes(v))
  })
}

const PRESET_COLOUR_MAP = {
  indigo:  { chip: 'bg-indigo-600 text-white border-indigo-600',  inactive: 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400' },
  violet:  { chip: 'bg-violet-600 text-white border-violet-600',  inactive: 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50 hover:border-violet-400' },
  sky:     { chip: 'bg-sky-600 text-white border-sky-600',        inactive: 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50 hover:border-sky-400' },
  amber:   { chip: 'bg-amber-500 text-white border-amber-500',    inactive: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50 hover:border-amber-400' },
  teal:    { chip: 'bg-teal-600 text-white border-teal-600',      inactive: 'bg-white text-teal-700 border-teal-200 hover:bg-teal-50 hover:border-teal-400' },
  blue:    { chip: 'bg-blue-600 text-white border-blue-600',      inactive: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-400' },
  emerald: { chip: 'bg-emerald-600 text-white border-emerald-600',inactive: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400' },
  rose:    { chip: 'bg-rose-600 text-white border-rose-600',      inactive: 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-400' },
  orange:  { chip: 'bg-orange-500 text-white border-orange-500',  inactive: 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50 hover:border-orange-400' },
}

// ── Sub-components ───────────────────────────────────────────────

function SentimentBadge({ label, size = 'sm' }) {
  const map = {
    positive: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    neutral:  'bg-slate-100 text-slate-500 border border-slate-200',
    negative: 'bg-red-100 text-red-600 border border-red-200',
  }
  const cls = map[label] || map.neutral
  const sz  = size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <span className={`inline-flex items-center rounded-full font-medium capitalize ${cls} ${sz}`}>
      {label}
    </span>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </p>
  )
}

function EmptyCard({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
        <Icon className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 text-center max-w-xs">{subtitle}</p>}
    </div>
  )
}

function highlightText(text, terms) {
  if (!terms || terms.length === 0) return text
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts   = text.split(pattern)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-amber-100 text-amber-900 rounded px-0.5 not-italic font-medium">{part}</mark>
      : part
  )
}

// ── Main Component ───────────────────────────────────────────────

export default function TextAnalysis() {
  const { dataset, columns, types } = useData()
  const [activeCol, setActiveCol]   = useState(null)
  const [aiOutput, setAiOutput]     = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiError, setAiError]       = useState(null)
  const [sentimentTab, setSentimentTab] = useState('all')

  const [searchQuery, setSearchQuery]         = useState('')
  const [expandedTerms, setExpandedTerms]     = useState([])
  const [searchResults, setSearchResults]     = useState(null)
  const [searchLoading, setSearchLoading]     = useState(false)
  const [searchError, setSearchError]         = useState(null)
  const [focusedAnalysis, setFocusedAnalysis] = useState(null)
  const [focusedAiOutput, setFocusedAiOutput] = useState('')
  const [focusedAiLoading, setFocusedAiLoading] = useState(false)
  const [focusedAiError, setFocusedAiError]   = useState(null)

  const [relevanceVerdicts, setRelevanceVerdicts] = useState({})
  const [relevanceLoading, setRelevanceLoading]   = useState(false)
  const [showOnlyRelevant, setShowOnlyRelevant]   = useState(false)
  const [searchSentimentFilter, setSearchSentimentFilter] = useState('all')
  const [detectedIntent, setDetectedIntent]       = useState(null) // { sentimentIntent, topic }
  const [selectedPhrases, setSelectedPhrases]     = useState([])
  const [mustContainQuery, setMustContainQuery]   = useState('')
  const [selectedMustPresets, setSelectedMustPresets] = useState([])

  const expandCacheRef = useRef({})

  // ── Logic (unchanged) ────────────────────────────────────────

  function computeFocusedAnalysis(matchedTexts) {
    if (!matchedTexts.length) return null
    const sentiments      = matchedTexts.map(t => scoreSentiment(t))
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }
    for (const s of sentiments) sentimentCounts[s.label]++
    const avgScore = sentiments.reduce((a, s) => a + s.score, 0) / sentiments.length
    return {
      texts: matchedTexts, total: matchedTexts.length,
      sentiments, sentimentCounts, avgScore,
      keywords: extractKeywords(matchedTexts, 12),
      phrases:  extractPhrases(matchedTexts, 8),
    }
  }

  async function runRelevanceCheck(results, query, sentimentIntent = null) {
    if (!results.length) return
    setRelevanceLoading(true)
    setRelevanceVerdicts({})

    const sentimentClause = sentimentIntent
      ? `The analyst specifically wants ${sentimentIntent} responses. A result is only relevant if it is both about the topic AND ${sentimentIntent} in tone. `
      : ''

    try {
      for (let batchStart = 0; batchStart < results.length; batchStart += RELEVANCE_BATCH) {
        const batch   = results.slice(batchStart, batchStart + RELEVANCE_BATCH)
        const numbered = batch.map((r, i) => `${i + 1}. ${r.text}`).join('\n')
        const prompt  = `You are reviewing customer feedback from Edinburgh Airport. A team member searched for: "${query}"

${sentimentClause}The system returned ${batch.length} responses as potential matches. For each response below, decide if it is genuinely relevant to the search (matching both topic and${sentimentIntent ? ` ${sentimentIntent} sentiment` : ' intent'}) or a false match.

Return ONLY a valid JSON array. Each item must have:
- "n": the response number (1 to ${batch.length})
- "relevant": true or false
- "reason": a concise 4-8 word explanation

Responses:
${numbered}

Return ONLY the JSON array, no markdown, no explanation.`

        const res = await fetch('/api/insights', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, maxTokens: 900 }),
        })
        if (!res.ok) continue
        const { content } = await res.json()
        const match = content.match(/\[[\s\S]*?\]/)
        if (!match) continue
        const parsed = JSON.parse(match[0])
        const batchMap = {}
        for (const item of parsed) {
          if (typeof item.n === 'number' && item.n >= 1 && item.n <= batch.length)
            batchMap[batch[item.n - 1].idx] = { relevant: !!item.relevant, reason: item.reason || '' }
        }
        setRelevanceVerdicts(prev => ({ ...prev, ...batchMap }))
      }
    } catch (_e) {
      // silently fail
    } finally {
      setRelevanceLoading(false)
    }
  }

  const textColumns = useMemo(() => {
    if (!dataset || !columns) return []
    return columns.filter(col => {
      if (types[col] === 'freetext') return true
      if (types[col] === 'categorical') {
        const vals = dataset.map(r => String(r[col] || '')).filter(v => v.length > 0)
        const avg  = vals.reduce((a, v) => a + v.length, 0) / (vals.length || 1)
        return avg > 20
      }
      return false
    })
  }, [dataset, columns, types])

  const analysis  = useMemo(() => activeCol && dataset ? analyseColumn(dataset, activeCol) : null, [activeCol, dataset])
  const bm25Index = useMemo(() => analysis ? buildBM25Index(analysis.texts) : null, [analysis])

  const selectColumn = useCallback((col) => {
    setActiveCol(col); setAiOutput(''); setAiError(null); setSentimentTab('all')
    setSearchQuery(''); setExpandedTerms([]); setSearchResults(null)
    setSearchError(null); setFocusedAnalysis(null); setFocusedAiOutput('')
    setFocusedAiError(null); setRelevanceVerdicts({}); setRelevanceLoading(false)
    setShowOnlyRelevant(false); setSearchSentimentFilter('all'); setDetectedIntent(null)
    setSelectedPhrases([]); setMustContainQuery(''); setSelectedMustPresets([])
  }, [])

  const runFocusedSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q || !analysis || !bm25Index) return

    // ── Parse sentiment intent and extract core topic ──────────────
    const { sentimentIntent, topic } = parseQueryIntent(q)
    setDetectedIntent(sentimentIntent ? { sentimentIntent, topic } : null)

    setSearchLoading(true); setSearchError(null); setSearchResults(null)
    setFocusedAnalysis(null); setFocusedAiOutput(''); setFocusedAiError(null)
    setRelevanceVerdicts({}); setRelevanceLoading(false); setShowOnlyRelevant(false)
    setSearchSentimentFilter('all')
    let finalResults = []

    try {
      // Use the stripped topic as the cache + expansion key, not the full query
      const expandKey = topic.toLowerCase()
      let terms = expandCacheRef.current[expandKey]
      if (!terms) {
        const prompt = `You are a text analysis assistant for Edinburgh Airport's CX team.

The analyst wants to search customer feedback for responses related to: "${topic}"

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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, maxTokens: 400 }),
        })
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const { content } = await res.json()
        const m = content.match(/\[[\s\S]*?\]/)
        if (!m) throw new Error('AI returned unexpected format')
        terms = JSON.parse(m[0]).filter(t => typeof t === 'string' && t.length > 0)
        expandCacheRef.current[expandKey] = terms
      }

      setExpandedTerms(terms)
      let results = bm25Search(terms, analysis.texts, bm25Index)

      // ── Sentiment pre-filter ────────────────────────────────────
      // e.g. "negative comments about check in" → keep only negative-labelled responses
      if (sentimentIntent) {
        results = results.filter(r => analysis.sentiments[r.idx]?.label === sentimentIntent)
        // Re-normalise scores after filtering
        const maxScore = results[0]?.score ?? 1
        results = results.map(r => ({ ...r, normScore: r.score / maxScore }))
      }

      finalResults = results
      setSearchResults(results)
      setFocusedAnalysis(computeFocusedAnalysis(results.map(r => r.text)))
    } catch (e) {
      const fallback = analysis.texts
        .map((text, idx) => ({ text, idx, score: text.toLowerCase().includes(q.toLowerCase()) ? 1 : 0, normScore: text.toLowerCase().includes(q.toLowerCase()) ? 1 : 0 }))
        .filter(r => r.normScore > 0)
      finalResults = fallback
      setExpandedTerms([q]); setSearchResults(fallback)
      setFocusedAnalysis(computeFocusedAnalysis(fallback.map(r => r.text)))
      if (fallback.length === 0) setSearchError(e.message || 'Search failed')
    } finally {
      setSearchLoading(false)
    }

    if (finalResults.length > 0) runRelevanceCheck(finalResults, q, sentimentIntent)
  }, [searchQuery, analysis, bm25Index])

  const removeTerm = useCallback((term) => {
    setRelevanceVerdicts({}); setShowOnlyRelevant(false)
    setExpandedTerms(prev => {
      const next = prev.filter(t => t !== term)
      if (analysis && bm25Index && next.length > 0) {
        const results = bm25Search(next, analysis.texts, bm25Index)
        setSearchResults(results)
        setFocusedAnalysis(computeFocusedAnalysis(results.map(r => r.text)))
      } else { setSearchResults(null); setFocusedAnalysis(null) }
      return next
    })
  }, [analysis, bm25Index])

  const runFocusedAiAnalysis = useCallback(async () => {
    if (!focusedAnalysis || !searchQuery) return
    setFocusedAiLoading(true); setFocusedAiError(null); setFocusedAiOutput('')
    const samples = focusedAnalysis.texts.slice(0, 60).map((t, i) => `${i + 1}. ${t}`).join('\n')
    const prompt  = `You are a CX analyst for Edinburgh Airport. A team member searched for: "${searchQuery}"

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1200 }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const { content } = await res.json()
      setFocusedAiOutput(content || 'No response received.')
    } catch (e) { setFocusedAiError(e.message || 'Failed to contact AI service.')
    } finally   { setFocusedAiLoading(false) }
  }, [focusedAnalysis, searchQuery])

  const runAiAnalysis = useCallback(async () => {
    if (!analysis) return
    setAiLoading(true); setAiError(null); setAiOutput('')
    const samples = analysis.texts.slice(0, 80).join('\n- ')
    const prompt  = `You are a CX analyst for Edinburgh Airport. Analyse the following ${analysis.total} customer feedback responses from the column "${activeCol}".

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1200 }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const { content } = await res.json()
      setAiOutput(content || 'No response received.')
    } catch (e) { setAiError(e.message || 'Failed to contact AI service.')
    } finally   { setAiLoading(false) }
  }, [analysis, activeCol])

  const filteredRows = useMemo(() => {
    if (!analysis) return []
    let pairs = analysis.texts.map((text, i) => ({ text, sentiment: analysis.sentiments[i] }))
    if (sentimentTab !== 'all') pairs = pairs.filter(p => p.sentiment.label === sentimentTab)
    if (selectedPhrases.length > 0) {
      pairs = pairs.filter(p => selectedPhrases.every(phrase => p.text.toLowerCase().includes(phrase.toLowerCase())))
    }
    if (selectedMustPresets.length > 0) {
      pairs = pairs.filter(p => matchesPresets(p.text, selectedMustPresets))
    }
    return pairs
  }, [analysis, sentimentTab, selectedPhrases, selectedMustPresets])

  const relevanceSummary = useMemo(() => {
    const vals = Object.values(relevanceVerdicts)
    if (!vals.length) return null
    return { confirmed: vals.filter(v => v.relevant).length, rejected: vals.filter(v => !v.relevant).length, total: vals.length }
  }, [relevanceVerdicts])

  const mustContainWords = useMemo(() =>
    mustContainQuery.trim().toLowerCase().split(/[\s,]+/).filter(w => w.length > 0),
    [mustContainQuery]
  )

  const displayedResults = useMemo(() => {
    if (!searchResults) return []
    let base = searchResults
    if (showOnlyRelevant && relevanceSummary) {
      base = base.filter(r => relevanceVerdicts[r.idx]?.relevant === true)
    }
    if (searchSentimentFilter !== 'all' && focusedAnalysis) {
      base = base.filter(r => {
        const siIdx = searchResults.findIndex(sr => sr.idx === r.idx)
        return focusedAnalysis.sentiments[siIdx]?.label === searchSentimentFilter
      })
    }
    if (mustContainWords.length > 0) {
      base = base.filter(r => mustContainWords.every(w => r.text.toLowerCase().includes(w)))
    }
    if (selectedMustPresets.length > 0) {
      base = base.filter(r => matchesPresets(r.text, selectedMustPresets))
    }
    return base
  }, [searchResults, showOnlyRelevant, relevanceVerdicts, relevanceSummary, searchSentimentFilter, focusedAnalysis, mustContainWords, selectedMustPresets])

  function exportResults() {
    if (!searchResults || !focusedAnalysis) return
    const rows = searchResults.map(({ text, idx, normScore }) => {
      const verdict   = relevanceVerdicts[idx]
      const siIdx     = searchResults.findIndex(r => r.idx === idx)
      const sentiment = focusedAnalysis.sentiments[siIdx]
      return {
        'Row #':        idx + 1, 'Response': text, 'Match %': Math.round(normScore * 100),
        'Sentiment':    sentiment?.label || '', 'Sent. Score': sentiment ? (sentiment.score >= 0 ? '+' : '') + sentiment.score.toFixed(2) : '',
        'Relevant':     verdict ? (verdict.relevant ? 'Yes' : 'No') : 'Not reviewed',
        'AI Reason':    verdict?.reason || '', 'Search Query': searchQuery,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] || '').length).slice(0, 30)) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Topic Results')
    XLSX.writeFile(wb, `topic-search-${searchQuery.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)}.xlsx`)
  }

  // ── Derived display values ───────────────────────────────────

  const pieData = analysis
    ? SENTIMENT_LABELS.map(label => ({
        name: label.charAt(0).toUpperCase() + label.slice(1),
        value: analysis.sentimentCounts[label],
      })).filter(d => d.value > 0)
    : []

  const avgLabel = !analysis ? null
    : analysis.avgScore > 0.02 ? 'positive' : analysis.avgScore < -0.02 ? 'negative' : 'neutral'

  // ── Empty states ─────────────────────────────────────────────

  if (!dataset) {
    return (
      <EmptyCard
        icon={Type}
        title="No data loaded"
        subtitle="Upload a CSV or Excel file to start analysing free-text responses."
      />
    )
  }

  if (textColumns.length === 0) {
    return (
      <EmptyCard
        icon={MessageSquare}
        title="No text columns detected"
        subtitle="Text Analysis works with free-text or long categorical columns (avg. length > 20 characters)."
      />
    )
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-7 pb-8">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
              <Type className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Text Analysis</h1>
          </div>
          <p className="text-sm text-slate-500 ml-10.5">
            Sentiment, keyword and topic intelligence from free-text feedback
          </p>
        </div>
        {analysis && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Responses</p>
              <p className="text-base font-bold text-slate-700">{analysis.total.toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Column</p>
              <p className="text-sm font-semibold text-blue-600 truncate max-w-[120px]">{activeCol}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Column selector ── */}
      <div>
        <SectionLabel>Select column to analyse</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {textColumns.map(col => (
            <button
              key={col}
              onClick={() => selectColumn(col)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                activeCol === col
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm'
              }`}
            >
              <Hash className={`w-3 h-3 ${activeCol === col ? 'opacity-70' : 'opacity-40'}`} />
              {col}
            </button>
          ))}
        </div>
        {!activeCol && (
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3" /> Choose a column above to begin
          </p>
        )}
      </div>

      {analysis && (
        <>
          {/* ── Overview stat strip ── */}
          <div className="grid grid-cols-3 gap-3">
            {SENTIMENT_LABELS.map(label => {
              const count = analysis.sentimentCounts[label]
              const pct   = analysis.total ? Math.round(count / analysis.total * 100) : 0
              return (
                <Card key={label} className={`p-4 border-l-4 ${SENTIMENT_BORDER[label]}`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${SENTIMENT_TEXT[label]}`}>{label}</span>
                    <span className={`text-[11px] font-bold px-1.5 py-px rounded-md ${SENTIMENT_BG[label]} ${SENTIMENT_TEXT[label]}`}>{pct}%</span>
                  </div>
                  <p className={`text-2xl font-black ${SENTIMENT_TEXT[label]}`}>{count.toLocaleString()}</p>
                  <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${SENTIMENT_BAR[label]} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </Card>
              )
            })}
          </div>

          {/* ── 4-panel grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Panel 1: Sentiment breakdown */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-700">Sentiment Breakdown</p>
                {avgLabel && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Overall:</span>
                    <SentimentBadge label={avgLabel} />
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                      paddingAngle={3}
                    >
                      {pieData.map(entry => (
                        <Cell key={entry.name} fill={SENTIMENT_COLOURS[entry.name.toLowerCase()]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontSize: 12 }}
                      formatter={(v, n) => [`${v} responses`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {SENTIMENT_LABELS.map(label => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SENTIMENT_COLOURS[label] }} />
                    <span className="text-[11px] text-slate-500 capitalize">{label}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Panel 2: Top keywords */}
            <Card className="p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Top Keywords</p>
              {analysis.keywords.length === 0 ? (
                <p className="text-xs text-slate-400">Not enough text data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart
                    data={analysis.keywords.slice(0, 12).reverse()}
                    layout="vertical"
                    margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="word" tick={{ fontSize: 11, fill: '#64748b' }} width={76} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontSize: 12 }}
                      formatter={v => [`${v} occurrences`, 'Count']}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={18}>
                      {analysis.keywords.slice(0, 12).map((_, i) => (
                        <Cell key={i} fill="#3b82f6" fillOpacity={0.55 + i * 0.035} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Panel 3: Key phrases */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-slate-700">Recurring Phrases</p>
                {selectedPhrases.length > 0 && (
                  <button
                    onClick={() => setSelectedPhrases([])}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear filters
                  </button>
                )}
              </div>
              {selectedPhrases.length > 0 && (
                <p className="text-[10px] text-blue-500 mb-3">Filtering responses by {selectedPhrases.length} phrase{selectedPhrases.length > 1 ? 's' : ''}</p>
              )}
              {!selectedPhrases.length && (
                <p className="text-[10px] text-slate-400 mb-3">Click a phrase to filter the Response Explorer</p>
              )}
              {analysis.phrases.length === 0 ? (
                <p className="text-xs text-slate-400">No recurring phrases found.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {analysis.phrases.map(({ phrase, count }, i) => {
                    const isActive = selectedPhrases.includes(phrase)
                    return (
                      <button
                        key={phrase}
                        onClick={() => setSelectedPhrases(prev =>
                          isActive ? prev.filter(p => p !== phrase) : [...prev, phrase]
                        )}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-medium border transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                            : 'text-slate-600 border-slate-200 bg-slate-50 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50'
                        }`}
                        style={{ fontSize: i < 3 ? 13 : 11 }}
                      >
                        {phrase}
                        <span className={`font-bold px-1.5 py-px rounded-full text-[10px] ${
                          isActive ? 'bg-white/20 text-white' : 'bg-white border border-slate-200 text-blue-600'
                        }`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Panel 4: AI topic analysis */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-700">AI Topic Analysis</p>
                {aiOutput && !aiLoading && (
                  <button onClick={runAiAnalysis} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors">
                    <RefreshCw className="w-3 h-3" /> Re-run
                  </button>
                )}
              </div>

              {!aiOutput && !aiLoading && !aiError && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                  </div>
                  <p className="text-xs text-slate-400 text-center leading-relaxed max-w-[200px]">
                    Send all responses to AI for deep theme and topic analysis
                  </p>
                  <button
                    onClick={runAiAnalysis}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-200"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Analyse with AI
                  </button>
                </div>
              )}

              {aiLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  </div>
                  <p className="text-xs text-slate-400">Analysing {analysis.total} responses…</p>
                </div>
              )}

              {aiError && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{aiError}</p>
                  </div>
                  <button onClick={runAiAnalysis} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                </div>
              )}

              {aiOutput && !aiLoading && (
                <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                  {renderMarkdown(aiOutput)}
                </div>
              )}
            </Card>
          </div>

          {/* ── Topic Search ── */}
          <Card className="overflow-hidden">
            {/* Search header */}
            <div className="px-6 pt-6 pb-5 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Search className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">Topic Search</h3>
              </div>
              <p className="text-xs text-slate-400 ml-10">
                Describe what you're looking for — AI expands it into related terms, finds matching responses, then reviews each result for genuine relevance.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Search input */}
              <div className="space-y-2.5">
                <div className="flex gap-2.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && runFocusedSearch()}
                      placeholder='e.g. "kids softplay", "queue wait times", "food and drink quality"'
                      className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-slate-700 placeholder:text-slate-300 transition-all"
                    />
                  </div>
                  <button
                    onClick={runFocusedSearch}
                    disabled={!searchQuery.trim() || searchLoading}
                    className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200 whitespace-nowrap"
                  >
                    {searchLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</>
                      : <><Search className="w-3.5 h-3.5" /> Search</>}
                  </button>
                </div>
                {/* Must-contain filter */}
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                  <input
                    type="text"
                    value={mustContainQuery}
                    onChange={e => setMustContainQuery(e.target.value)}
                    placeholder='Must contain words (e.g. "staff rude") — filters results to only responses containing these words'
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 text-slate-700 placeholder:text-slate-300 transition-all"
                  />
                  {mustContainQuery && (
                    <button
                      onClick={() => setMustContainQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {mustContainWords.length > 0 && searchResults !== null && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1.5">
                    <Hash className="w-3 h-3" />
                    Must-contain active: <strong>{mustContainWords.join(', ')}</strong> — showing {displayedResults.length} of {searchResults.length} results
                  </p>
                )}

                {/* Area presets */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Area filters — fuzzy match on misspellings
                    </p>
                    {selectedMustPresets.length > 0 && (
                      <button
                        onClick={() => setSelectedMustPresets([])}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(MUST_CONTAIN_PRESETS).map(([key, preset]) => {
                      const isActive = selectedMustPresets.includes(key)
                      const colours  = PRESET_COLOUR_MAP[preset.color]
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedMustPresets(prev =>
                            isActive ? prev.filter(k => k !== key) : [...prev, key]
                          )}
                          title={`Matches: ${preset.variants.slice(0, 6).join(', ')}…`}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                            isActive ? colours.chip : colours.inactive
                          }`}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                  {selectedMustPresets.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      Filtering to responses mentioning: <strong className="text-slate-600">{selectedMustPresets.map(k => MUST_CONTAIN_PRESETS[k].label).join(' + ')}</strong>
                      {searchResults !== null && <span> — {displayedResults.length} of {searchResults.length} results match</span>}
                    </p>
                  )}
                </div>
              </div>

              {/* Detected intent badge */}
              {detectedIntent && (
                <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-medium ${
                  detectedIntent.sentimentIntent === 'negative'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    detectedIntent.sentimentIntent === 'negative' ? 'bg-red-400' : 'bg-emerald-400'
                  }`} />
                  Searching for <strong className="mx-0.5">{detectedIntent.sentimentIntent}</strong> responses about
                  <strong className="ml-0.5">"{detectedIntent.topic}"</strong>
                  <span className="ml-auto text-[10px] opacity-60">Sentiment pre-filtered · AI will confirm each result</span>
                </div>
              )}

              {/* Expanded terms */}
              {expandedTerms.length > 0 && (
                <div className="p-3.5 bg-violet-50 border border-violet-100 rounded-xl">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-2.5">
                    AI expanded to {expandedTerms.length} search terms
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {expandedTerms.map(term => (
                      <span
                        key={term}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-violet-200 rounded-full text-[11px] text-violet-700 font-medium shadow-xs"
                      >
                        {term}
                        <button
                          onClick={() => removeTerm(term)}
                          className="text-violet-300 hover:text-red-400 transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {searchError && (
                <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-600">{searchError}</p>
                </div>
              )}

              {/* Idle state */}
              {searchResults === null && !searchLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-300">
                  <Search className="w-8 h-8" />
                  <p className="text-xs">Describe any topic above to search the responses</p>
                </div>
              )}

              {/* ── Focused FTA ── */}
              {focusedAnalysis && searchResults !== null && (
                <div className="space-y-6 pt-1">

                  {/* Result header */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[11px] text-slate-400 font-medium shrink-0">
                      {focusedAnalysis.total} matching response{focusedAnalysis.total !== 1 ? 's' : ''} found
                    </span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>

                  {/* Focused sentiment stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {SENTIMENT_LABELS.map(label => {
                      const count = focusedAnalysis.sentimentCounts[label]
                      const pct   = Math.round(count / focusedAnalysis.total * 100)
                      return (
                        <div key={label} className={`rounded-xl p-3.5 border ${SENTIMENT_BG[label]} ${SENTIMENT_BORDER[label]}`}>
                          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${SENTIMENT_TEXT[label]}`}>{label}</p>
                          <p className={`text-2xl font-black ${SENTIMENT_TEXT[label]}`}>{count}</p>
                          <div className="mt-2 h-1 rounded-full bg-white/60 overflow-hidden">
                            <div className={`h-full rounded-full ${SENTIMENT_BAR[label]}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className={`text-[10px] mt-1 font-medium ${SENTIMENT_TEXT[label]} opacity-70`}>{pct}%</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Keywords + Phrases */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <SectionLabel>Top keywords in results</SectionLabel>
                      {focusedAnalysis.keywords.length === 0
                        ? <p className="text-xs text-slate-400">Not enough data.</p>
                        : (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart
                              data={focusedAnalysis.keywords.slice(0, 10).reverse()}
                              layout="vertical"
                              margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
                            >
                              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                              <YAxis type="category" dataKey="word" tick={{ fontSize: 10, fill: '#64748b' }} width={68} axisLine={false} tickLine={false} />
                              <Tooltip
                                contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontSize: 12 }}
                                formatter={v => [`${v} occurrences`, 'Count']}
                                cursor={{ fill: '#f8fafc' }}
                              />
                              <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={14}>
                                {focusedAnalysis.keywords.slice(0, 10).map((_, i) => (
                                  <Cell key={i} fill="#8b5cf6" fillOpacity={0.5 + i * 0.045} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )
                      }
                    </div>
                    <div>
                      <SectionLabel>Recurring phrases</SectionLabel>
                      {focusedAnalysis.phrases.length === 0
                        ? <p className="text-xs text-slate-400">No recurring phrases.</p>
                        : (
                          <div className="flex flex-wrap gap-1.5">
                            {focusedAnalysis.phrases.map(({ phrase, count }) => (
                              <span key={phrase} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-medium text-slate-600">
                                {phrase}
                                <span className="bg-white border border-slate-200 text-violet-600 font-bold px-1.5 rounded-full text-[10px]">{count}</span>
                              </span>
                            ))}
                          </div>
                        )
                      }
                    </div>
                  </div>

                  {/* AI deep-dive */}
                  <Card className="border-dashed">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          </div>
                          <p className="text-xs font-semibold text-slate-700">AI Deep-Dive</p>
                          <span className="text-[10px] text-slate-400">— scoped to these {focusedAnalysis.total} responses</span>
                        </div>
                        {focusedAiOutput && !focusedAiLoading && (
                          <button onClick={runFocusedAiAnalysis} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors">
                            <RefreshCw className="w-3 h-3" /> Re-run
                          </button>
                        )}
                      </div>

                      {!focusedAiOutput && !focusedAiLoading && !focusedAiError && (
                        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
                          <p className="text-xs text-amber-700">Get a focused AI analysis of only these matched responses</p>
                          <button
                            onClick={runFocusedAiAnalysis}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 active:scale-95 transition-all shrink-0 ml-3"
                          >
                            <Sparkles className="w-3 h-3" /> Analyse
                          </button>
                        </div>
                      )}

                      {focusedAiLoading && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                          <p className="text-xs text-slate-500">Analysing {focusedAnalysis.total} responses…</p>
                        </div>
                      )}

                      {focusedAiError && (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600">{focusedAiError}</p>
                          </div>
                          <button onClick={runFocusedAiAnalysis} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Retry
                          </button>
                        </div>
                      )}

                      {focusedAiOutput && !focusedAiLoading && (
                        <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                          {renderMarkdown(focusedAiOutput)}
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* ── Matched responses ── */}
                  <div>
                    {/* Controls bar */}
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <SectionLabel>Matched responses</SectionLabel>
                          {relevanceLoading && (
                            <span className="flex items-center gap-1.5 text-[11px] text-violet-500 -mt-3">
                              <Loader2 className="w-3 h-3 animate-spin" /> reviewing relevance…
                            </span>
                          )}
                          {relevanceSummary && !relevanceLoading && (
                            <div className="flex items-center gap-2 -mt-3">
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                <CheckCircle2 className="w-3 h-3" /> {relevanceSummary.confirmed} confirmed
                              </span>
                              <span className="text-slate-200">·</span>
                              <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                                <XCircle className="w-3 h-3" /> {relevanceSummary.rejected} filtered out
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {relevanceSummary && !relevanceLoading && (
                            <button
                              onClick={() => setShowOnlyRelevant(v => !v)}
                              className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                                showOnlyRelevant
                                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200'
                                  : 'text-slate-500 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
                              }`}
                            >
                              {showOnlyRelevant ? '✓ Relevant only' : 'Show relevant only'}
                            </button>
                          )}
                          <button
                            onClick={exportResults}
                            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium"
                          >
                            <Download className="w-3 h-3" /> Export
                          </button>
                        </div>
                      </div>

                      {/* Sentiment filter */}
                      <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
                        {['all', 'positive', 'negative', 'neutral'].map(f => (
                          <button
                            key={f}
                            onClick={() => setSearchSentimentFilter(f)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize ${
                              searchSentimentFilter === f
                                ? f === 'positive' ? 'bg-emerald-500 text-white shadow-sm'
                                  : f === 'negative' ? 'bg-red-500 text-white shadow-sm'
                                  : f === 'neutral' ? 'bg-slate-400 text-white shadow-sm'
                                  : 'bg-white text-slate-700 shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            {f === 'all'
                              ? `All · ${searchResults?.length ?? 0}`
                              : `${f.charAt(0).toUpperCase() + f.slice(1)} · ${focusedAnalysis?.sentimentCounts[f] ?? 0}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Result cards */}
                    {displayedResults.length === 0 ? (
                      <div className="flex flex-col items-center py-10 gap-2 text-slate-300">
                        <Search className="w-6 h-6" />
                        <p className="text-xs">{showOnlyRelevant ? 'No confirmed-relevant responses yet' : 'No results'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {displayedResults.map(({ text, idx, normScore }, i) => {
                          const verdict   = relevanceVerdicts[idx]
                          const isChecked = verdict !== undefined
                          const siIdx     = searchResults.findIndex(r => r.idx === idx)
                          const sentiment = focusedAnalysis.sentiments[siIdx]

                          // Card left-border colour by relevance state
                          const borderColor = isChecked
                            ? verdict.relevant ? 'border-l-emerald-400' : 'border-l-red-300'
                            : relevanceLoading ? 'border-l-blue-300' : 'border-l-slate-200'

                          return (
                            <div
                              key={idx}
                              className={`group bg-white border border-slate-100 border-l-4 rounded-xl px-4 py-3.5 shadow-xs hover:shadow-sm transition-all ${borderColor} ${isChecked && !verdict.relevant ? 'opacity-45' : ''}`}
                            >
                              {/* Response text */}
                              <p className="text-sm text-slate-700 leading-relaxed mb-2.5">
                                {highlightText(text, expandedTerms)}
                              </p>

                              {/* Footer row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Match pill */}
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-semibold text-slate-500">
                                  <TrendingUp className="w-2.5 h-2.5" />
                                  {Math.round(normScore * 100)}% match
                                </span>

                                {/* Row number */}
                                <span className="text-[10px] text-slate-300">row {idx + 1}</span>

                                <div className="flex-1" />

                                {/* Relevance verdict */}
                                {relevanceLoading && !isChecked && (
                                  <span className="flex items-center gap-1 text-[10px] text-blue-400">
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> checking…
                                  </span>
                                )}
                                {isChecked && verdict.relevant && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] text-emerald-600 font-medium">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" /> {verdict.reason}
                                  </span>
                                )}
                                {isChecked && !verdict.relevant && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[10px] text-red-500 font-medium">
                                    <XCircle className="w-3 h-3 shrink-0" /> {verdict.reason}
                                  </span>
                                )}

                                {/* Sentiment */}
                                {sentiment && <SentimentBadge label={sentiment.label} size="xs" />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ── Response Explorer ── */}
          <Card>
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Response Explorer</p>
                </div>
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                  {['all', ...SENTIMENT_LABELS].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSentimentTab(tab)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize ${
                        sentimentTab === tab
                          ? 'bg-white text-slate-700 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {tab === 'all'
                        ? `All · ${analysis.total}`
                        : `${tab.charAt(0).toUpperCase() + tab.slice(1)} · ${analysis.sentimentCounts[tab]}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4">
              {filteredRows.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No responses in this category.</p>
              ) : (
                <div className="space-y-1">
                  {filteredRows.map(({ text, sentiment }, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                    >
                      <span className="text-[11px] text-slate-300 w-5 shrink-0 pt-0.5 font-mono tabular-nums">{i + 1}</span>
                      <p className="text-sm text-slate-600 flex-1 leading-relaxed">{text}</p>
                      <SentimentBadge label={sentiment.label} size="xs" />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-3 text-center">
                {filteredRows.length.toLocaleString()} of {analysis.total.toLocaleString()} responses shown
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
