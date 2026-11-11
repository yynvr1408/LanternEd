import React, { useEffect, useRef, useState } from 'react'
import { FileText, MessageSquareText, PencilLine, WifiOff } from 'lucide-react'
import { summaryService } from '../../services/summaryService'
import { api } from '../../services/apiClient'
import { SummaryViewer } from '../summary/SummaryViewer'
import { Whiteboard } from './whiteboard/Whiteboard'
import { apply, emptyBoard, type BoardState, type Message } from './whiteboard/protocol'
import { LoadingState } from '../ui'
import type { Summary } from '../../types'

export interface TextFallbackPanelProps {
  classId: string
}

interface CaptionItem {
  seq: number
  text: string
  author?: string
  at?: string
}

/**
 * Shown when the connection is too weak to sustain even audio-only mode (sustained "Lost"
 * quality while already audio-only — see useAdaptiveAudio's severeDegradation).
 * Combines two resilient channels:
 *  1. Ultra-low-KB HTTPS incremental polling (<2 KB/s on port 443, survives UDP firewall blocks)
 *     for live teacher captions/notes and vector whiteboard frames; and
 *  2. The latest lecture summary (with offline IndexedDB fallback) so students always have concrete
 *     reading and practice quizzes even when no live frames arrive.
 */
export const TextFallbackPanel: React.FC<TextFallbackPanelProps> = ({ classId }) => {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasSummary, setHasSummary] = useState(false)
  const [captions, setCaptions] = useState<CaptionItem[]>([])
  const [liveBoard, setLiveBoard] = useState<BoardState>(emptyBoard)
  const [hasBoardEvents, setHasBoardEvents] = useState(false)
  const sinceSeqRef = useRef(0)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    summaryService
      .getClassSummary(classId)
      .then((s) => {
        if (!active) return
        setSummary(s)
        setHasSummary(true)
      })
      .catch(() => {
        if (active) setHasSummary(false)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [classId])

  useEffect(() => {
    let active = true
    sinceSeqRef.current = 0
    setCaptions([])
    setLiveBoard(emptyBoard)
    setHasBoardEvents(false)

    const pollFeed = async () => {
      try {
        const res = await api.getClassFallbackFeed(classId, sinceSeqRef.current)
        if (!active || !res || !Array.isArray(res.events) || res.events.length === 0) return
        sinceSeqRef.current = Math.max(sinceSeqRef.current, Number(res.latest_seq || 0))
        const newCaptions: CaptionItem[] = []
        const boardMsgs: Message[] = []
        for (const ev of res.events) {
          if (ev.kind === 'caption' && typeof ev.text === 'string') {
            newCaptions.push({ seq: Number(ev.seq || 0), text: ev.text, author: ev.author, at: ev.at })
          } else if (ev.kind === 'whiteboard' && ev.msg && typeof ev.msg === 'object') {
            boardMsgs.push(ev.msg as Message)
          }
        }
        if (newCaptions.length > 0) {
          setCaptions((prev) => [...prev, ...newCaptions].slice(-40))
        }
        if (boardMsgs.length > 0) {
          setHasBoardEvents(true)
          setLiveBoard((prev) => {
            let next = { ...prev, open: true }
            for (const msg of boardMsgs) {
              next = apply(next, msg)
            }
            return next
          })
        }
      } catch {
        // Offline or server unavailable; silently keep cached view and retry cleanly
      }
    }

    void pollFeed()
    const timer = setInterval(() => {
      void pollFeed()
    }, 4000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [classId])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="max-w-2xl w-full space-y-4">
        <div className="flex items-center gap-2 text-[#C9D3D0]">
          <WifiOff className="w-5 h-5 text-[#2364AA] shrink-0" />
          <p className="text-xs">
            <strong className="text-white">Connection too weak for audio right now.</strong> Using low-data HTTPS
            captions, whiteboard deltas, and cached notes so you can keep following along until audio resumes.
          </p>
        </div>

        {hasBoardEvents && (
          <div className="bg-[#121A19] border border-[#202B2A] rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7EE2B8]">
              <PencilLine className="w-3.5 h-3.5" />
              <span>Live Whiteboard Sync (HTTPS Fallback)</span>
            </div>
            <div className="h-56 w-full">
              <Whiteboard board={liveBoard} />
            </div>
          </div>
        )}

        {captions.length > 0 && (
          <div className="bg-[#F8FAF7] border border-[#CBD7D1] rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F5B57]">
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Live Teacher Notes &amp; Captions</span>
            </div>
            <ul className="space-y-1.5 text-xs text-[#202B2A]">
              {captions.map((c, idx) => (
                <li key={`${c.seq}-${idx}`} className="bg-white border border-[#E1E8E4] rounded-lg px-2.5 py-1.5">
                  {c.author && <strong className="text-[#0F5B57] mr-1.5">{c.author}:</strong>}
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-xl p-4 sm:p-5 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <LoadingState message="Checking for a lecture summary..." />
          ) : hasSummary && summary ? (
            <SummaryViewer summary={summary} isCompact isTeacher={false} />
          ) : (
            <div className="text-center py-10 text-[#687775] text-xs flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-[#0F5B57]" />
              <p>No summary is available yet for this session.</p>
              <p>We&apos;ll keep trying to restore audio and live text updates in the background.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
