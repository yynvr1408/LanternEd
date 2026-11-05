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
} from 'lucide-react'
import { useNetworkStatus } from '../../context/NetworkContext'
import { db } from '../../db/db'
import { useLiveQuery } from 'dexie-react-hooks'

export const NetworkBandwidthController: React.FC = () => {
  const {
    isOnline,
    quality,
    latencyMs,
    simulatedBandwidthKbps,
    setSimulatedBandwidth,
    restoreNormalNetwork,
    isSimulated,
  } = useNetworkStatus()

  // Expanded panel vs compact floating pill
  const [isExpanded, setIsExpanded] = useState<boolean>(false)

  // Floating coordinates
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      const savedX = localStorage.getItem('lanterned_net_ctrl_x')
      const savedY = localStorage.getItem('lanterned_net_ctrl_y')
      if (savedX && savedY) {
        return { x: Number(savedX), y: Number(savedY) }
      }
      return { x: Math.max(16, window.innerWidth - 340), y: Math.max(16, window.innerHeight - 100) }
    }
    return { x: 20, y: 500 }
  })

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

  // Dragging logic (Mouse & Touch compatible)
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
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

      const newX = Math.max(10, Math.min(window.innerWidth - (isExpanded ? 340 : 160), dragStartRef.current.posX + deltaX))
      const newY = Math.max(10, Math.min(window.innerHeight - (isExpanded ? 460 : 60), dragStartRef.current.posY + deltaY))

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

  // Visual label for current simulated speed
  const getSpeedLabel = () => {
    if (simulatedBandwidthKbps === null) return '⚡ Native (Unlimited)'
    if (simulatedBandwidthKbps === 0) return '🔴 Offline (0 kbps)'
    if (simulatedBandwidthKbps < 1000) return `⚠️ ${simulatedBandwidthKbps} kbps`
    return `📶 ${(simulatedBandwidthKbps / 1000).toFixed(1)} Mbps`
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
      }}
      className="select-none font-sans"
    >
      {!isExpanded ? (
        /* ================= COMPACT DRAGGABLE PILL ================= */
        <div className="flex items-center gap-1.5 p-1.5 pl-2.5 bg-[#121A19]/95 backdrop-blur-md text-white rounded-full shadow-2xl border border-[#2DBE8B]/40 hover:border-[#2DBE8B] transition-colors cursor-move">
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
            className="flex items-center gap-2 cursor-pointer pr-1"
            title="Click to open Bandwidth Controller"
          >
            {simulatedBandwidthKbps === 0 ? (
              <span className="w-2.5 h-2.5 rounded-full bg-[#E53935] animate-pulse" />
            ) : simulatedBandwidthKbps !== null && simulatedBandwidthKbps <= 30 ? (
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-[#2DBE8B]" />
            )}

            <span className="text-xs font-bold tracking-tight text-[#E1E8E4]">
              {getSpeedLabel()}
            </span>

            {pendingSyncCount && (pendingSyncCount.drafts > 0 || pendingSyncCount.ops > 0) ? (
              <span className="bg-[#E53935] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {pendingSyncCount.drafts + pendingSyncCount.ops}
              </span>
            ) : null}

            <Sliders className="w-3.5 h-3.5 text-[#2DBE8B] ml-1" />
          </div>
        </div>
      ) : (
        /* ================= EXPANDED CONTROLLER PANEL ================= */
        <div className="w-[330px] sm:w-[350px] bg-[#121A19] text-[#FFFFFF] rounded-2xl shadow-2xl border border-[#202B2A] overflow-hidden flex flex-col">
          {/* Header & Drag Bar */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="bg-[#1A2524] px-3.5 py-2.5 flex items-center justify-between border-b border-[#202B2A] cursor-grab active:cursor-grabbing touch-none"
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

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-[#84908D] hover:text-[#FFFFFF] p-1 rounded-md transition-colors"
              title="Minimize to floating pill"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3.5 space-y-3 text-xs">
            {/* Live Metrics HUD */}
            <div className="bg-[#1A2524] p-3 rounded-xl border border-[#2A3937] flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-[#84908D] uppercase font-semibold">Incoming / Outgoing</span>
                <span className="text-sm font-bold text-[#FFFFFF] flex items-center gap-1.5 mt-0.5">
                  <ArrowDown className="w-3.5 h-3.5 text-[#2DBE8B]" />
                  {simulatedBandwidthKbps === null
                    ? 'Native Speed'
                    : simulatedBandwidthKbps === 0
                    ? '0 kbps'
                    : `${simulatedBandwidthKbps} kbps`}
                  <span className="text-[#84908D] font-normal text-xs">/</span>
                  <ArrowUp className="w-3.5 h-3.5 text-[#38BDF8]" />
                  {simulatedBandwidthKbps === null
                    ? 'Native'
                    : simulatedBandwidthKbps === 0
                    ? '0 kbps'
                    : `${Math.round(simulatedBandwidthKbps * 0.5)} kbps`}
                </span>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-[10px] text-[#84908D] uppercase font-semibold">Latency / State</span>
                <span className="text-xs font-bold mt-0.5 flex items-center gap-1">
                  {!isOnline ? (
                    <span className="text-[#E53935] font-semibold flex items-center gap-1">
                      <WifiOff className="w-3 h-3" /> Offline
                    </span>
                  ) : quality === 'poor' ? (
                    <span className="text-[#F59E0B] font-semibold flex items-center gap-1">
                      <Radio className="w-3 h-3 animate-pulse" /> 2G Audio
                    </span>
                  ) : (
                    <span className="text-[#2DBE8B] font-semibold flex items-center gap-1">
                      <Wifi className="w-3 h-3" /> {latencyMs}ms
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Active Fallback Indicator */}
            <div className="p-2.5 rounded-lg text-[11px] border bg-[#15201F] border-[#2A3937] text-[#CBD7D1]">
              {!isOnline ? (
                <div className="flex items-center gap-2 text-[#EF4444]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Offline Fallback:</strong> Writing drafts saves to IndexedDB; API calls fail cleanly with sync queue pending.
                  </span>
                </div>
              ) : quality === 'poor' ? (
                <div className="flex items-center gap-2 text-[#F59E0B]">
                  <Radio className="w-4 h-4 shrink-0 animate-pulse" />
                  <span>
                    <strong>LiveKit Fallback:</strong> Low-bandwidth voice stream active. Video unsubscribed at transport layer.
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

            {/* Quick Presets */}
            <div>
              <span className="text-[10px] font-bold text-[#84908D] uppercase tracking-wider block mb-1.5">
                Bandwidth Presets
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleApplyPreset(0)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    simulatedBandwidthKbps === 0
                      ? 'bg-[#E53935] text-white border-[#E53935] shadow-sm'
                      : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#E53935]'
                  }`}
                >
                  <WifiOff className="w-3 h-3 text-[#EF4444]" />
                  Offline
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset(20)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    simulatedBandwidthKbps === 20
                      ? 'bg-[#D97706] text-white border-[#D97706] shadow-sm'
                      : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#D97706]'
                  }`}
                >
                  <Radio className="w-3 h-3 text-[#F59E0B]" />
                  2G (20k)
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset(150)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    simulatedBandwidthKbps === 150
                      ? 'bg-[#0284C7] text-white border-[#0284C7] shadow-sm'
                      : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#0284C7]'
                  }`}
                >
                  <Wifi className="w-3 h-3 text-[#38BDF8]" />
                  3G (150k)
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset(1500)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    simulatedBandwidthKbps === 1500
                      ? 'bg-[#059669] text-white border-[#059669] shadow-sm'
                      : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#059669]'
                  }`}
                >
                  <Zap className="w-3 h-3 text-[#2DBE8B]" />
                  4G (1.5M)
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset(null)}
                  className={`col-span-2 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    simulatedBandwidthKbps === null
                      ? 'bg-[#0F5B57] text-white border-[#2DBE8B] shadow-sm'
                      : 'bg-[#1A2524] text-[#E1E8E4] border-[#2A3937] hover:border-[#2DBE8B]'
                  }`}
                >
                  <RotateCcw className="w-3 h-3 text-[#2DBE8B]" />
                  Native / Full Speed
                </button>
              </div>
            </div>

            {/* Drag Slider (Dynamic Speed Controller) */}
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
                max="5000"
                step="10"
                value={sliderValue}
                onChange={handleSliderChange}
                className="w-full accent-[#2DBE8B] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-[#84908D] font-mono">
                <span>0k (Offline)</span>
                <span>20k (2G)</span>
                <span>250k (3G)</span>
                <span>1.5M (4G)</span>
                <span>5M (HD)</span>
              </div>
            </div>

            {/* Manual Input & Submit */}
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

            {/* Forward Push & Recovery Action */}
            <div className="pt-1 border-t border-[#202B2A]">
              <button
                type="button"
                onClick={handleRestoreAndForwardPush}
                disabled={isPushingQueue}
                className="w-full py-2 px-3 bg-[#0F5B57] hover:bg-[#126b66] active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-60"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${isPushingQueue ? 'animate-spin' : ''}`} />
                Restore Internet & Forward-Push Queue
              </button>

              {pushStatusMessage && (
                <div className="mt-2 text-[10px] text-center text-[#2DBE8B] font-semibold animate-fade-in">
                  {pushStatusMessage}
                </div>
              )}
            </div>

            {/* Pending Queues Counter */}
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
  )
}
