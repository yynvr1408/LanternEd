/**
 * Local AI & Green Compute Service
 *
 * Coordinates on-device speech recognition (Local Whisper) and local text processing
 * to eliminate expensive cloud GPU inference, save server electrical energy, and
 * drastically reduce institutional network bandwidth consumption.
 */

import { platformAdapter, type LocalTranscriptionResult } from './platformAdapter'
import { api } from './apiClient'

const STATS_KEY = 'lanterned_local_ai_savings'

export interface LocalAiCumulativeSavings {
  totalTranscriptions: number
  totalAudioMinutes: number
  totalJoulesSaved: number
  totalBandwidthSavedBytes: number
  totalCostSavedUsd: number
  lastProcessedAt: string | null
}

const DEFAULT_SAVINGS: LocalAiCumulativeSavings = {
  totalTranscriptions: 0,
  totalAudioMinutes: 0,
  totalJoulesSaved: 0,
  totalBandwidthSavedBytes: 0,
  totalCostSavedUsd: 0,
  lastProcessedAt: null,
}

export const localAiService = {
  /**
   * Transcribes a recorded lecture on the user's local machine and directly links
   * the resulting transcript to the class summary workflow without streaming heavy
   * media to cloud GPU servers.
   */
  async processLectureLocally(
    classId: string,
    recordingId: string,
    audioBlob: Blob,
    onProgress?: (percent: number, status: string) => void
  ): Promise<{
    result: LocalTranscriptionResult
    summaryJobId?: string
  }> {
    // 1. Run on-device local Whisper transcription
    const result = await platformAdapter.transcribeAudioLocally(audioBlob, recordingId, onProgress)

    // 2. Synchronize lightweight transcript text (15KB text instead of 200MB video) with server
    onProgress?.(90, 'Linking on-device transcript to AI summary pipeline...')
    let summaryJobId: string | undefined
    try {
      const job = await api.createSummaryJob(classId, result.transcript)
      summaryJobId = job.job_id
    } catch (err) {
      console.warn('Summary job creation with local transcript deferred:', err)
    }

    // 3. Record local energy and cost savings
    this.recordSavings(result, audioBlob.size)
    onProgress?.(100, 'Lecture successfully processed on-device.')

    return {
      result,
      summaryJobId,
    }
  },

  /** Retrieves cumulative local compute and energy savings metrics. */
  getCumulativeSavings(): LocalAiCumulativeSavings {
    if (typeof localStorage === 'undefined') return DEFAULT_SAVINGS
    try {
      const raw = localStorage.getItem(STATS_KEY)
      if (!raw) return DEFAULT_SAVINGS
      return { ...DEFAULT_SAVINGS, ...JSON.parse(raw) }
    } catch {
      return DEFAULT_SAVINGS
    }
  },

  /** Records metrics after an on-device transcription completes. */
  recordSavings(result: LocalTranscriptionResult, audioSizeBytes: number): void {
    if (typeof localStorage === 'undefined') return
    try {
      const current = this.getCumulativeSavings()
      const updated: LocalAiCumulativeSavings = {
        totalTranscriptions: current.totalTranscriptions + 1,
        totalAudioMinutes: current.totalAudioMinutes + Math.round(result.durationSeconds / 60),
        totalJoulesSaved: current.totalJoulesSaved + result.energySavedJoulesEstimate,
        totalBandwidthSavedBytes: current.totalBandwidthSavedBytes + audioSizeBytes,
        totalCostSavedUsd: Number((current.totalCostSavedUsd + result.serverCostSavedUsd).toFixed(4)),
        lastProcessedAt: new Date().toISOString(),
      }
      localStorage.setItem(STATS_KEY, JSON.stringify(updated))
    } catch {
      // storage quota
    }
  },

  /** Formats watt-hours for display. */
  formatWattHours(joules: number): string {
    const wattHours = joules / 3600
    if (wattHours >= 1000) {
      return `${(wattHours / 1000).toFixed(2)} kWh`
    }
    return `${Math.round(wattHours)} Wh`
  },
}
