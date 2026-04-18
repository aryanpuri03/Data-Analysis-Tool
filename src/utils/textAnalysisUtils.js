/**
 * Client-side NLP utilities for free-text analysis.
 * Pure JS — no external dependencies.
 */

export const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can','could',
  'i','me','my','myself','we','our','you','your','he','she','it','they','them','their',
  'this','that','these','those','and','but','or','nor','for','so','yet',
  'at','by','in','on','to','up','as','of','from','with','about','against','between',
  'into','through','during','before','after','above','below',
  'each','few','more','most','other','some','such','no','not','only','own','same',
  'than','too','very','just','because','while','although','however','therefore',
  'also','both','either','whether','though','since','unless','until',
  'if','when','where','who','which','what','how',
  'all','any','every','much','many','one','two','first','last',
  'new','old','good','said','get','go','now','then','here','there',
  'its','his','her','our','their','we','us','him','she','he',
  'been','went','got','put','let','see','say','know','think','come','take','make',
  'would','could','should','might','must','shall','will','can','may',
])

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z']+/)
    .map(w => w.replace(/^'+|'+$/g, ''))
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

/**
 * Extract top keywords using TF-IDF-style scoring.
 * @param {string[]} texts
 * @param {number} topN
 * @returns {{ word: string, count: number, score: number }[]}
 */
export function extractKeywords(texts, topN = 20) {
  const tf = {}       // term → total count
  const df = {}       // term → number of docs containing it
  const n = texts.length || 1

  for (const text of texts) {
    const tokens = tokenize(text)
    const seen = new Set()
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1
      if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t) }
    }
  }

  const totalTerms = Object.values(tf).reduce((a, b) => a + b, 1)
  const scored = Object.entries(tf).map(([word, count]) => ({
    word,
    count,
    score: (count / totalTerms) * Math.log((n / (df[word] || 1)) + 1),
  }))

  return scored.sort((a, b) => b.score - a.score).slice(0, topN)
}

/**
 * Extract top bigrams and trigrams (stop-word filtered).
 * @param {string[]} texts
 * @param {number} topN
 * @returns {{ phrase: string, count: number }[]}
 */
export function extractPhrases(texts, topN = 15) {
  const freq = {}

  for (const text of texts) {
    const words = String(text || '')
      .toLowerCase()
      .split(/[^a-z']+/)
      .map(w => w.replace(/^'+|'+$/g, ''))
      .filter(w => w.length >= 2)

    for (let i = 0; i < words.length - 1; i++) {
      // Bigrams
      if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
        const bi = `${words[i]} ${words[i + 1]}`
        freq[bi] = (freq[bi] || 0) + 1
      }
      // Trigrams
      if (i < words.length - 2 && !STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 2])) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`
        freq[tri] = (freq[tri] || 0) + 1
      }
    }
  }

  return Object.entries(freq)
    .filter(([, c]) => c > 1)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
}

const POSITIVE_WORDS = new Set([
  'good','great','excellent','amazing','wonderful','fantastic','outstanding','positive',
  'happy','pleased','satisfied','love','best','perfect','friendly','helpful','efficient',
  'easy','smooth','clean','comfortable','fast','quick','convenient','pleasant','nice',
  'brilliant','superb','impressive','enjoyable','professional','polite','welcoming',
  'clear','safe','lovely','beautiful','awesome','delightful','refreshing','spacious',
  'organised','organised','organized','modern','bright','tasty','fresh','generous',
])

const NEGATIVE_WORDS = new Set([
  'bad','poor','terrible','awful','horrible','worst','disappointing','unpleasant',
  'rude','slow','dirty','broken','confused','frustrated','annoying','unhelpful',
  'long','wait','delay','queue','crowded','noisy','expensive','difficult','confusing',
  'uncomfortable','unfriendly','problem','issue','complaint','fail','wrong','missing',
  'lost','cold','empty','messy','chaotic','stressful','overpriced','limited',
  'broken','unfair','late','cancelled','ignored','lack','awful','disgusting',
  'insufficient','inadequate','disappointing','unprofessional','unclean',
])

/**
 * Score sentiment of a single text string.
 * @param {string} text
 * @returns {{ score: number, label: 'positive'|'negative'|'neutral', pos: number, neg: number }}
 */
export function scoreSentiment(text) {
  const tokens = String(text || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2)
  let pos = 0, neg = 0
  for (const t of tokens) {
    if (POSITIVE_WORDS.has(t)) pos++
    if (NEGATIVE_WORDS.has(t)) neg++
  }
  const total = Math.max(tokens.length, 1)
  const score = (pos - neg) / total
  const label = score > 0.02 ? 'positive' : score < -0.02 ? 'negative' : 'neutral'
  return { score, label, pos, neg }
}

// ─────────────────────────────────────────────────────────────────
// BM25 SEARCH ENGINE
// ─────────────────────────────────────────────────────────────────

const BM25_K1 = 1.5
const BM25_B  = 0.75

/**
 * Lightweight suffix stemmer — maps morphological variants to a root.
 * e.g. "queuing" → "queu", "delays" → "delay", "waiting" → "wait"
 * Used to boost matches between query terms and document tokens.
 */
export function stemWord(word) {
  const w = String(word || '').toLowerCase().trim()
  if (w.length <= 3) return w
  if (w.endsWith('ication') && w.length > 9) return w.slice(0, -7) + 'y'
  if (w.endsWith('iness')   && w.length > 7) return w.slice(0, -5) + 'y'
  if (w.endsWith('ation')   && w.length > 7) return w.slice(0, -5)
  if (w.endsWith('ness')    && w.length > 6) return w.slice(0, -4)
  if (w.endsWith('ment')    && w.length > 6) return w.slice(0, -4)
  if (w.endsWith('tion')    && w.length > 6) return w.slice(0, -4)
  if (w.endsWith('ity')     && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ful')     && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ous')     && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ing')     && w.length > 6) return w.slice(0, -3)
  if (w.endsWith('ies')     && w.length > 5) return w.slice(0, -3) + 'y'
  if (w.endsWith('ied')     && w.length > 5) return w.slice(0, -3) + 'y'
  if (w.endsWith('ves')     && w.length > 5) return w.slice(0, -3) + 'f'
  if (w.endsWith('ed')      && w.length > 5) return w.slice(0, -2)
  if (w.endsWith('er')      && w.length > 5) return w.slice(0, -2)
  if (w.endsWith('ly')      && w.length > 5) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 4) return w.slice(0, -1)
  return w
}

/**
 * Build a BM25 corpus index from an array of text strings.
 * Call once per column; cache the result in useMemo.
 * @param {string[]} texts
 * @returns {{ tokenizedDocs: string[][], N: number, avgdl: number, df: object }}
 */
export function buildBM25Index(texts) {
  const tokenizedDocs = texts.map(t =>
    String(t || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2)
  )
  const N     = texts.length
  const avgdl = tokenizedDocs.reduce((s, d) => s + d.length, 0) / Math.max(N, 1)

  // Document frequency: index both surface form and stem
  const df = {}
  for (const doc of tokenizedDocs) {
    const seen = new Set()
    for (const t of doc) {
      if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t) }
      const s = stemWord(t)
      if (s !== t && !seen.has(s)) { df[s] = (df[s] || 0) + 1; seen.add(s) }
    }
  }

  return { tokenizedDocs, N, avgdl, df }
}

function bm25DocScore(docTokens, queryTerms, N, avgdl, df) {
  const dl = docTokens.length
  // Build term-frequency map including stem variants
  const tfMap = {}
  for (const t of docTokens) {
    tfMap[t] = (tfMap[t] || 0) + 1
    const s = stemWord(t)
    if (s !== t) tfMap[s] = (tfMap[s] || 0) + 0.8
  }

  let score = 0
  for (const term of queryTerms) {
    const t   = term.toLowerCase()
    const tf  = (tfMap[t] || 0) + (tfMap[stemWord(t)] || 0) * 0.5
    if (tf === 0) continue
    const docFreq  = df[t] || df[stemWord(t)] || 0
    const idf      = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1)
    const tfNorm   = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl))
    score += idf * tfNorm
  }
  return score
}

/**
 * Search texts with BM25 using an array of expanded query terms.
 * @param {string[]} expandedTerms   — from AI query expansion
 * @param {string[]} texts           — raw text strings
 * @param {object}   index           — from buildBM25Index(texts)
 * @returns {{ text: string, idx: number, score: number, normScore: number }[]}
 */
export function bm25Search(expandedTerms, texts, index) {
  const { tokenizedDocs, N, avgdl, df } = index
  const qTerms = expandedTerms.map(t => t.toLowerCase().trim()).filter(Boolean)

  const results = texts
    .map((text, idx) => ({
      text,
      idx,
      score: bm25DocScore(tokenizedDocs[idx], qTerms, N, avgdl, df),
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)

  const maxScore = results[0]?.score || 1
  return results.map(r => ({ ...r, normScore: r.score / maxScore }))
}

// ─────────────────────────────────────────────────────────────────

/**
 * Analyse a text column from the dataset.
 * @param {object[]} rows
 * @param {string} column
 */
export function analyseColumn(rows, column) {
  const texts = rows
    .map(r => r[column])
    .filter(v => v != null && String(v).trim().length > 0)
    .map(v => String(v).trim())

  const sentiments = texts.map(t => scoreSentiment(t))
  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }
  for (const s of sentiments) sentimentCounts[s.label]++

  const avgScore = sentiments.length
    ? sentiments.reduce((a, s) => a + s.score, 0) / sentiments.length
    : 0

  return {
    texts,
    total: texts.length,
    sentiments,
    sentimentCounts,
    avgScore,
    keywords: extractKeywords(texts),
    phrases: extractPhrases(texts),
  }
}
