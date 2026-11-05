import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { NetworkQuality } from '../types'
import { syncManager } from '../services/syncManager'

export interface NetworkContextType {
  isOnline: boolean
  /** The browser's own online/offline flag only; says nothing about the API or live media. */
  isBrowserOnline: boolean
  isServerReachable: boolean
  quality: NetworkQuality
  latencyMs: number
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
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [isServerReachable, setIsServerReachable] = useState<boolean>(true)
  const [latencyMs, setLatencyMs] = useState<number>(50)
  const wasOfflineRef = useRef<boolean>(false)

  // Initial simulated bandwidth from local storage if saved
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

  const checkReachability = useCallback(async (): Promise<boolean> => {
    // If artificially simulated as offline (0 kbps)
    if (simulatedBandwidthKbps === 0) {
      setIsServerReachable(false)
      wasOfflineRef.current = true
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
        // If we were previously offline, trigger auto-sync!
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false
          syncManager.processQueue().catch(() => {})
        }
        return true
      } else {
        setIsServerReachable(false)
        wasOfflineRef.current = true
        return false
      }
    } catch {
      setIsServerReachable(false)
      wasOfflineRef.current = true
      return false
    }
  }, [simulatedBandwidthKbps])

  const setSimulatedBandwidth = useCallback(async (kbps: number | null): Promise<void> => {
    setSimulatedBandwidthState(kbps)

    if (typeof window !== 'undefined') {
      if (kbps !== null) {
        ;(window as any).__LANTERNED_SIMULATED_KBPS__ = kbps
        localStorage.setItem('lanterned_sim_kbps', String(kbps))
      } else {
        delete (window as any).__LANTERNED_SIMULATED_KBPS__
        localStorage.removeItem('lanterned_sim_kbps')
      }

      if (kbps === 0) {
        wasOfflineRef.current = true
        setIsServerReachable(false)
        window.dispatchEvent(new Event('offline'))
        window.dispatchEvent(
          new CustomEvent('lanterned:network-quality', { detail: { quality: 'offline', kbps: 0 } })
        )
        window.dispatchEvent(
          new CustomEvent('lanterned:toast', {
            detail: { type: 'warning', message: 'Offline Simulator: Network severed (0 kbps). Offline drafts active.' },
          })
        )
      } else if (kbps !== null && kbps <= 30) {
        setIsServerReachable(true)
        window.dispatchEvent(
          new CustomEvent('lanterned:network-quality', { detail: { quality: 'poor', kbps } })
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
            detail: { quality: 'excellent', kbps: kbps ?? 10000 },
          })
        )
        // Auto forward-push pending sync operations when restored
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false
          syncManager.processQueue().catch(() => {})
        }
      }
    }
  }, [])

  const restoreNormalNetwork = useCallback(async () => {
    await setSimulatedBandwidth(null)
    wasOfflineRef.current = false
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
  }, [setSimulatedBandwidth])

  useEffect(() => {
    const handleOnline = () => {
      setIsBrowserOnline(true)
      if (simulatedBandwidthKbps !== 0) {
        checkReachability()
      }
    }

    const handleOffline = () => {
      setIsBrowserOnline(false)
      setIsServerReachable(false)
      wasOfflineRef.current = true
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check if not simulated offline
    if (simulatedBandwidthKbps !== 0) {
      checkReachability()
    }

    // Regular heartbeat interval (every 15 seconds)
    const intervalId = setInterval(() => {
      if (simulatedBandwidthKbps !== 0) {
        checkReachability()
      }
    }, 15000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
    }
  }, [checkReachability, simulatedBandwidthKbps])

  let effectiveOnline = isBrowserOnline && isServerReachable
  if (simulatedBandwidthKbps === 0) {
    effectiveOnline = false
  }

  // Determine network quality tier
  let quality: NetworkQuality = 'offline'
  if (effectiveOnline) {
    if (simulatedBandwidthKbps !== null) {
      if (simulatedBandwidthKbps <= 30) quality = 'poor'
      else if (simulatedBandwidthKbps < 300) quality = 'good'
      else quality = 'excellent'
    } else {
      if (latencyMs < 120) quality = 'excellent'
      else if (latencyMs < 450) quality = 'good'
      else quality = 'poor'
    }
  }

  const effectiveLatency =
    simulatedBandwidthKbps === 0
      ? 0
      : simulatedBandwidthKbps !== null
      ? Math.max(latencyMs, simulatedBandwidthKbps <= 30 ? 850 : simulatedBandwidthKbps <= 200 ? 350 : 50)
      : latencyMs

  return (
    <NetworkContext.Provider
      value={{
        isOnline: effectiveOnline,
        isBrowserOnline,
        isServerReachable,
        quality,
        latencyMs: effectiveLatency,
        checkReachability,
        simulatedBandwidthKbps,
        setSimulatedBandwidth,
        restoreNormalNetwork,
        isSimulated: simulatedBandwidthKbps !== null,
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
