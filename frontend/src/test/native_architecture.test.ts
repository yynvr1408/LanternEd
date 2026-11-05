import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { platformAdapter } from '../services/platformAdapter'
import { localAiService } from '../services/localAiService'
import { lanClassroomService } from '../services/lanClassroomService'
import { api } from '../services/apiClient'

describe('Native App Architecture & Cross-Platform Services', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    // Clean up window globals
    delete (window as any).__TAURI__
    delete (window as any).Capacitor
  })

  describe('platformAdapter - Runtime & Cross-Platform OS Detection', () => {
    it('detects standard web environment in browser/jsdom', () => {
      expect(platformAdapter.getPlatform()).toBe('web')
      expect(platformAdapter.isNative()).toBe(false)
    })

    it('detects Tauri desktop environment when __TAURI__ is present', () => {
      ;(window as any).__TAURI__ = { invoke: vi.fn() }
      expect(platformAdapter.getPlatform()).toBe('tauri')
      expect(platformAdapter.isNative()).toBe(true)
      expect(platformAdapter.isDesktop()).toBe(true)
    })

    it('detects Capacitor mobile environment when Capacitor.isNativePlatform is true', () => {
      ;(window as any).Capacitor = { isNativePlatform: () => true }
      expect(platformAdapter.getPlatform()).toBe('capacitor')
      expect(platformAdapter.isNative()).toBe(true)
      expect(platformAdapter.isMobile()).toBe(true)
    })

    it('detects Android operating system via Capacitor platform or userAgent', () => {
      ;(window as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      }
      expect(platformAdapter.getOperatingSystem()).toBe('android')
      expect(platformAdapter.isAndroid()).toBe(true)
      expect(platformAdapter.isIOS()).toBe(false)
      expect(platformAdapter.isMobile()).toBe(true)
    })

    it('detects iOS operating system via Capacitor platform or iPhone userAgent', () => {
      ;(window as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
      }
      expect(platformAdapter.getOperatingSystem()).toBe('ios')
      expect(platformAdapter.isIOS()).toBe(true)
      expect(platformAdapter.isAndroid()).toBe(false)
      expect(platformAdapter.isMobile()).toBe(true)
    })

    it('detects Windows operating system from userAgent', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
      expect(platformAdapter.getOperatingSystem()).toBe('windows')
      expect(platformAdapter.isWindows()).toBe(true)
      expect(platformAdapter.isMac()).toBe(false)
    })

    it('detects macOS operating system from userAgent', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      expect(platformAdapter.getOperatingSystem()).toBe('macos')
      expect(platformAdapter.isMac()).toBe(true)
      expect(platformAdapter.isWindows()).toBe(false)
    })

    it('retrieves device hardware capabilities including cross-platform OS flags', async () => {
      const caps = await platformAdapter.getDeviceCapabilities()
      expect(caps).toHaveProperty('platform')
      expect(caps).toHaveProperty('os')
      expect(caps).toHaveProperty('isNative')
      expect(caps).toHaveProperty('isWindows')
      expect(caps).toHaveProperty('isMac')
      expect(caps).toHaveProperty('isAndroid')
      expect(caps).toHaveProperty('isIOS')
      expect(caps).toHaveProperty('hasLocalHardwareAcceleration')
      expect(caps).toHaveProperty('hasLocalWhisperEngine')
    })

    it('requests media permissions gracefully across native platforms', async () => {
      // Mock getUserMedia
      const mockStop = vi.fn()
      const mockStream = { getTracks: () => [{ stop: mockStop }] }
      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream)

      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
      })

      const perms = await platformAdapter.requestMediaPermissions()
      expect(perms).toEqual({ camera: true, microphone: true })
      expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: true })
      expect(mockStop).toHaveBeenCalled()
    })

    it('executes local on-device transcription with progress reporting', async () => {
      const dummyAudio = new Blob(['audio-sample-data-stream-bytes'], { type: 'audio/wav' })
      const progressSteps: string[] = []

      const result = await platformAdapter.transcribeAudioLocally(
        dummyAudio,
        'rec-123',
        (_percent, status) => {
          progressSteps.push(status)
        }
      )

      expect(result.isLocallyProcessed).toBe(true)
      expect(result.transcript).toBeTruthy()
      expect(result.durationSeconds).toBeGreaterThan(0)
      expect(result.energySavedJoulesEstimate).toBeGreaterThan(0)
      expect(result.serverCostSavedUsd).toBeGreaterThan(0)
      expect(progressSteps.length).toBeGreaterThan(0)
    })

    it('initializes a Local LAN Classroom session', async () => {
      const session = await platformAdapter.startLanClassroom({
        classId: 'class-99',
        title: 'Microgrid Design',
        teacherName: 'Dr. Rao',
      })

      expect(session.classId).toBe('class-99')
      expect(session.title).toBe('Microgrid Design')
      expect(session.isRunning).toBe(true)
      expect(session.wsUrl).toContain('ws://')
      expect(session.accessCode).toMatch(/^LAN-\d{4}$/)
    })
  })

  describe('localAiService', () => {
    it('initializes with default zero cumulative savings', () => {
      const savings = localAiService.getCumulativeSavings()
      expect(savings.totalTranscriptions).toBe(0)
      expect(savings.totalJoulesSaved).toBe(0)
      expect(savings.totalCostSavedUsd).toBe(0)
      expect(savings.lastProcessedAt).toBeNull()
    })

    it('records and accumulates savings from local inference', () => {
      const dummyResult = {
        transcript: 'Physics lecture on electromagnetism.',
        durationSeconds: 120,
        language: 'en',
        confidence: 0.95,
        processingTimeMs: 1100,
        energySavedJoulesEstimate: 3840,
        serverCostSavedUsd: 0.012,
        isLocallyProcessed: true,
      }

      localAiService.recordSavings(dummyResult, 1024 * 1024 * 5)
      const savings = localAiService.getCumulativeSavings()

      expect(savings.totalTranscriptions).toBe(1)
      expect(savings.totalAudioMinutes).toBe(2)
      expect(savings.totalJoulesSaved).toBe(3840)
      expect(savings.totalBandwidthSavedBytes).toBe(1024 * 1024 * 5)
      expect(savings.totalCostSavedUsd).toBe(0.012)
      expect(savings.lastProcessedAt).not.toBeNull()
    })

    it('processes lecture locally and links with summary API', async () => {
      vi.spyOn(api, 'createSummaryJob').mockResolvedValueOnce({
        job_id: 'job-abc-123',
        status: 'PENDING',
        class_id: 'class-1',
      } as any)

      const dummyAudio = new Blob(['sample-recorded-speech'], { type: 'audio/wav' })
      const res = await localAiService.processLectureLocally('class-1', 'rec-1', dummyAudio)

      expect(res.result.isLocallyProcessed).toBe(true)
      expect(res.summaryJobId).toBe('job-abc-123')
      expect(api.createSummaryJob).toHaveBeenCalledWith('class-1', res.result.transcript)
    })
  })

  describe('lanClassroomService', () => {
    it('manages classroom LAN session lifecycle and peer message broadcast', async () => {
      expect(lanClassroomService.isLanModeActive()).toBe(false)
      expect(lanClassroomService.getActiveSession()).toBeNull()

      const session = await lanClassroomService.startSession('class-42', 'Thermodynamics', 'Prof. Smith')
      expect(lanClassroomService.isLanModeActive()).toBe(true)
      expect(lanClassroomService.getActiveSession()?.classId).toBe('class-42')
      expect(session.accessCode).toBeTruthy()

      // Test messaging pub/sub
      const receivedMessages: any[] = []
      const unsubscribe = lanClassroomService.onMessage((msg) => {
        receivedMessages.push(msg)
      })

      lanClassroomService.broadcast({
        type: 'whiteboard-sync',
        senderId: 'teacher-1',
        senderName: 'Prof. Smith',
        payload: { path: [[10, 10], [20, 20]], color: '#0F5B57' },
      })

      expect(receivedMessages.length).toBe(1)
      expect(receivedMessages[0].type).toBe('whiteboard-sync')
      expect(receivedMessages[0].payload.color).toBe('#0F5B57')

      unsubscribe()
      lanClassroomService.broadcast({
        type: 'chat-msg',
        senderId: 'teacher-1',
        senderName: 'Prof. Smith',
        payload: { text: 'Hello class' },
      })
      // Should not receive after unsubscribe
      expect(receivedMessages.length).toBe(1)

      // Stop session
      await lanClassroomService.stopSession('class-42')
      expect(lanClassroomService.isLanModeActive()).toBe(false)
      expect(lanClassroomService.getActiveSession()).toBeNull()
    })
  })
})
