/**
 * On-Device Offline AI Retrieval & Q&A Engine ("Ask Your Offline Library").
 *
 * Runs 100% locally in Web / Windows / macOS / Android / iOS over IndexedDB
 * (`LanternEDDB`) using pure TypeScript BM25 ranking, sentence extraction,
 * and automatic practice flashcard generation — requiring zero internet or cloud API keys.
 */

import { db } from '../db/db'

export interface OfflineCorpusDoc {
  id: string
  sourceType: 'lesson' | 'summary' | 'recording' | 'oer_pack'
  title: string
  courseId?: string
  text: string
}

export interface OfflineAiHit {
  docId: string
  sourceType: OfflineCorpusDoc['sourceType']
  title: string
  score: number
  bestPassage: string
  matchedTerms: string[]
}

export interface OfflineAiAnswer {
  query: string
  synthesizedAnswer: string
  citations: OfflineAiHit[]
  generatedFlashcards: Array<{ question: string; answer: string }>
  indexedDocCount: number
  engine: 'local-bm25-extractive-v1'
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
  'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
  'what', 'when', 'where', 'which', 'while', 'with', 'from', 'that', 'this', 'have',
  'explain', 'define', 'tell', 'about', 'does', 'into',
])

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
}

function splitSentences(text: string): string[] {
  return (text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16)
}

export function queryOfflineCorpus(docs: OfflineCorpusDoc[], query: string, topK = 5): OfflineAiAnswer {
  const qTokens = tokenize(query)
  if (docs.length === 0) {
    return {
      query,
      synthesizedAnswer:
        'Your offline library is empty right now. Download a course, lecture summary, or install an OER pack / .lanternpack.zip file to ask questions completely offline.',
      citations: [],
      generatedFlashcards: [],
      indexedDocCount: 0,
      engine: 'local-bm25-extractive-v1',
    }
  }

  const docTokens = docs.map((d) => tokenize(`${d.title} ${d.text}`))
  const avgDl = docTokens.reduce((sum, t) => sum + t.length, 0) / Math.max(docs.length, 1) || 1
  const df = new Map<string, number>()
  for (const toks of docTokens) {
    for (const uniq of new Set(toks)) {
      df.set(uniq, (df.get(uniq) ?? 0) + 1)
    }
  }

  const k1 = 1.5
  const b = 0.75
  const nDocs = docs.length
  const effectiveQ = qTokens.length > 0 ? qTokens : tokenize(docs[0]?.title || '')

  const scored: OfflineAiHit[] = []
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const toks = docTokens[i]
    if (toks.length === 0) continue

    const tf = new Map<string, number>()
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)

    let score = 0
    const matched = new Set<string>()
    for (const qt of effectiveQ) {
      const freq = tf.get(qt) ?? 0
      if (freq > 0) {
        matched.add(qt)
        const docFreq = df.get(qt) ?? 0
        const idf = Math.log(1 + (nDocs - docFreq + 0.5) / (docFreq + 0.5))
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * toks.length) / avgDl)))
      }
    }

    // Substring fallback so partial technical prefixes (e.g. "thermo") still surface hits
    if (score === 0 && query.trim().length >= 3) {
      const lowerText = `${doc.title}\n${doc.text}`.toLowerCase()
      if (lowerText.includes(query.trim().toLowerCase())) {
        score = 0.25
        matched.add(query.trim().toLowerCase())
      }
    }

    if (score > 0) {
      const sentences = splitSentences(doc.text)
      let bestPassage = sentences[0] || doc.text.slice(0, 240)
      let bestSentScore = -1
      for (const s of sentences) {
        const sLower = s.toLowerCase()
        let hitCount = 0
        for (const qt of effectiveQ) {
          if (sLower.includes(qt)) hitCount += 1
        }
        if (hitCount > bestSentScore) {
          bestSentScore = hitCount
          bestPassage = s
        }
      }

      scored.push({
        docId: doc.id,
        sourceType: doc.sourceType,
        title: doc.title,
        score: Number(score.toFixed(3)),
        bestPassage,
        matchedTerms: Array.from(matched),
      })
    }
  }

  scored.sort((a, bHit) => bHit.score - a.score)
  const hits = scored.slice(0, topK)

  const synthesizedAnswer =
    hits.length > 0
      ? hits
          .slice(0, 3)
          .map((h) => `${h.bestPassage}`)
          .join(' ')
      : `No exact local matches for "${query}" across ${docs.length} indexed offline documents. Try broader terms from your downloaded lessons or install an OER pack.`

  const generatedFlashcards = hits.slice(0, 3).map((h) => ({
    question: `Key takeaway from "${h.title}"${h.matchedTerms.length ? ` (${h.matchedTerms.join(', ')})` : ''}?`,
    answer: h.bestPassage,
  }))

  return {
    query,
    synthesizedAnswer,
    citations: hits,
    generatedFlashcards,
    indexedDocCount: docs.length,
    engine: 'local-bm25-extractive-v1',
  }
}

export async function gatherOfflineCorpus(): Promise<OfflineCorpusDoc[]> {
  const docs: OfflineCorpusDoc[] = []

  const [lessons, cachedSums, savedSums, recordings, oerPacks] = await Promise.all([
    db.cachedLessonMetadata.toArray().catch(() => []),
    db.cachedSummaries.toArray().catch(() => []),
    db.downloadedSummaries.toArray().catch(() => []),
    db.downloadedRecordings.toArray().catch(() => []),
    db.oerPacks.toArray().catch(() => []),
  ])

  for (const l of lessons) {
    const content = l.payload?.content || l.title
    if (content) {
      docs.push({
        id: `lesson:${l.id}`,
        sourceType: 'lesson',
        title: l.title,
        courseId: l.courseId,
        text: content,
      })
    }
  }

  for (const s of [...savedSums, ...cachedSums]) {
    const contentObj = s.payload
    if (!contentObj) continue
    const text = [
      contentObj.overview,
      ...(contentObj.key_concepts || []),
      ...(contentObj.definitions || []).map((d) => `${d.term}: ${d.definition}`),
      ...(contentObj.examples || []),
    ]
      .filter(Boolean)
      .join('. ')
    if (text.trim()) {
      const id = 'id' in s ? `savedsum:${s.id}` : `sum:${s.classId}`
      docs.push({
        id,
        sourceType: 'summary',
        title: 'title' in s ? s.title : `Lecture Summary (${s.classId})`,
        courseId: s.courseId,
        text,
      })
    }
  }

  for (const r of recordings) {
    if (r.transcript?.trim()) {
      docs.push({
        id: `rec:${r.id}`,
        sourceType: 'recording',
        title: r.title,
        courseId: r.courseId,
        text: r.transcript,
      })
    }
  }

  for (const p of oerPacks) {
    const text = p.lessons.map((item) => `${item.title}. ${item.content}`).join('\n')
    if (text.trim()) {
      docs.push({
        id: `oer:${p.id}`,
        sourceType: 'oer_pack',
        title: p.title,
        text,
      })
    }
  }

  return docs
}

export async function askOfflineLibrary(query: string): Promise<OfflineAiAnswer> {
  const docs = await gatherOfflineCorpus()
  return queryOfflineCorpus(docs, query)
}
