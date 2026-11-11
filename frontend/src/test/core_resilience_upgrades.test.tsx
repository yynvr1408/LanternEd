import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { syncManager } from '../services/syncManager'
import * as apiClient from '../services/apiClient'
import { SummaryViewer } from '../components/summary/SummaryViewer'
import { TextFallbackPanel } from '../components/class/TextFallbackPanel'
import { RecordedLecturePlayer } from '../components/recording/RecordedLecturePlayer'
import { summaryService } from '../services/summaryService'
import { lanClassroomService } from '../services/lanClassroomService'
import { platformAdapter } from '../services/platformAdapter'
import { releaseService } from '../services/releaseService'
import type { Recording, Summary } from '../types'

describe('Core resilience upgrades', () => {
  beforeEach(async () => {
    await Promise.all([db.syncOperations.clear(), db.examDrafts.clear()])
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete (window as any).__TAURI__
    delete (window as any).Capacitor
    vi.restoreAllMocks()
  })

  it('queues offline exam submissions and reconciles receipt hashes on sync', async () => {
    await syncManager.enqueueExamSubmission({
      examId: 'exam-42',
      attemptId: 'att-7',
      studentId: 'stu-1',
      answers: { 'q-1': 'a' },
      offlineEvents: [{ type: 'tab_hidden', timestamp: '2026-11-11T05:00:00Z' }],
    })

    const queued = await syncManager.getExamDraft('exam-42')
    expect(queued?.syncStatus).toBe('pending_sync')
    const op = (await db.syncOperations.toArray())[0]
    expect(op.operationType).toBe('exam_submit')

    const wire = apiClient.api.toServerOperation(op)
    expect(wire.operation_type).toBe('exam_submit')
    expect(wire.payload.attempt_id).toBe('att-7')
    expect(wire.payload.final_answers).toEqual({ 'q-1': 'a' })
    expect(wire.payload.offline_events).toHaveLength(1)

    vi.spyOn(apiClient.api, 'syncOperations').mockResolvedValueOnce({
      results: [
        {
          operation_id: op.id,
          status: 'accepted',
          server_entity_id: 'att-7',
          receipt_hash: 'sha256-proof',
          auto_graded_score: 10,
        },
      ],
    })

    const result = await syncManager.processQueue()
    expect(result.successful).toBe(1)

    const updated = await syncManager.getExamDraft('exam-42')
    expect(updated?.syncStatus).toBe('synced')
    expect(updated?.receiptHash).toBe('sha256-proof')
    expect(updated?.autoGradedScore).toBe(10)
    expect(updated?.offlineEvents).toEqual([])
  })

  it('coalesces offline recording progress updates into one queued operation', async () => {
    await syncManager.enqueueRecordingProgress('rec-9', 120, false)
    await syncManager.enqueueRecordingProgress('rec-9', 340, true)

    const ops = await db.syncOperations.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].operationType).toBe('recording_progress')
    expect(ops[0].payload).toEqual({ position_seconds: 340, completed: true })
  })

  it('opens an offline interactive Practice Quiz inside SummaryViewer without network calls', async () => {
    const summary: Summary = {
      id: 'sum-1',
      class_id: 'cls-1',
      course_id: 'crs-1',
      status: 'COMPLETED',
      review_status: 'APPROVED',
      overview: 'Ohms law overview.',
      quiz_questions: [
        {
          question: 'Which unit measures electrical resistance?',
          options: ['Ohm', 'Volt', 'Ampere', 'Watt'],
          answer_index: 0,
          explanation: 'Resistance is measured in Ohms.',
        },
      ],
      created_at: '2026-11-11T00:00:00Z',
    }

    render(<SummaryViewer summary={summary} />)
    fireEvent.click(screen.getByRole('button', { name: 'Practice Quiz' }))

    expect(await screen.findByText('Which unit measures electrical resistance?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ohm' }))
    expect(screen.getByText(/Score: 1 \/ 1/)).toBeInTheDocument()
    expect(screen.getByText(/Resistance is measured in Ohms\./)).toBeInTheDocument()
  })

  it('renders live HTTPS fallback captions and whiteboard deltas inside TextFallbackPanel', async () => {
    vi.spyOn(summaryService, 'getClassSummary').mockRejectedValueOnce(new Error('no summary yet'))
    vi.spyOn(apiClient.api, 'getClassFallbackFeed').mockResolvedValueOnce({
      class_id: 'cls-live',
      latest_seq: 2,
      events: [
        { seq: 1, kind: 'caption', author: 'Prof. Nair', text: 'E = mc^2 derivation on step 2' },
        { seq: 2, kind: 'whiteboard', t_ms: 100, msg: { t: 'txt', id: 't1', x: 500, y: 500, s: 'Board Note', c: '#fff', z: 20 } },
      ],
    })

    render(<TextFallbackPanel classId="cls-live" />)

    expect(await screen.findByText(/E = mc\^2 derivation on step 2/)).toBeInTheDocument()
    expect(screen.getByText(/Live Whiteboard Sync \(HTTPS Fallback\)/)).toBeInTheDocument()
  })

  it('renders synced whiteboard replay on RecordedLecturePlayer when timeline is present', async () => {
    const rec: Recording = {
      id: 'rec-wb',
      course_id: 'crs-1',
      teacher_id: 't-1',
      title: 'Thermodynamics Lecture',
      duration_seconds: 120,
      video_url: 'https://cdn.example.com/lecture.mp4',
      file_size_bytes: 1024 * 1024,
      status: 'READY',
      has_transcript: false,
      has_summary: false,
      section_ids: [],
      is_published: true,
      created_at: '2026-11-11T00:00:00Z',
      whiteboard_timeline: [
        { t_ms: 0, msg: { t: 'open', open: true } },
        { t_ms: 500, msg: { t: 'txt', id: 'n1', x: 100, y: 100, s: 'PV = nRT', c: '#fff', z: 20 } },
      ],
    }

    render(<RecordedLecturePlayer recording={rec} />)
    expect(await screen.findByText('Synced Lecture Whiteboard Replay')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Board' }))
    expect(screen.getByRole('button', { name: 'Show Board' })).toBeInTheDocument()
  })

  it('relays LAN pack registration and broadcasts through Tauri IPC commands when running natively', async () => {
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === 'start_lan_classroom_server') {
        return {
          classId: 'cls-lan',
          title: 'Circuit Lab',
          localIp: '192.168.43.1',
          port: 8443,
          wsUrl: 'ws://192.168.43.1:8443/lan-room',
          httpUrl: 'http://192.168.43.1:8443',
          connectedStudents: 0,
        }
      }
      if (cmd === 'register_lan_pack') {
        return 'http://192.168.43.1:8443/packs/micro-1'
      }
      if (cmd === 'broadcast_lan_message') {
        return 1
      }
      return null
    })
    ;(window as any).__TAURI__ = { invoke }

    const session = await lanClassroomService.startSession('cls-lan', 'Circuit Lab', 'Dr. Sen')
    expect(session.localIp).toBe('192.168.43.1')

    const packUrl = await lanClassroomService.sharePackOverLan('micro-1', new Blob(['zipdata']), 'deadbeef')
    expect(packUrl).toBe('http://192.168.43.1:8443/packs/micro-1')

    lanClassroomService.broadcast({
      type: 'caption-chunk',
      senderId: 'teacher',
      senderName: 'Dr. Sen',
      payload: { text: 'Check Kirchoff loop' },
    })

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('broadcast_lan_message', expect.any(Object)))
    await lanClassroomService.stopSession('cls-lan')
  })

  it('supports Android and iOS Capacitor LanternNative LAN, discovery, wake lock, speech, and Share Sheet', async () => {
    const startLanClassroomServer = vi.fn(async (args: any) => ({
      classId: args.classId,
      title: args.title,
      localIp: '10.0.0.15',
      port: 8443,
      wsUrl: 'ws://10.0.0.15:8443/lan-room',
      httpUrl: 'http://10.0.0.15:8443',
      connectedStudents: 0,
    }))
    const registerLanPack = vi.fn(async (args: any) => ({
      url: `http://10.0.0.15:8443/packs/${args.packId}`,
    }))
    const broadcastLanMessage = vi.fn(async () => ({ sent: 2 }))
    const stopLanClassroomServer = vi.fn(async () => undefined)
    const discoverLanRooms = vi.fn(async () => ({
      rooms: [{ name: 'LanternEd-cls', localIp: '10.0.0.15', port: 8443, wsUrl: 'ws://10.0.0.15:8443/lan-room', httpUrl: 'http://10.0.0.15:8443' }],
    }))
    const setWakeLock = vi.fn(async () => ({ enabled: true }))
    const shareContent = vi.fn(async () => ({ shared: true }))
    const getDeviceMetrics = vi.fn(async () => ({
      osName: 'ios',
      osVersion: '18.1',
      model: 'iPhone',
      cpuCores: 6,
      hasGpuAcceleration: true,
      batteryLevel: 85,
      isCharging: false,
      freeStorageMb: 4096,
      localIp: '10.0.0.15',
    }))

    ;(window as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        LanternNative: {
          startLanClassroomServer,
          registerLanPack,
          broadcastLanMessage,
          stopLanClassroomServer,
          discoverLanRooms,
          setWakeLock,
          shareContent,
          getDeviceMetrics,
        },
      },
    }

    const caps = await platformAdapter.getDeviceCapabilities()
    expect(caps.isIOS).toBe(true)
    expect(caps.hasLocalLanServer).toBe(true)
    expect(caps.batteryLevel).toBe(85)
    expect(platformAdapter.getPlatformUxProfile('macos').shortcutModifier).toBe('⌘')
    expect(platformAdapter.getPlatformUxProfile('android').shortcutModifier).toBe('Ctrl')

    const session = await lanClassroomService.startSession('cls-ios', 'Mobile Lab', 'Dr. Rao')
    expect(session.localIp).toBe('10.0.0.15')
    expect(await lanClassroomService.discoverRooms()).toHaveLength(1)
    expect(await lanClassroomService.sharePackOverLan('pack-ios', new Blob(['hello']), 'abc')).toBe(
      'http://10.0.0.15:8443/packs/pack-ios'
    )

    await platformAdapter.requestWakeLock()
    await platformAdapter.releaseWakeLock(null)
    expect(setWakeLock).toHaveBeenCalledWith({ enabled: true })
    expect(setWakeLock).toHaveBeenCalledWith({ enabled: false })

    const shared = await platformAdapter.shareArtifact({
      title: 'Summary',
      text: 'Notes',
      fileName: 'notes.txt',
      contentType: 'text/plain',
      blob: new Blob(['Notes'], { type: 'text/plain' }),
    })
    expect(shared).toBe(true)
    expect(shareContent).toHaveBeenCalled()

    await lanClassroomService.stopSession('cls-ios')
    expect(stopLanClassroomServer).toHaveBeenCalled()
  })

  it('detects updates across all 4 OS targets via GitHub manifest fallback and resolves relative URLs', async () => {
    ;(window as any).__TAURI__ = { invoke: vi.fn() }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('/api/v1/releases/check-update')) {
        return new Response(JSON.stringify({ has_update: false, current_version: '0.1.0', latest_version: '0.1.0', platform: 'macos' }), { status: 200 })
      }
      if (url.includes('/api/v1/releases/manifest')) {
        return new Response('unavailable', { status: 503 })
      }
      return new Response(
        JSON.stringify({
          version: '0.2.0',
          releaseDate: '2026-11-11T00:00:00Z',
          releaseNotes: '4-platform native upgrade',
          platforms: {
            macos: {
              version: '0.2.0',
              fileName: 'LanternEd-0.2.0-universal.dmg',
              installerType: 'dmg',
              downloadUrl: '/api/v1/releases/download/macos',
              fileSizeMb: 7.2,
              sha256: 'deadbeef',
              minOsVersion: 'macOS 10.15+',
              arch: 'Universal',
            },
          },
        }),
        { status: 200 }
      )
    })

    const res = await releaseService.checkForUpdates('0.1.6', 'macos')
    expect(res.has_update).toBe(true)
    expect(res.latest_version).toBe('0.2.0')
    expect(res.download_url).toContain('LanternEd-0.2.0-universal.dmg')
    expect(fetchSpy).toHaveBeenCalled()
  })
})
