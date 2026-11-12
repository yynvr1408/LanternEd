import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach } from 'vitest'
import { db } from '../db/db'
import { askOfflineLibrary, queryOfflineCorpus } from '../services/offlineAiEngine'
import {
  buildStoredZip,
  exportLocalLibraryToLanternPack,
  importLanternPackBytes,
  sha256Hex,
} from '../services/lanternPackService'
import { platformAdapter } from '../services/platformAdapter'

describe('On-Device Offline AI Engine & LanternPack Sneakernet Bundles', () => {
  beforeEach(async () => {
    await db.oerPacks.clear()
    await db.cachedLessonMetadata.clear()
    await db.cachedSummaries.clear()
    await db.downloadedSummaries.clear()
    await db.downloadedRecordings.clear()
  })

  it('ranks offline documents using BM25 and extracts relevant passages and flashcards', () => {
    const answer = queryOfflineCorpus(
      [
        {
          id: 'doc-1',
          sourceType: 'oer_pack',
          title: 'Circuits & Ohm Law',
          text: 'Ohm Law defines V equals I times R in resistive circuits. Current scales inversely with resistance.',
        },
        {
          id: 'doc-2',
          sourceType: 'lesson',
          title: 'Graph Algorithms',
          text: 'Breadth first search visits vertices using a FIFO queue in O(V+E) time.',
        },
      ],
      'resistive circuits Ohm law'
    )

    expect(answer.engine).toBe('local-bm25-extractive-v1')
    expect(answer.indexedDocCount).toBe(2)
    expect(answer.citations[0].docId).toBe('doc-1')
    expect(answer.synthesizedAnswer.toLowerCase()).toContain('resistive')
    expect(answer.generatedFlashcards.length).toBeGreaterThan(0)
  })

  it('exports local lessons to a SHA-256 verified .lanternpack.zip and re-imports offline into Dexie', async () => {
    await db.cachedLessonMetadata.put({
      id: 'l-101',
      courseId: 'c-1',
      title: 'Thermodynamics Entropy',
      updatedAt: new Date().toISOString(),
      payload: {
        id: 'l-101',
        course_id: 'c-1',
        title: 'Thermodynamics Entropy',
        content: 'Entropy quantifies thermal disorder in isolated thermodynamic systems.',
        order_index: 1,
        offline_ready: true,
        created_at: new Date().toISOString(),
      },
    })

    const exported = await exportLocalLibraryToLanternPack()
    expect(exported.filename).toBe('lanterned-offline-bundle.lanternpack.zip')
    expect(exported.manifest.format).toBe('lanternpack-v1')

    const installed = await importLanternPackBytes(exported.bytes)
    expect(installed.lessons.length).toBe(1)
    expect(installed.lessons[0].title).toBe('Thermodynamics Entropy')

    const aiRes = await askOfflineLibrary('thermal disorder')
    expect(aiRes.citations.length).toBeGreaterThan(0)
    expect(aiRes.synthesizedAnswer.toLowerCase()).toContain('entropy')
  })

  it('rejects tampered .lanternpack.zip files when SHA-256 digest mismatches', async () => {
    const enc = new TextEncoder()
    const payload = enc.encode(JSON.stringify([{ id: 'x', title: 'Bad', content: 'Tampered content' }]))
    const fakeDigest = await sha256Hex(enc.encode('original'))
    const manifest = enc.encode(
      JSON.stringify({
        format: 'lanternpack-v1',
        bundle_id: 'bad-pack',
        title: 'Tampered Pack',
        files: [{ path: 'lessons.json', sha256: fakeDigest, bytes: payload.length }],
      })
    )
    const zipBytes = buildStoredZip({
      'manifest.json': manifest,
      'lessons.json': payload,
    })

    await expect(importLanternPackBytes(zipBytes)).rejects.toThrow(/SHA-256 mismatch/i)
  })

  it('exposes exam lockdown and speech recognition readiness across platforms', async () => {
    const lockdown = await platformAdapter.setExamLockdown(true)
    expect(lockdown.active).toBe(true)
    expect(lockdown.capabilities.length).toBeGreaterThan(0)

    const release = await platformAdapter.setExamLockdown(false)
    expect(release.active).toBe(false)

    const speech = platformAdapter.getSpeechRecognitionStatus()
    expect(speech.engine.length).toBeGreaterThan(0)
  })
})
