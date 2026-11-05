import React, { useState } from 'react'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '../../context/NetworkContext'

export interface LiveSyncIndicatorProps {
  lastUpdated?: Date | null
  onRefresh?: () => Promise<void> | void
  isRefreshing?: boolean
  className?: string
}

export const LiveSyncIndicator: React.FC<LiveSyncIndicatorProps> = ({
  lastUpdated = new Date(),
  onRefresh,
  isRefreshing = false,
  className = '',
}) => {
  const { isOnline } = useNetworkStatus()
  const [internalBusy, setInternalBusy] = useState(false)

  const busy = isRefreshing || internalBusy

  const handleRefresh = async () => {
    if (!onRefresh || busy || !isOnline) return
    setInternalBusy(true)
    try {
      await onRefresh()
    } finally {
      setInternalBusy(false)
    }
  }

  const formatTime = (d: Date | null) => {
    if (!d) return 'Just now'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        !isOnline
          ? 'bg-[#FFF0CB] text-[#8A5700] border-[#CBD7D1]'
          : 'bg-[#E5F5EB] text-[#247A4D] border-[#CBD7D1]'
      } ${className}`}
      title={
        !isOnline
          ? 'Working offline with local cache. Changes will sync once connected.'
          : 'Connected live with LanternEd servers.'
      }
    >
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#247A4D] opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isOnline ? 'bg-[#247A4D]' : 'bg-[#8A5700]'
          }`}
        />
      </span>

      <span>
        {!isOnline
          ? 'Offline Cache'
          : busy
          ? 'Syncing updates...'
          : `Live · ${formatTime(lastUpdated)}`}
      </span>

      {onRefresh && isOnline && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={busy}
          className="p-0.5 -mr-1 rounded hover:bg-black/5 active:bg-black/10 transition-colors text-inherit disabled:opacity-50 cursor-pointer"
          aria-label="Refresh live data"
          title="Refresh server data now"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  )
}
