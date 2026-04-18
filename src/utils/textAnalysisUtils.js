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

// ── Negation words (flip the next sentiment word within a 3-token window) ──
const NEGATION_WORDS = new Set([
  'not','no','never','neither','nor','nothing','nobody','nowhere',
  'cant','cannot','wont','dont','doesnt','didnt','wasnt','werent',
  'isnt','arent','havent','hasnt','hadnt','wouldnt','couldnt','shouldnt',
  'hardly','scarcely','barely','without','lack','lacking','failed','fails',
])

// ── Intensifiers (multiply adjacent sentiment word by 1.5) ──
const INTENSIFIERS = new Set([
  'very','extremely','really','absolutely','totally','completely','utterly',
  'incredibly','exceptionally','particularly','especially','highly','deeply',
  'terribly','awfully','dreadfully','horribly','so','such','quite','rather',
])

// ── Weighted positive words (2 = strong, 1 = normal) ──
const POSITIVE_WEIGHTS = {
  // Strong (2)
  excellent:2, outstanding:2, exceptional:2, fantastic:2, amazing:2, superb:2,
  brilliant:2, perfect:2, wonderful:2, incredible:2, phenomenal:2, magnificent:2,
  extraordinary:2, immaculate:2, spotless:2, impeccable:2, flawless:2,
  // Normal (1)
  good:1, great:1, nice:1, happy:1, pleased:1, satisfied:1, love:1, loved:1,
  helpful:1, friendly:1, efficient:1, easy:1, smooth:1, clean:1, comfortable:1,
  fast:1, quick:1, convenient:1, pleasant:1, professional:1, polite:1, welcoming:1,
  clear:1, safe:1, lovely:1, beautiful:1, awesome:1, delightful:1, refreshing:1,
  spacious:1, organized:1, organised:1, modern:1, bright:1, tasty:1, fresh:1,
  generous:1, impressed:1, enjoyed:1, enjoy:1, recommend:1, positive:1, prompt:1,
  attentive:1, courteous:1, well:1, better:1, improved:1, improving:1, best:1,
  warm:1, welcoming:1, relaxing:1, stress:0, hassle:0, smooth:1, seamless:1,
  lovely:1, reasonable:1, affordable:1, value:1, worth:1, tidy:1, neat:1,
  responsive:1, reliable:1, punctual:1, comfortable:1, enjoyable:1, impressive:1,
}

// ── Weighted negative words (2 = strong, 1 = normal) ──
const NEGATIVE_WEIGHTS = {
  // Strong (2)
  terrible:2, horrible:2, awful:2, dreadful:2, disgusting:2, appalling:2,
  atrocious:2, deplorable:2, abysmal:2, pathetic:2, outrageous:2, unacceptable:2,
  shocking:2, disgraceful:2, horrendous:2,
  // Normal (1)
  bad:1, poor:1, disappointing:1, disappointed:1, unpleasant:1, rude:1,
  dirty:1, broken:1, frustrated:1, frustrating:1, annoying:1, irritating:1,
  unhelpful:1, difficult:1, confusing:1, confused:1, uncomfortable:1, unfriendly:1,
  fail:1, failed:1, failing:1, wrong:1, missing:1, messy:1, chaotic:1, stressful:1,
  overpriced:1, unfair:1, late:1, cancelled:1, ignored:1,
  insufficient:1, inadequate:1, unprofessional:1, unclean:1, overcrowded:1,
  cramped:1, noisy:1, expensive:1, useless:1, waste:1, wasted:1, worst:1,
  slow:1, delayed:1, overcrowded:1, smelly:1, faulty:1, broken:1,
  ripped:1, scam:1, avoid:1, never:0,  // never handled by negation
  long:1, wait:1, queue:1, delay:1, crowded:1, cold:1, limited:1,
  // context-dependent but leaning negative in airport CX
}

// ── Multi-word sentiment phrases (checked before token-level scoring) ──
const NEGATIVE_PHRASES = [
  'not enough','too slow','too long','too busy','too crowded','too expensive',
  'not happy','not satisfied','not good','not great','not clean','not helpful',
  'not friendly','could be better','needs improvement','room for improvement',
  'left a lot to be desired','not up to standard','not worth','poor value',
  'not value for money','very disappointing','very poor','very bad','not impressed',
  'not pleasant','not comfortable','not working','out of order','not open',
  'no seating','no seats','nowhere to sit','no wifi','no water','no food',
  'wasted time','long wait','long queue','ages to','waited ages',
]

const POSITIVE_PHRASES = [
  'very good','very clean','very friendly','very helpful','very efficient',
  'well done','great job','highly recommend','really impressed','very pleased',
  'really happy','well organised','well organized','great experience','loved it',
  'really enjoyed','no wait','no queue','no delay','no problem','no issues',
  'ran smoothly','went smoothly','exceeded expectations','above and beyond',
  'value for money','good value',
]

/**
 * Score sentiment of a single text string.
 * Uses: negation windows, intensifiers, weighted word lists, multi-word phrases.
 * @param {string} text
 * @returns {{ score: number, label: 'positive'|'negative'|'neutral', pos: number, neg: number }}
 */
export function scoreSentiment(text) {
  const raw = String(text || '').toLowerCase()
  const tokens = raw.split(/[^a-z']+/).filter(w => w.length >= 1)

  // ── Phase 1: phrase-level scoring ──
  let phraseScore = 0
  for (const phrase of NEGATIVE_PHRASES) {
    if (raw.includes(phrase)) phraseScore -= 1.5
  }
  for (const phrase of POSITIVE_PHRASES) {
    if (raw.includes(phrase)) phraseScore += 1.5
  }

  // ── Phase 2: token-level scoring with negation + intensifiers ──
  let pos = 0, neg = 0
  let negWindow = 0   // counts down; sentiment word applies negation while > 0
  let amplify   = 1.0 // multiplier from intensifier

  for (const t of tokens) {
    // Normalise contractions: "wasn't" → "wasnt"
    const tok = t.replace(/'/g, '')

    if (NEGATION_WORDS.has(tok)) {
      negWindow = 4   // negation applies to the next sentiment word within 4 tokens
      amplify = 1.0
      continue
    }

    if (INTENSIFIERS.has(tok)) {
      amplify = 1.5
      continue
    }

    const posW = POSITIVE_WEIGHTS[tok]
    const negW = NEGATIVE_WEIGHTS[tok]

    if (posW && posW > 0) {
      const val = posW * amplify
      if (negWindow > 0) {
        neg += val          // "not good" → negative
      } else {
        pos += val
      }
      negWindow = 0         // consumed
      amplify = 1.0
    } else if (negW && negW > 0) {
      const val = negW * amplify
      if (negWindow > 0) {
        pos += val * 0.4    // "not bad" → weakly positive
      } else {
        neg += val
      }
      negWindow = 0
      amplify = 1.0
    } else {
      // Non-sentiment word: tick down the negation window
      if (negWindow > 0) negWindow--
    }
  }

  // ── Combine and normalise ──
  const rawScore  = (pos - neg) + phraseScore
  // Normalise by sqrt of length so longer responses don't dilute short strong ones
  const normDenom = Math.max(Math.sqrt(tokens.length), 2)
  const score     = rawScore / normDenom

  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral'
  return { score, label, pos: Math.round(pos * 10) / 10, neg: Math.round(neg * 10) / 10 }
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
