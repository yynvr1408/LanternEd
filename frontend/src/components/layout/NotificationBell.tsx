import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { useNetworkStatus } from '../../context/NetworkContext'

interface AppNotification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  read_at: string | null
}

const POLL_MS = 60_000

/** Only ever follow an in-app path the server sent; never an external or protocol-relative URL. */
const safeLink = (link: string | null): string | null => (link && link.startsWith('/') && !link.startsWith('//') ? link : null)

const timeAgo = (iso: string): string => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/**
 * Notification bell. Polls only while the app is online and the tab is visible, once a minute, so it costs a
 * learner on a weak connection almost nothing; it fails silently (a missing bell must never break the page).
 */
export const NotificationBell: React.FC = () => {
  const { isOnline } = useNetworkStatus()
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<{ items: AppNotification[]; unread: number }>('/notifications?limit=20')
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      // offline, signed out, or the server is busy: keep what we have
    }
  }, [])

  useEffect(() => {
    if (!isOnline) return
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [isOnline, refresh])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markRead = async (ids: string[] | null) => {
    try {
      await apiRequest('/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) })
      await refresh()
    } catch {
      // best effort
    }
  }

  const openItem = (n: AppNotification) => {
    if (!n.read_at) void markRead([n.id])
    const target = safeLink(n.link)
    setOpen(false)
    if (target) navigate(target)
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) void refresh()
        }}
        className="relative p-1.5 sm:p-2 text-[#687775] hover:text-[#0F5B57] hover:bg-[#DDF3EA] rounded-lg transition-colors cursor-pointer"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#B42318] text-white text-[10px] leading-4 font-bold text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-72 sm:w-80 max-h-96 overflow-auto bg-white border border-[#E1E8E4] rounded-xl shadow-lg z-50"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#E1E8E4]">
            <span className="text-xs font-bold text-[#202B2A]">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={() => markRead(null)} className="text-xs font-semibold text-[#0F5B57] hover:underline cursor-pointer">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-xs text-center text-[#687775]">Nothing new yet.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[#F1F5F2] hover:bg-[#F8FAF7] cursor-pointer ${n.read_at ? '' : 'bg-[#E5F5EB]/50'}`}
                  >
                    <span className="block text-sm font-semibold text-[#202B2A]">{n.title}</span>
                    {n.body && <span className="block text-xs text-[#687775]">{n.body}</span>}
                    <span className="block text-[11px] text-[#8A9794] mt-0.5">{timeAgo(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
