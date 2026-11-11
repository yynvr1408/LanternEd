import React, { useState, useEffect } from 'react'
import { Video, Wifi, RefreshCw, Radio } from 'lucide-react'
import { classService } from '../../services/classService'
import { lanClassroomService } from '../../services/lanClassroomService'
import { platformAdapter, type LanDiscoveredRoom } from '../../services/platformAdapter'
import { Whiteboard } from '../../components/class/whiteboard/Whiteboard'
import { apply, emptyBoard, type Message as WhiteboardMessage } from '../../components/class/whiteboard/protocol'
import type { ClassRoom } from '../../types'
import { PageContainer } from '../../components/layout/PageContainer'
import { ClassCard } from '../../components/class/ClassCard'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'

export const StudentClassesPage: React.FC = () => {
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [filter, setFilter] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Campus Wi-Fi LAN discovery & zero-internet student receiver
  const [showLanPanel, setShowLanPanel] = useState(false)
  const [lanUrlInput, setLanUrlInput] = useState('ws://192.168.1.100:8443/lan-room')
  const [discoveredRooms, setDiscoveredRooms] = useState<LanDiscoveredRoom[]>([])
  const [isScanningLan, setIsScanningLan] = useState(false)
  const [connectedLanUrl, setConnectedLanUrl] = useState<string | null>(() =>
    lanClassroomService.getConnectedRoomUrl()
  )
  const [lanNotes, setLanNotes] = useState<string[]>([])
  const [lanBoard, setLanBoard] = useState(() => emptyBoard())
  const canDiscoverLan = platformAdapter.getPlatformUxProfile().canDiscoverLan

  useEffect(() => {
    let isMounted = true
    classService
      .getClasses()
      .then((data) => {
        if (isMounted) setClasses(data)
      })
      .catch((err) => {
        console.error(err)
        if (isMounted) setLoadError('Could not load your classes. Please try again.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!connectedLanUrl) return
    const unsub = lanClassroomService.onMessage((msg) => {
      if (msg.type === 'caption-chunk' && msg.payload?.text) {
        setLanNotes((prev) => [...prev.slice(-24), String(msg.payload.text)])
      } else if (msg.type === 'whiteboard-sync' && msg.payload) {
        setLanBoard((prev) => apply(prev, msg.payload as WhiteboardMessage))
      }
    })
    return unsub
  }, [connectedLanUrl])

  const handleScanLanRooms = async () => {
    setIsScanningLan(true)
    try {
      const rooms = await lanClassroomService.discoverRooms()
      setDiscoveredRooms(rooms)
      if (rooms[0]?.wsUrl) setLanUrlInput(rooms[0].wsUrl)
    } finally {
      setIsScanningLan(false)
    }
  }

  const handleConnectLanRoom = (url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return
    lanClassroomService.connectToRoom(trimmed)
    setConnectedLanUrl(trimmed)
    setLanBoard({ ...emptyBoard(), open: true })
  }

  const filtered = classes.filter((c) => {
    if (filter === 'live') return c.status === 'LIVE'
    if (filter === 'scheduled') return c.status === 'SCHEDULED'
    if (filter === 'ended') return c.status === 'ENDED'
    return true
  })

  // Branch-wide classes (created by an "All Sections" teacher) live in their own "Other Classes" section; every
  // class is in exactly one of the two lists, so nothing can appear twice.
  const mainClasses = filtered.filter((c) => !c.branch_id)
  const otherClasses = filtered.filter((c) => !!c.branch_id)
  const cardGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4'

  return (
    <PageContainer
      title="Live Classroom Sessions"
      subtitle="Join real-time WebRTC audio/video sessions or connect directly to a Campus Wi-Fi LAN teacher hub."
      action={
        <Button
          size="sm"
          variant={showLanPanel || connectedLanUrl ? 'primary' : 'outline'}
          onClick={() => setShowLanPanel((v) => !v)}
          icon={<Wifi className="w-4 h-4" />}
        >
          {connectedLanUrl ? 'LAN Connected' : 'Campus Wi-Fi (LAN)'}
        </Button>
      }
    >
      {showLanPanel && (
        <div className="mb-6 p-4 bg-[#FFFFFF] border border-[#CBD7D1] rounded-2xl space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#202B2A] flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#0F5B57]" /> Zero-Internet Campus LAN Receiver
              </h2>
              <p className="text-xs text-[#687775]">
                Receive live teacher whiteboard strokes and notes over school Wi-Fi when external internet is down.
              </p>
            </div>
            {canDiscoverLan && (
              <Button
                size="sm"
                variant="outline"
                isLoading={isScanningLan}
                onClick={() => void handleScanLanRooms()}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Scan Wi-Fi Rooms
              </Button>
            )}
          </div>

          {discoveredRooms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {discoveredRooms.map((room) => (
                <button
                  key={`${room.localIp}:${room.port}`}
                  type="button"
                  onClick={() => handleConnectLanRoom(room.wsUrl)}
                  className="px-3 py-1.5 rounded-lg bg-[#DDF3EA] text-[#0F5B57] border border-[#0F5B57]/30 text-xs font-semibold cursor-pointer hover:bg-[#CBEBD9]"
                >
                  Join {room.name} ({room.localIp}:{room.port})
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={lanUrlInput}
              onChange={(e) => setLanUrlInput(e.target.value)}
              placeholder="ws://192.168.x.x:8443/lan-room"
              className="flex-1 text-xs font-mono"
            />
            <Button size="sm" variant="primary" onClick={() => handleConnectLanRoom(lanUrlInput)}>
              Connect LAN Room
            </Button>
          </div>

          {connectedLanUrl && (
            <div className="space-y-2 pt-2 border-t border-[#E1E8E4]">
              <div className="flex items-center justify-between text-xs">
                <Badge variant="success" size="sm">Connected: {connectedLanUrl}</Badge>
              </div>
              {lanBoard.items.length > 0 && (
                <div className="rounded-xl border border-[#E1E8E4] bg-[#121A19] p-2 max-w-2xl">
                  <Whiteboard board={lanBoard} />
                </div>
              )}
              {lanNotes.length > 0 && (
                <div className="p-3 bg-[#F8FAF7] border border-[#E1E8E4] rounded-lg space-y-1 text-xs text-[#202B2A]">
                  <p className="font-semibold text-[#0F5B57]">Live Teacher Notes:</p>
                  {lanNotes.map((note, idx) => (
                    <p key={idx}>{note}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {(['all', 'live', 'scheduled', 'ended'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shrink-0 ${
              filter === tab
                ? 'bg-[#0F5B57] text-[#FFFFFF]'
                : 'bg-[#F1F5F2] text-[#687775] hover:text-[#0F5B57] hover:bg-[#DDF3EA] border border-[#E1E8E4]'
            }`}
          >
            {tab === 'all' ? 'All Classes' : tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : loadError ? (
        <EmptyState icon={<Video className="w-6 h-6" />} title="Classes unavailable" description={loadError} />
      ) : (
        <>
          {mainClasses.length === 0 && otherClasses.length === 0 ? (
            <EmptyState
              icon={<Video className="w-6 h-6" />}
              title="No sessions found"
              description={`No classes match the filter '${filter}'.`}
            />
          ) : (
            mainClasses.length > 0 && (
              <div className={cardGrid}>
                {mainClasses.map((cls) => (
                  <ClassCard key={cls.id} classroom={cls} />
                ))}
              </div>
            )
          )}

          <section aria-labelledby="other-classes-heading" className="mt-8" data-testid="other-classes">
            <h2 id="other-classes-heading" className="text-base font-bold text-[#202B2A] mb-1">
              Other Classes
            </h2>
            <p className="text-xs text-[#687775] mb-4">Classes from teachers who teach every section of your branch.</p>
            {otherClasses.length === 0 ? (
              <p className="text-sm text-[#687775]">No other classes right now.</p>
            ) : (
              <div className={cardGrid}>
                {otherClasses.map((cls) => (
                  <ClassCard key={cls.id} classroom={cls} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </PageContainer>
  )
}
