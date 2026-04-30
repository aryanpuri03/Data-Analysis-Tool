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

// ── Contrast/concession words — boost the clause that follows by 1.5x ──
// "The staff were lovely BUT the queues were horrendous" → horrendous weighted 1.5x
const CONTRAST_WORDS = new Set([
  'but','however','although','though','yet','despite','whereas',
  'unfortunately','sadly','regrettably','frustratingly','annoyingly',
  'nevertheless','nonetheless','except','still','disappointingly',
])

// ── Weighted positive words (2 = strong, 1 = normal) ──
const POSITIVE_WEIGHTS = {
  // Strong positive (2)
  excellent:2, outstanding:2, exceptional:2, fantastic:2, amazing:2, superb:2,
  brilliant:2, perfect:2, wonderful:2, incredible:2, phenomenal:2, magnificent:2,
  extraordinary:2, immaculate:2, spotless:2, impeccable:2, flawless:2, faultless:2,
  delightful:2, spectacular:2,
  // Normal positive (1)
  good:1, great:1, nice:1, happy:1, pleased:1, satisfied:1, love:1, loved:1,
  helpful:1, friendly:1, efficient:1, easy:1, smooth:1, clean:1, comfortable:1,
  fast:1, quick:1, convenient:1, pleasant:1, professional:1, polite:1, welcoming:1,
  clear:1, safe:1, lovely:1, beautiful:1, awesome:1, refreshing:1,
  spacious:1, organised:1, organized:1, modern:1, bright:1, tasty:1, fresh:1,
  generous:1, impressed:1, enjoyed:1, enjoy:1, recommend:1, prompt:1,
  attentive:1, courteous:1, improved:1, improving:1, best:1, seamless:1,
  warm:1, relaxing:1, reasonable:1, affordable:1, value:1, worth:1, tidy:1, neat:1,
  responsive:1, reliable:1, punctual:1, enjoyable:1, impressive:1, positive:1,
  // Airport / CX specific
  swift:1, painless:1, accessible:1, intuitive:1, streamlined:1, informative:1,
  accommodating:1, proactive:1, cheerful:1, gleaming:1, sparkling:1,
  adequate:1, acceptable:1, sufficient:1, straightforward:1, delicious:1,
  surprised:1, welldressed:1, spotless:2, immaculate:2,
}

// ── Weighted negative words (2 = strong, 1 = normal) ──
const NEGATIVE_WEIGHTS = {
  // Strong negative (2)
  terrible:2, horrible:2, awful:2, dreadful:2, disgusting:2, appalling:2,
  atrocious:2, deplorable:2, abysmal:2, pathetic:2, outrageous:2, unacceptable:2,
  shocking:2, disgraceful:2, horrendous:2, diabolical:2, shambles:2, filthy:2,
  disgusted:2, scandalous:2, catastrophic:2, nightmare:2,
  // Normal negative (1)
  bad:1, poor:1, disappointing:1, disappointed:1, unpleasant:1, rude:1,
  dirty:1, broken:1, frustrated:1, frustrating:1, annoying:1, irritating:1,
  unhelpful:1, difficult:1, confusing:1, confused:1, uncomfortable:1, unfriendly:1,
  fail:1, failed:1, failing:1, wrong:1, missing:1, messy:1, chaotic:1, stressful:1,
  overpriced:1, unfair:1, late:1, cancelled:1, ignored:1,
  insufficient:1, inadequate:1, unprofessional:1, unclean:1, overcrowded:1,
  cramped:1, noisy:1, expensive:1, useless:1, waste:1, wasted:1, worst:1,
  slow:1, delayed:1, smelly:1, faulty:1, ripped:1, scam:1, avoid:1,
  long:1, wait:1, queue:1, delay:1, crowded:1, cold:1, limited:1,
  // Airport / CX specific
  understaffed:1, dismissive:1, misleading:1, inaccurate:1, tatty:1, scruffy:1,
  dated:1, worn:1, tired:1, grubby:1, intimidating:1, inconvenient:1,
  freezing:1, sweltering:1, chaotic:1, understaffed:1, disorganised:1, disorganized:1,
  unwelcoming:1, neglected:1, disgrace:2, embarrassing:1, unacceptable:2,
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
  // Airport-specific negatives
  'missed my flight','missed the flight','missed our flight',
  'no staff','no one available','no one helped','no assistance',
  'hard to find','couldnt find','could not find','difficult to find',
  'no signage','poor signage','no directions','confusing layout',
  'no information','lack of information','not informed',
  'completely wrong','totally wrong','waste of money','will not return',
  'wont be back','never again','absolutely terrible','absolutely awful',
  'can not recommend','cannot recommend','would not recommend',
  'not disabled','not accessible','not wheelchair',
  'check in issue','check in problem','checking in problem',
  'too hot','too cold','boiling hot','freezing cold',
]

const POSITIVE_PHRASES = [
  'very good','very clean','very friendly','very helpful','very efficient',
  'well done','great job','highly recommend','really impressed','very pleased',
  'really happy','well organised','well organized','great experience','loved it',
  'really enjoyed','no wait','no queue','no delay','no problem','no issues',
  'ran smoothly','went smoothly','exceeded expectations','above and beyond',
  'value for money','good value',
  // Airport-specific positives
  'stress free','no hassle','easy to navigate','easy to find','clearly signed',
  'really easy','quick and easy','fast and efficient','friendly staff',
  'helpful staff','great staff','lovely staff','really helpful',
  'pleasantly surprised','couldnt fault','nothing to fault','no complaints',
  'would definitely recommend','will definitely return','best airport',
  'very impressed','really impressed','absolutely loved','totally painless',
]

/**
 * Score sentiment of a single text string.
 * Uses: negation windows, intensifiers, weighted word lists, multi-word phrases.
 * @param {string} text
 * @returns {{ score: number, label: 'positive'|'negative'|'neutral', pos: number, neg: number }}
 */
export function scoreSentiment(text) {
  const raw      = String(text || '').toLowerCase()
  const original = String(text || '')
  const tokens   = raw.split(/[^a-z']+/).filter(w => w.length >= 1)

  // ── Pre-scan: detect ALL-CAPS words (TERRIBLE → 1.4x amplification) ──
  const capsWords = new Set()
  original.split(/\s+/).forEach(w => {
    const clean = w.replace(/[^a-zA-Z]/g, '')
    if (clean.length >= 3 && clean === clean.toUpperCase()) capsWords.add(clean.toLowerCase())
  })

  // ── Phase 1: phrase-level scoring ──
  let phraseScore = 0
  for (const phrase of NEGATIVE_PHRASES) {
    if (raw.includes(phrase)) phraseScore -= 1.5
  }
  for (const phrase of POSITIVE_PHRASES) {
    if (raw.includes(phrase)) phraseScore += 1.5
  }

  // ── Phase 2: token-level scoring with negation + intensifiers + contrast ──
  let pos = 0, neg = 0
  let negWindow      = 0   // negation applies to next sentiment word within window
  let amplify        = 1.0 // intensifier multiplier
  let contrastWindow = 0   // contrast word boosts following clause by 1.5x

  for (const t of tokens) {
    const tok            = t.replace(/'/g, '')
    const capsMultiplier = capsWords.has(tok) ? 1.4 : 1.0

    if (NEGATION_WORDS.has(tok)) {
      negWindow = 4
      amplify   = 1.0
      continue
    }

    if (CONTRAST_WORDS.has(tok)) {
      contrastWindow = 8
      // Sentiment-charged contrast words (unfortunately, sadly…) add a mild push
      if (['unfortunately','sadly','regrettably','frustratingly','annoyingly','disappointingly'].includes(tok)) {
        neg += 0.3
      }
      continue
    }

    if (INTENSIFIERS.has(tok)) {
      amplify = 1.5
      continue
    }

    const contrastBoost = contrastWindow > 0 ? 1.5 : 1.0
    if (contrastWindow > 0) contrastWindow--

    const posW = POSITIVE_WEIGHTS[tok]
    const negW = NEGATIVE_WEIGHTS[tok]

    if (posW && posW > 0) {
      const val = posW * amplify * contrastBoost * capsMultiplier
      if (negWindow > 0) { neg += val }       // "not good" → negative
      else               { pos += val }
      negWindow = 0; amplify = 1.0
    } else if (negW && negW > 0) {
      const val = negW * amplify * contrastBoost * capsMultiplier
      if (negWindow > 0) { pos += val * 0.4 } // "not bad" → weakly positive
      else               { neg += val }
      negWindow = 0; amplify = 1.0
    } else {
      if (negWindow > 0) negWindow--
    }
  }

  // ── Phase 3: exclamation mark boost (amplifies the dominant direction) ──
  const exclamCount = (original.match(/!/g) || []).length
  if (exclamCount > 0) {
    const boost = Math.min(exclamCount * 0.2, 0.6)
    if      (pos > neg) pos += boost
    else if (neg > pos) neg += boost
  }

  // ── Combine and normalise ──
  const rawScore  = (pos - neg) + phraseScore
  const normDenom = Math.max(Math.sqrt(tokens.length), 2)
  const score     = rawScore / normDenom

  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral'
  return { score, label, pos: Math.round(pos * 10) / 10, neg: Math.round(neg * 10) / 10 }
}

// ─────────────────────────────────────────────────────────────────
// BM25 SEARCH ENGINE
// ─────────────────────────────────────────────────────────────────

const BM25_K1          = 1.5
const BM25_B           = 0.75
const PROXIMITY_WINDOW = 15   // tokens — co-occurrence within this range gets a score boost
const MIN_NORM_SCORE   = 0.06 // drop results in the weakest 6% tail

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

/**
 * Score a single document against query terms.
 * Returns { score, matchedTermCount } so the caller can apply coverage filtering.
 * Includes a proximity bonus: if two different matched query terms appear within
 * PROXIMITY_WINDOW tokens of each other the score is boosted by 30%.
 */
function bm25DocScore(docTokens, queryTerms, N, avgdl, df) {
  const dl = docTokens.length

  // Build TF map + position lists (surface form and stem)
  const tfMap  = {}
  const posMap = {}  // term → [positions]
  for (let i = 0; i < docTokens.length; i++) {
    const t = docTokens[i]
    tfMap[t] = (tfMap[t] || 0) + 1
    ;(posMap[t] = posMap[t] || []).push(i)
    const s = stemWord(t)
    if (s !== t) {
      tfMap[s] = (tfMap[s] || 0) + 0.8
      ;(posMap[s] = posMap[s] || []).push(i)
    }
  }

  let score = 0
  const matchedQTerms = []  // normalised forms of matched query terms

  for (const term of queryTerms) {
    const t     = term.toLowerCase()
    const stemT = stemWord(t)
    const tf    = (tfMap[t] || 0) + (tfMap[stemT] || 0) * 0.5
    if (tf === 0) continue
    matchedQTerms.push(t)
    const docFreq = df[t] || df[stemT] || 0
    const idf     = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1)
    const tfNorm  = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl))
    score += idf * tfNorm
  }

  // Proximity bonus — find all positions where matched query terms appear,
  // then check if any two *different* terms sit within PROXIMITY_WINDOW tokens
  if (matchedQTerms.length >= 2 && score > 0) {
    const hits = []
    for (let qi = 0; qi < matchedQTerms.length; qi++) {
      const qt   = matchedQTerms[qi]
      const stem = stemWord(qt)
      const positions = [...(posMap[qt] || []), ...(posMap[stem] || [])]
      for (const pos of positions) hits.push({ pos, qi })
    }
    // Sort by position for efficient window scan
    hits.sort((a, b) => a.pos - b.pos)
    let proximity = false
    outer: for (let a = 0; a < hits.length; a++) {
      for (let b = a + 1; b < hits.length; b++) {
        if (hits[b].pos - hits[a].pos > PROXIMITY_WINDOW) break
        if (hits[b].qi !== hits[a].qi) { proximity = true; break outer }
      }
    }
    if (proximity) score *= 1.3
  }

  return { score, matchedTermCount: matchedQTerms.length }
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

  // Minimum distinct query terms that must match — prevents single-word false positives
  // for longer queries. E.g. 20-term expansion requires at least 2 to match.
  const minCoverage = qTerms.length >= 5 ? 2 : 1

  const raw = texts
    .map((text, idx) => {
      const { score, matchedTermCount } = bm25DocScore(tokenizedDocs[idx], qTerms, N, avgdl, df)
      return { text, idx, score, matchedTermCount }
    })
    .filter(r => r.score > 0 && r.matchedTermCount >= minCoverage)
    .sort((a, b) => b.score - a.score)

  if (!raw.length) return []
  const maxScore = raw[0].score

  return raw
    .map(r => ({ text: r.text, idx: r.idx, score: r.score, normScore: r.score / maxScore }))
    .filter(r => r.normScore >= MIN_NORM_SCORE)
}

// ─────────────────────────────────────────────────────────────────

// ── Sentiment intent signals ──────────────────────────────────────────────────
const NEG_INTENT_RE = /\b(negative|bad|complaint|complaints|complain|complaining|problem|problems|issue|issues|poor|worst|terrible|awful|horrible|disgusting|appalling|dissatisfied|unhappy|frustrated|frustration|criticism|criticisms|concern|concerns|dislike|disliked|wrong|fail|failed|failure|disappointment|disappointed|disappointing|unhelpful|rude|dirty|broken|gripe|gripes)\b/i
const POS_INTENT_RE = /\b(positive|good|great|praise|praises|praising|compliment|compliments|happy|satisfied|satisfaction|pleased|love|loved|like|liked|best|excellent|amazing|brilliant|fantastic|wonderful|recommend|recommended|enjoyed|enjoy|cheerful|helpful|friendly)\b/i

// Words to strip when extracting the core topic from a sentiment-qualified query
const STRIP_FROM_TOPIC = /\b(negative|positive|bad|good|great|complaint|complaints|complain|complaining|problem|problems|issue|issues|poor|worst|terrible|awful|horrible|appalling|dissatisfied|unhappy|frustrated|frustration|criticism|criticisms|concern|concerns|dislike|disliked|wrong|fail|failed|failure|disappointment|disappointed|disappointing|praise|praises|praising|compliment|compliments|happy|satisfied|satisfaction|pleased|love|loved|like|liked|best|excellent|amazing|brilliant|fantastic|wonderful|recommend|recommended|enjoyed|enjoy|comments?|feedback|about|regarding|on|for|from|with|customers?|passengers?|people)\b/gi

/**
 * Parse a natural-language search query to extract a sentiment intent and clean topic.
 * e.g. "negative comments about check in" → { sentimentIntent: 'negative', topic: 'check in' }
 * e.g. "positive feedback on food quality"  → { sentimentIntent: 'positive', topic: 'food quality' }
 * e.g. "kids softplay area"                 → { sentimentIntent: null,       topic: 'kids softplay area' }
 *
 * @param {string} query
 * @returns {{ sentimentIntent: 'positive'|'negative'|null, topic: string }}
 */
export function parseQueryIntent(query) {
  const q = query.trim()
  let sentimentIntent = null
  if (NEG_INTENT_RE.test(q)) sentimentIntent = 'negative'
  else if (POS_INTENT_RE.test(q)) sentimentIntent = 'positive'

  const topic = q
    .replace(STRIP_FROM_TOPIC, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { sentimentIntent, topic: topic.length >= 2 ? topic : q }
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
