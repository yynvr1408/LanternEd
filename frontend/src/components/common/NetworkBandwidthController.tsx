import React, { useState, useEffect, useRef } from 'react'
import {
  Wifi,
  WifiOff,
  Radio,
  Zap,
  Sliders,
  X,
  GripVertical,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  Maximize2,
  Minimize2,
  Compass,
} from 'lucide-react'
import { useNetworkStatus } from '../../context/NetworkContext'
import { db } from '../../db/db'
import { useLiveQuery } from 'dexie-react-hooks'

export const NetworkBandwidthController: React.FC = () => {
  const {
    mode,
    setMode,
    isOnline,
    quality,
    latencyMs,
    effectiveKbps,
    statusTag,
    streamingPolicy,
    simulatedBandwidthKbps,
    setSimulatedBandwidth,
    restoreNormalNetwork,
  } = useNetworkStatus()

  // Expanded panel vs compact floating pill
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(false)

  // Floating coordinates for desktop
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      const savedX = localStorage.getItem('lanterned_net_ctrl_x')
      const savedY = localStorage.getItem('lanterned_net_ctrl_y')
      if (savedX && savedY) {
        return { x: Number(savedX), y: Number(savedY) }
      }
      return {
        x: Math.max(16, window.innerWidth - 380),
        y: Math.max(16, window.innerHeight - 100),
      }
    }
    return { x: 20, y: 500 }
  })

  // Detect mobile viewport and keep clamped within window on resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 640
      setIsMobileScreen(mobile)

      // Clamp desktop position within current viewport
      if (!mobile) {
        setPosition((prev) => {
          const clampedX = Math.max(12, Math.min(window.innerWidth - (isExpanded ? 380 : 180), prev.x))
          const clampedY = Math.max(12, Math.min(window.innerHeight - (isExpanded ? 560 : 70), prev.y))
          return { x: clampedX, y: clampedY }
        })
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isExpanded])

  // Dragging state
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  })

  // Manual input state
  const [customKbpsInput, setCustomKbpsInput] = useState<string>('24')
  const [sliderValue, setSliderValue] = useState<number>(() => simulatedBandwidthKbps ?? 1500)
  const [isPushingQueue, setIsPushingQueue] = useState(false)
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null)

  // Live count of pending drafts & sync operations
  const pendingSyncCount = useLiveQuery(async () => {
    try {
      const ops = await db.syncOperations.where('status').equals('pending').count()
      const drafts = await db.assignmentDrafts.where('syncStatus').equals('pending_sync').count()
      return { ops, drafts }
    } catch {
      return { ops: 0, drafts: 0 }
    }
  }, [])

  // Synchronize slider value with active simulated bandwidth
  useEffect(() => {
    if (simulatedBandwidthKbps !== null) {
      setSliderValue(simulatedBandwidthKbps)
      setCustomKbpsInput(String(simulatedBandwidthKbps))
    }
  }, [simulatedBandwidthKbps])

  // Reset to default corner position
  const handleResetPosition = () => {
    const defaultX = Math.max(16, window.innerWidth - (isExpanded ? 390 : 200))
    const defaultY = Math.max(16, window.innerHeight - (isExpanded ? 600 : 90))
    setPosition({ x: defaultX, y: defaultY })
    localStorage.setItem('lanterned_net_ctrl_x', String(defaultX))
    localStorage.setItem('lanterned_net_ctrl_y', String(defaultY))
  }

  // Dragging logic (Mouse & Touch compatible)
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Only allow drag on desktop, or when touching the explicit grip handle
    if (isMobileScreen && isExpanded) return

    isDraggingRef.current = true
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      posX: position.x,
      posY: position.y,
    }

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return
      const currentX =
        'touches' in moveEvent ? moveEvent.touches[0].clientX : (moveEvent as MouseEvent).clientX
      const currentY =
        'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY

      const deltaX = currentX - dragStartRef.current.startX
      const deltaY = currentY - dragStartRef.current.startY

      const panelWidth = isExpanded ? 380 : 180
      const panelHeight = isExpanded ? 580 : 64

      const newX = Math.max(10, Math.min(window.innerWidth - panelWidth, dragStartRef.current.posX + deltaX))
      const newY = Math.max(10, Math.min(window.innerHeight - panelHeight, dragStartRef.current.posY + deltaY))

      setPosition({ x: newX, y: newY })
    }

    const handleEnd = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      // Save position
      localStorage.setItem('lanterned_net_ctrl_x', String(position.x))
      localStorage.setItem('lanterned_net_ctrl_y', String(position.y))
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove)
    window.addEventListener('touchend', handleEnd)
  }

  // Quick preset selection
  const handleApplyPreset = async (kbps: number | null) => {
    await setSimulatedBandwidth(kbps)
    if (kbps !== null) {
      setSliderValue(kbps)
      setCustomKbpsInput(String(kbps))
    }
  }

  // Slider change handler
  const handleSliderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setSliderValue(val)
    setCustomKbpsInput(String(val))
    await setSimulatedBandwidth(val)
  }

  // Manual input submission
  const handleCustomInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Math.max(0, parseInt(customKbpsInput.trim(), 10))
    if (!isNaN(parsed)) {
      setSliderValue(parsed)
      await setSimulatedBandwidth(parsed)
    }
  }

  // Forward push operations button handler
  const handleRestoreAndForwardPush = async () => {
    try {
      setIsPushingQueue(true)
      const res = await restoreNormalNetwork()
      setPushStatusMessage(
        `Forward-pushed successfully! ${res.successful} synced, ${res.remaining} remaining.`
      )
      setTimeout(() => setPushStatusMessage(null), 4000)
    } finally {
      setIsPushingQueue(false)
    }
  }

  // Visual label for floating pill
  const getPillLabel = () => {
    if (mode === 'auto') {
      if (simulatedBandwidthKbps === null && streamingPolicy.tier === 'high') {
        return '⚡ Native (Unlimited)'
      }
      if (streamingPolicy.tier === 'offline') return '🔴 Offline (0 kbps)'
      if (streamingPolicy.tier === 'low') return '⚠️ 2G Audio'
      return `⚡ Auto: ${statusTag}`
    }
    // Manual mode
    if (simulatedBandwidthKbps === null) return '⚡ Native (Unlimited)'
    if (simulatedBandwidthKbps === 0) return '🔴 Offline (0 kbps)'
    if (simulatedBandwidthKbps < 1000) return `⚠️ ${simulatedBandwidthKbps} kbps`
    return `📶 ${(simulatedBandwidthKbps / 1000).toFixed(1)} Mbps`
  }

  return (
    <>
      {/* Mobile backdrop overlay when expanded */}
      {isExpanded && isMobileScreen && (
        <div
          onClick={() => setIsExpanded(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9998] transition-opacity"
          aria-hidden="true"
        />
      )}

      <div
        style={
          isExpanded && isMobileScreen
            ? {
                position: 'fixed',
                bottom: '12px',
                left: '12px',
                right: '12px',
                maxHeight: 'calc(100dvh - 24px)',
                zIndex: 9999,
              }
            : isExpanded
            ? {
                position: 'fixed',
                left: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerWidth - 396 : 400, position.x))}px`,
                top: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerHeight - 600 : 300, position.y))}px`,
                maxHeight: 'calc(100vh - 24px)',
                zIndex: 9999,
              }
            : {
                position: 'fixed',
                left: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerWidth - 200 : 200, position.x))}px`,
                top: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerHeight - 70 : 100, position.y))}px`,
                zIndex: 9999,
              }
        }
        className="select-none font-sans transition-all duration-150"
      >
        {!isExpanded ? (
          /* ================= COMPACT DRAGGABLE PILL ================= */
          <div className="flex items-center gap-1.5 p-1.5 pl-2.5 bg-[#121A19]/95 backdrop-blur-md text-white rounded-full shadow-2xl border border-[#2DBE8B]/40 hover:border-[#2DBE8B] transition-all cursor-pointer hover:shadow-[#2DBE8B]/20">
            {/* Drag Handle */}
            <div
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              className="p-1 text-[#84908D] hover:text-[#FFFFFF] cursor-grab active:cursor-grabbing touch-none"
              title="Drag to reposition controller"
            >
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Quick status pill */}
            <div
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-2 pr-1.5"
              title="Click to open Bandwidth Controller"
            >
              {!isOnline || (mode === 'manual' && simulatedBandwidthKbps === 0) ? (
                <span className="w-2.5 h-2.5 rounded-full bg-[#E53935] animate-pulse" />
              ) : streamingPolicy.tier === 'low' || (mode === 'manual' && simulatedBandwidthKbps !== null && simulatedBandwidthKbps <= 30) ? (
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-[#2DBE8B]" />
              )}

              <span className="text-xs font-bold tracking-tight text-[#E1E8E4]">
                {getPillLabel()}
              </span>

              {pendingSyncCount && (pendingSyncCount.drafts > 0 || pendingSyncCount.ops > 0) ? (
                <span className="bg-[#E53935] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {pendingSyncCount.drafts + pendingSyncCount.ops}
                </span>
              ) : null}

              <Sliders className="w-3.5 h-3.5 text-[#2DBE8B] ml-0.5" />
            </div>
          </div>
        ) : (
          /* ================= RESPONSIVE & SCROLLABLE CONTROLLER PANEL ================= */
          <div className="w-full sm:w-[380px] max-h-[85vh] sm:max-h-[calc(100vh-32px)] bg-[#121A19] text-[#FFFFFF] rounded-2xl shadow-2xl border border-[#202B2A] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header & Drag Bar (Sticky Top) */}
            <div
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              className="bg-[#1A2524] px-3.5 py-2.5 flex items-center justify-between border-b border-[#202B2A] cursor-grab active:cursor-grabbing touch-none shrink-0"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-[#84908D]" />
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#2DBE8B]" />
                  <span className="text-xs font-bold text-[#FFFFFF] tracking-wide">
                    Bandwidth Simulation Tool
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Reset position button */}
                <button
                  type="button"
                  onClick={handleResetPosition}
                  className="text-[#84908D] hover:text-[#2DBE8B] p-1 rounded-md transition-colors cursor-pointer"
                  title="Snap to corner"
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>

                {/* Close / minimize */}
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="text-[#84908D] hover:text-[#FFFFFF] p-1 rounded-md transition-colors cursor-pointer"
                  title="Minimize to floating pill"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Controller Body */}
            <div
              className="p-3.5 space-y-3 text-xs overflow-y-auto overscroll-contain flex-1 min-h-0"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#2DBE8B #121A19',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* 1. DUAL-MODE SWITCHER SEGMENTED CONTROL */}
              <div className="bg-[#15201F] p-1 rounded-xl border border-[#2A3937] flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMode('auto')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'auto'
                      ? 'bg-[#0F5B57] text-[#FFFFFF] shadow-sm'
                      : 'text-[#84908D] hover:text-[#FFFFFF] hover:bg-[#1A2524]'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-[#2DBE8B]" />
                  ⚡ Auto-Adaptive (Production)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'manual'
                      ? 'bg-[#0F5B57] text-[#FFFFFF] shadow-sm'
                      : 'text-[#84908D] hover:text-[#FFFFFF] hover:bg-[#1A2524]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-[#38BDF8]" />
                  🛠️ Manual Simulator (Jury Mode)
                </button>
              </div>

              {/* 2. REAL-TIME STATUS HEADER HUD */}
              <div className="bg-[#1A2524] p-3 rounded-xl border border-[#2A3937] flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-[10px] text-[#84908D] uppercase font-semibold">
                    <span>{mode === 'auto' ? '⚡ Auto-Adaptive' : '🛠️ Manual Simulator'}</span>
                    <span>•</span>
                    <span>Speed</span>
                  </div>
                  <span className="text-sm font-bold text-[#FFFFFF] flex items-center gap-1.5 mt-0.5">
                    <ArrowDown className="w-3.5 h-3.5 text-[#2DBE8B]" />
                    {mode === 'manual' && simulatedBandwidthKbps === null
                      ? 'Native Speed'
                      : effectiveKbps === 0
                      ? '0 kbps'
                      : effectiveKbps >= 1000
                      ? `${(effectiveKbps / 1000).toFixed(1)} Mbps`
                      : `${effectiveKbps} kbps`}
                    <span className="text-[#84908D] font-normal text-xs">/</span>
                    <ArrowUp className="w-3.5 h-3.5 text-[#38BDF8]" />
                    {mode === 'manual' && simulatedBandwidthKbps === null
                      ? 'Native'
                      : effectiveKbps === 0
                      ? '0 kbps'
                      : effectiveKbps >= 1000
                      ? `${(effectiveKbps / 2000).toFixed(1)} Mbps`
                      : `${Math.round(effectiveKbps * 0.5)} kbps`}
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-[#84908D] uppercase font-semibold">Latency / State</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-xs font-bold">
                      {!isOnline || (mode === 'manual' && simulatedBandwidthKbps === 0) ? (
                        <span className="text-[#E53935] font-semibold flex items-center gap-1">
                          <WifiOff className="w-3 h-3" /> Offline
                        </span>
                      ) : quality === 'poor' || streamingPolicy.tier === 'low' ? (
                        <span className="text-[#F59E0B] font-semibold flex items-center gap-1">
                          <Radio className="w-3 h-3 animate-pulse" /> {latencyMs}ms
                        </span>
                      ) : (
                        <span className="text-[#2DBE8B] font-semibold flex items-center gap-1">
                          <Wifi className="w-3 h-3" /> {latencyMs}ms
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        streamingPolicy.tier === 'offline'
                          ? 'bg-[#E53935]/20 text-[#EF4444] border border-[#EF4444]/40'
                          : streamingPolicy.tier === 'low'
                          ? 'bg-[#D97706]/20 text-[#F59E0B] border border-[#F59E0B]/40'
                          : streamingPolicy.tier === 'medium'
                          ? 'bg-[#0284C7]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                          : 'bg-[#059669]/20 text-[#2DBE8B] border border-[#2DBE8B]/40'
                      }`}
                    >
                      {statusTag}
                    </span>
                  </div>
                </div>
              </div>

              {/* Auto Mode Telemetry Badge Notice */}
              {mode === 'auto' && (
                <div className="p-2.5 rounded-lg text-[11px] bg-[#15201F] border border-[#2A3937] text-[#A3B3AF] flex items-center justify-between">
                  <span>
                    <strong>Auto-Detected Policy:</strong> Telemetry dynamically adjusts WebRTC audio/video bitrate and sync priority.
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A2524] text-[#2DBE8B] border border-[#2DBE8B]/30 shrink-0 ml-2">
                    Auto: {statusTag}
                  </span>
                </div>
              )}

              {/* 3. DYNAMIC LIVEKIT & STORAGE FALLBACK NOTICES */}
              <div className="p-2.5 rounded-lg text-[11px] border bg-[#15201F] border-[#2A3937] text-[#CBD7D1]">
                {!isOnline || (mode === 'manual' && simulatedBandwidthKbps === 0) ? (
                  <div className="flex items-center gap-2 text-[#EF4444]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Offline Fallback:</strong> Writing drafts saves to IndexedDB; API calls fail cleanly with sync queue pending.
                    </span>
                  </div>
                ) : streamingPolicy.tier === 'low' || (mode === 'manual' && simulatedBandwidthKbps !== null && simulatedBandwidthKbps <= 30) ? (
                  <div className="flex items-center gap-2 text-[#F59E0B]">
                    <Radio className="w-4 h-4 shrink-0 animate-pulse" />
                    <span>
                      <strong>LiveKit Fallback:</strong> Low-bandwidth voice stream active. Video unsubscribed at transport layer.
                    </span>
                  </div>
                ) : streamingPolicy.tier === 'medium' ? (
                  <div className="flex items-center gap-2 text-[#38BDF8]">
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Adaptive Stream:</strong> 360p video &amp; optimized voice active ({streamingPolicy.resolution}).
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[#2DBE8B]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Optimal Network:</strong> Full video simulcast and instant cloud synchronization enabled.
                    </span>
                  </div>
                )}
              </div>

              {/* 4. BANDWIDTH PRESETS MATRIX (6 PRESETS) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-[#84908D] uppercase tracking-wider">
                    Bandwidth Presets
                  </span>
                  {mode === 'auto' && (
                    <span className="text-[10px] text-[#A3B3AF]">
                      (Selecting preset switches to Manual)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {/* 1. Campus Wi-Fi / Fiber (10M) */}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(10000)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'manual' && simulatedBandwidthKbps === 10000
                        ? 'bg-[#0F5B57] text-white border-[#2DBE8B] shadow-sm'
                        : mode === 'auto'
                        ? 'bg-[#15201F] text-[#84908D] border-[#2A3937] hover:text-[#FFFFFF]'
                        : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#2DBE8B]'
                    }`}
                  >
                    <Wifi className="w-3 h-3 text-[#2DBE8B]" />
                    Campus Wi-Fi
                  </button>

                  {/* 2. Native / Full Speed */}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(null)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'manual' && simulatedBandwidthKbps === null
                        ? 'bg-[#0F5B57] text-white border-[#2DBE8B] shadow-sm'
                        : mode === 'auto'
                        ? 'bg-[#15201F] text-[#84908D] border-[#2A3937] hover:text-[#FFFFFF]'
                        : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#2DBE8B]'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3 text-[#2DBE8B]" />
                    Native / Full Speed
                  </button>

                  {/* 3. 4G (1.5M) */}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(1500)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'manual' && simulatedBandwidthKbps === 1500
                        ? 'bg-[#059669] text-white border-[#059669] shadow-sm'
                        : mode === 'auto'
                        ? 'bg-[#15201F] text-[#84908D] border-[#2A3937] hover:text-[#FFFFFF]'
                        : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#059669]'
                    }`}
                  >
                    <Zap className="w-3 h-3 text-[#2DBE8B]" />
                    4G (1.5M)
                  </button>

                  {/* 4. 3G (150k) */}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(150)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'manual' && simulatedBandwidthKbps === 150
                        ? 'bg-[#0284C7] text-white border-[#0284C7] shadow-sm'
                        : mode === 'auto'
                        ? 'bg-[#15201F] text-[#84908D] border-[#2A3937] hover:text-[#FFFFFF]'
                        : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#0284C7]'
                    }`}
                  >
                    <Wifi className="w-3 h-3 text-[#38BDF8]" />
                    3G (150k)
                  </button>

                  {/* 5. 2G (20k) */}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(20)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'manual' && simulatedBandwidthKbps === 20
                        ? 'bg-[#D97706] text-white border-[#D97706] shadow-sm'
                        : mode === 'auto'
                        ? 'bg-[#15201F] text-[#84908D] border-[#2A3937] hover:text-[#FFFFFF]'
                        : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#D97706]'
                    }`}
                  >
                    <Radio className="w-3 h-3 text-[#F59E0B]" />
                    2G (20k)
                  </button>

                  {/* 6. Offline */}
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(0)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'manual' && simulatedBandwidthKbps === 0
                        ? 'bg-[#E53935] text-white border-[#E53935] shadow-sm'
                        : mode === 'auto'
                        ? 'bg-[#15201F] text-[#84908D] border-[#2A3937] hover:text-[#FFFFFF]'
                        : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#E53935]'
                    }`}
                  >
                    <WifiOff className="w-3 h-3 text-[#EF4444]" />
                    Offline
                  </button>
                </div>
              </div>

              {/* 5. DYNAMIC SLIDER & MANUAL CONTROLS */}
              <div className="bg-[#1A2524] p-3 rounded-xl border border-[#2A3937] space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#CBD7D1]">Drag Speed Limit:</span>
                  <span className="font-bold text-[#2DBE8B]">
                    {sliderValue === 0
                      ? '0 kbps (Cut Off)'
                      : sliderValue < 1000
                      ? `${sliderValue} kbps`
                      : `${(sliderValue / 1000).toFixed(1)} Mbps`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="10"
                  value={sliderValue}
                  onChange={handleSliderChange}
                  className="w-full accent-[#2DBE8B] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-[#84908D] font-mono">
                  <span>0k (Offline)</span>
                  <span>20k (2G)</span>
                  <span>150k (3G)</span>
                  <span>1.5M (4G)</span>
                  <span>10M (Fiber)</span>
                </div>
              </div>

              {/* Custom Input & Submit */}
              <form onSubmit={handleCustomInputSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    value={customKbpsInput}
                    onChange={(e) => setCustomKbpsInput(e.target.value)}
                    placeholder="Custom kbps"
                    className="w-full bg-[#1A2524] border border-[#2A3937] focus:border-[#2DBE8B] rounded-lg px-2.5 py-1.5 text-xs text-[#FFFFFF] outline-none"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] text-[#84908D] font-mono">
                    kbps
                  </span>
                </div>

                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#202B2A] hover:bg-[#374947] border border-[#2A3937] text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Set Limit
                </button>
              </form>

              {/* 6. FORWARD PUSH & RECOVERY ACTION */}
              <div className="pt-2 border-t border-[#202B2A]">
                <button
                  type="button"
                  onClick={handleRestoreAndForwardPush}
                  disabled={isPushingQueue}
                  className="w-full py-2.5 px-3 bg-[#0F5B57] hover:bg-[#126b66] active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-60"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${isPushingQueue ? 'animate-spin' : ''}`} />
                  Restore Internet &amp; Forward-Push Queue
                </button>

                {pushStatusMessage && (
                  <div className="mt-2 text-[10px] text-center text-[#2DBE8B] font-semibold animate-fade-in">
                    {pushStatusMessage}
                  </div>
                )}
              </div>

              {/* 7. PENDING QUEUES COUNTER */}
              {pendingSyncCount && (
                <div className="flex items-center justify-between text-[10px] text-[#84908D] pt-1">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#2DBE8B]" />
                    Pending Sync Operations:
                  </span>
                  <span className="font-bold text-[#FFFFFF]">
                    {pendingSyncCount.ops} queued ({pendingSyncCount.drafts} drafts)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
