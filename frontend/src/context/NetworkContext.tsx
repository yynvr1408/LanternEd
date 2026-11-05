import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { NetworkQuality } from '../types'
import { syncManager } from '../services/syncManager'

export type NetworkMode = 'auto' | 'manual'
export type NetworkTier = 'high' | 'medium' | 'low' | 'offline'

export interface StreamingPolicy {
  tier: NetworkTier
  resolution: string // '1080p/720p' | '360p' | 'Audio-Only' | 'Offline'
  videoSubscribed: boolean
  audioQuality: 'uncompressed' | 'optimized' | '2g_voice' | 'none'
  syncIntervalMs: number
  statusTag: string
}

export interface NetworkContextType {
  mode: NetworkMode
  setMode: (mode: NetworkMode) => void
  isOnline: boolean
  /** The browser's own online/offline flag only; says nothing about the API or live media. */
  isBrowserOnline: boolean
  isServerReachable: boolean
  quality: NetworkQuality
  latencyMs: number
  downlinkMbps: number | null
  effectiveKbps: number
  statusTag: string
  streamingPolicy: StreamingPolicy
  checkReachability: () => Promise<boolean>
  /** Simulated bandwidth limit in kbps. null = native connection (unlimited), 0 = offline, >0 = throttled */
  simulatedBandwidthKbps: number | null
  setSimulatedBandwidth: (kbps: number | null) => Promise<void>
  /** Restores native bandwidth and immediately forward-pushes all pending offline submissions */
  restoreNormalNetwork: () => Promise<{ successful: number; failed: number; remaining: number }>
  isSimulated: boolean
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

const HEALTH_URL = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')}/health`

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Dual-mode state machine: 'auto' (Production default) vs 'manual' (Judge/Dev harness)
  const [mode, setModeState] = useState<NetworkMode>(() => {
    if (typeof window === 'undefined') return 'auto'
    const savedMode = localStorage.getItem('lanterned_net_mode')
    if (savedMode === 'manual' || savedMode === 'auto') return savedMode
    return 'auto'
  })

  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [isServerReachable, setIsServerReachable] = useState<boolean>(true)
  const [latencyMs, setLatencyMs] = useState<number>(50)
  const [downlinkMbps, setDownlinkMbps] = useState<number | null>(() => {
    if (typeof navigator !== 'undefined') {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
      if (typeof conn?.downlink === 'number') return conn.downlink
    }
    return null
  })

  const wasOfflineFlag = useRef<boolean>(false)

  // Simulated bandwidth state (for manual mode)
  const [simulatedBandwidthKbps, setSimulatedBandwidthState] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('lanterned_sim_kbps')
    if (saved !== null && saved !== '') {
      const parsed = Number(saved)
      if (!isNaN(parsed)) {
        ;(window as any).__LANTERNED_SIMULATED_KBPS__ = parsed
        return parsed
      }
    }
    return null
  })

  // Mode switcher
  const setMode = useCallback((newMode: NetworkMode) => {
    setModeState(newMode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('lanterned_net_mode', newMode)
      if (newMode === 'auto') {
        localStorage.removeItem('lanterned_sim_kbps')
        delete (window as any).__LANTERNED_SIMULATED_KBPS__
        setSimulatedBandwidthState(null)
      }
    }
  }, [])

  // Check reachability
  const checkReachability = useCallback(async (): Promise<boolean> => {
    if (mode === 'manual' && simulatedBandwidthKbps === 0) {
      setIsServerReachable(false)
      wasOfflineFlag.current = true
      return false
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsServerReachable(false)
      return false
    }

    const start = performance.now()
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)

      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const duration = Math.round(performance.now() - start)
      setLatencyMs(duration)

      if (response.ok) {
        setIsServerReachable(true)
        if (wasOfflineFlag.current) {
          wasOfflineFlag.current = false
          syncManager.processQueue().catch(() => {})
        }
        return true
      } else {
        setIsServerReachable(false)
        wasOfflineFlag.current = true
        return false
      }
    } catch {
      setIsServerReachable(false)
      wasOfflineFlag.current = true
      return false
    }
  }, [mode, simulatedBandwidthKbps])

  // Set manual simulated bandwidth
  const setSimulatedBandwidth = useCallback(async (kbps: number | null): Promise<void> => {
    // When a preset or slider is explicitly triggered, switch to manual simulation mode
    setModeState('manual')
    setSimulatedBandwidthState(kbps)

    if (typeof window !== 'undefined') {
      localStorage.setItem('lanterned_net_mode', 'manual')
      if (kbps !== null) {
        ;(window as any).__LANTERNED_SIMULATED_KBPS__ = kbps
        localStorage.setItem('lanterned_sim_kbps', String(kbps))
      } else {
        delete (window as any).__LANTERNED_SIMULATED_KBPS__
        localStorage.removeItem('lanterned_sim_kbps')
      }

      if (kbps === 0) {
        wasOfflineFlag.current = true
        setIsServerReachable(false)
        window.dispatchEvent(new Event('offline'))
        window.dispatchEvent(
          new CustomEvent('lanterned:network-quality', {
            detail: { quality: 'offline', kbps: 0, tier: 'offline', mode: 'manual' },
          })
        )
        window.dispatchEvent(
          new CustomEvent('lanterned:toast', {
            detail: { type: 'warning', message: 'Offline Simulator: Network severed (0 kbps). Offline drafts active.' },
          })
        )
      } else if (kbps !== null && kbps <= 150) {
        setIsServerReachable(true)
        window.dispatchEvent(
          new CustomEvent('lanterned:network-quality', {
            detail: { quality: 'poor', kbps, tier: 'low', mode: 'manual' },
          })
        )
        window.dispatchEvent(
          new CustomEvent('lanterned:toast', {
            detail: { type: 'info', message: `2G Simulator (${kbps} kbps): Low bandwidth audio fallback engaged.` },
          })
        )
      } else {
        setIsServerReachable(true)
        window.dispatchEvent(new Event('online'))
        window.dispatchEvent(
          new CustomEvent('lanterned:network-quality', {
            detail: { quality: 'excellent', kbps: kbps ?? 10000, tier: kbps && kbps < 5000 ? 'medium' : 'high', mode: 'manual' },
          })
        )
        if (wasOfflineFlag.current) {
          wasOfflineFlag.current = false
          syncManager.processQueue().catch(() => {})
        }
      }
    }
  }, [])

  // Restore normal network & forward push queue
  const restoreNormalNetwork = useCallback(async () => {
    setModeState('auto')
    if (typeof window !== 'undefined') {
      localStorage.setItem('lanterned_net_mode', 'auto')
      localStorage.removeItem('lanterned_sim_kbps')
      delete (window as any).__LANTERNED_SIMULATED_KBPS__
    }
    setSimulatedBandwidthState(null)
    wasOfflineFlag.current = false
    setIsServerReachable(true)
    setIsBrowserOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)

    // Forward push all pending operations immediately
    const result = await syncManager.processQueue()
    window.dispatchEvent(
      new CustomEvent('lanterned:toast', {
        detail: {
          type: 'success',
          message: `Restored native network. Forward-pushed sync queue (${result.successful} synced, ${result.remaining} remaining).`,
        },
      })
    )
    return result
  }, [])

  // Auto-adaptive browser telemetry listener
  useEffect(() => {
    if (typeof window === 'undefined') return

    const navConn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

    const updateTelemetry = () => {
      if (navConn && typeof navConn.downlink === 'number') {
        setDownlinkMbps(navConn.downlink)
        if (typeof navConn.rtt === 'number') {
          setLatencyMs(navConn.rtt)
        }
      }
    }

    if (navConn?.addEventListener) {
      navConn.addEventListener('change', updateTelemetry)
    }

    const handleOnline = () => {
      setIsBrowserOnline(true)
      if (mode === 'auto' || simulatedBandwidthKbps !== 0) {
        checkReachability()
      }
    }

    const handleOffline = () => {
      setIsBrowserOnline(false)
      setIsServerReachable(false)
      wasOfflineFlag.current = true
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (mode === 'auto' || simulatedBandwidthKbps !== 0) {
      checkReachability()
    }

    const intervalId = setInterval(() => {
      if (mode === 'auto' || simulatedBandwidthKbps !== 0) {
        checkReachability()
      }
    }, 15000)

    return () => {
      if (navConn?.removeEventListener) {
        navConn.removeEventListener('change', updateTelemetry)
      }
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
    }
  }, [checkReachability, mode, simulatedBandwidthKbps])

  // Derive effective online state
  let effectiveOnline = isBrowserOnline && isServerReachable
  if (mode === 'manual' && simulatedBandwidthKbps === 0) {
    effectiveOnline = false
  }

  // Dual-mode streaming policy derivation
  let streamingPolicy: StreamingPolicy
  let effectiveKbps = 10000
  let quality: NetworkQuality = 'offline'

  if (!effectiveOnline) {
    quality = 'offline'
    effectiveKbps = 0
    streamingPolicy = {
      tier: 'offline',
      resolution: 'Offline',
      videoSubscribed: false,
      audioQuality: 'none',
      syncIntervalMs: 0,
      statusTag: 'Offline Buffered',
    }
  } else if (mode === 'manual') {
    if (simulatedBandwidthKbps === null) {
      quality = 'excellent'
      effectiveKbps = 10000
      streamingPolicy = {
        tier: 'high',
        resolution: '1080p/720p',
        videoSubscribed: true,
        audioQuality: 'uncompressed',
        syncIntervalMs: 5000,
        statusTag: 'Native Speed',
      }
    } else if (simulatedBandwidthKbps <= 150) {
      quality = 'poor'
      effectiveKbps = simulatedBandwidthKbps
      streamingPolicy = {
        tier: 'low',
        resolution: 'Audio-Only',
        videoSubscribed: false,
        audioQuality: '2g_voice',
        syncIntervalMs: 60000,
        statusTag: '2G Audio',
      }
    } else if (simulatedBandwidthKbps < 5000) {
      quality = 'good'
      effectiveKbps = simulatedBandwidthKbps
      streamingPolicy = {
        tier: 'medium',
        resolution: '360p',
        videoSubscribed: true,
        audioQuality: 'optimized',
        syncIntervalMs: 15000,
        statusTag: simulatedBandwidthKbps >= 1000 ? '4G (1.5M)' : '3G (150k)',
      }
    } else {
      quality = 'excellent'
      effectiveKbps = simulatedBandwidthKbps
      streamingPolicy = {
        tier: 'high',
        resolution: '1080p/720p',
        videoSubscribed: true,
        audioQuality: 'uncompressed',
        syncIntervalMs: 5000,
        statusTag: 'Campus Wi-Fi / Fiber',
      }
    }
  } else {
    // Mode is 'auto': Telemetry driven
    if (downlinkMbps !== null) {
      if (downlinkMbps >= 5) {
        quality = 'excellent'
        effectiveKbps = Math.round(downlinkMbps * 1000)
        streamingPolicy = {
          tier: 'high',
          resolution: '1080p/720p',
          videoSubscribed: true,
          audioQuality: 'uncompressed',
          syncIntervalMs: 5000,
          statusTag: downlinkMbps >= 10 ? 'Campus Wi-Fi / Fiber' : `Campus Wi-Fi (${downlinkMbps.toFixed(1)} Mbps)`,
        }
      } else if (downlinkMbps >= 0.15) {
        quality = 'good'
        effectiveKbps = Math.round(downlinkMbps * 1000)
        streamingPolicy = {
          tier: 'medium',
          resolution: '360p',
          videoSubscribed: true,
          audioQuality: 'optimized',
          syncIntervalMs: 15000,
          statusTag: downlinkMbps >= 1.5 ? `4G (${downlinkMbps.toFixed(1)} Mbps)` : `3G (${Math.round(downlinkMbps * 1000)}k)`,
        }
      } else {
        quality = 'poor'
        effectiveKbps = Math.max(10, Math.round(downlinkMbps * 1000))
        streamingPolicy = {
          tier: 'low',
          resolution: 'Audio-Only',
          videoSubscribed: false,
          audioQuality: '2g_voice',
          syncIntervalMs: 60000,
          statusTag: '2G Audio',
        }
      }
    } else {
      // Fallback to ping RTT
      if (latencyMs < 120) {
        quality = 'excellent'
        effectiveKbps = 10000
        streamingPolicy = {
          tier: 'high',
          resolution: '1080p/720p',
          videoSubscribed: true,
          audioQuality: 'uncompressed',
          syncIntervalMs: 5000,
          statusTag: 'Wi-Fi HD',
        }
      } else if (latencyMs < 450) {
        quality = 'good'
        effectiveKbps = 1500
        streamingPolicy = {
          tier: 'medium',
          resolution: '360p',
          videoSubscribed: true,
          audioQuality: 'optimized',
          syncIntervalMs: 15000,
          statusTag: '4G Standard',
        }
      } else {
        quality = 'poor'
        effectiveKbps = 20
        streamingPolicy = {
          tier: 'low',
          resolution: 'Audio-Only',
          videoSubscribed: false,
          audioQuality: '2g_voice',
          syncIntervalMs: 60000,
          statusTag: '2G Audio',
        }
      }
    }
  }

  // Calculate effective latency
  const effectiveLatency =
    !effectiveOnline
      ? 0
      : mode === 'manual' && simulatedBandwidthKbps !== null
      ? simulatedBandwidthKbps >= 10000
        ? 15
        : simulatedBandwidthKbps <= 30
        ? 850
        : simulatedBandwidthKbps <= 200
        ? 350
        : Math.max(latencyMs, 50)
      : latencyMs

  // Broadcast policy update event to WebRTC & live components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('lanterned:adaptive-policy', {
          detail: streamingPolicy,
        })
      )
      window.dispatchEvent(
        new CustomEvent('lanterned:network-quality', {
          detail: { quality, kbps: effectiveKbps, tier: streamingPolicy.tier, mode },
        })
      )
    }
  }, [streamingPolicy, quality, effectiveKbps, mode])

  return (
    <NetworkContext.Provider
      value={{
        mode,
        setMode,
        isOnline: effectiveOnline,
        isBrowserOnline,
        isServerReachable,
        quality,
        latencyMs: effectiveLatency,
        downlinkMbps,
        effectiveKbps,
        statusTag: streamingPolicy.statusTag,
        streamingPolicy,
        checkReachability,
        simulatedBandwidthKbps,
        setSimulatedBandwidth,
        restoreNormalNetwork,
        isSimulated: mode === 'manual' && simulatedBandwidthKbps !== null,
      }}
    >
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetworkStatus(): NetworkContextType {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetworkStatus must be used within a NetworkProvider')
  }
  return context
}
