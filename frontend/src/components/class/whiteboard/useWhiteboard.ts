import { useCallback, useEffect, useRef, useState } from 'react'
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client'
import { TOPIC, apply, decode, emptyBoard, encode, snapshot, type BoardState, type Message } from './protocol'
import { lanClassroomService } from '../../../services/lanClassroomService'

/**
 * Shared whiteboard state over the LiveKit data channel (plus optional LAN WebSocket & HTTPS recorder hook).
 *
 * Teacher: every local action is applied and broadcast. When someone joins, the teacher re-sends the whole board to
 * that person only. Students never send anything and only accept messages from participants who are allowed to
 * publish (a student cannot forge the teacher's board).
 */
export function useWhiteboard(
  room: Room | undefined,
  isTeacher: boolean,
  onTeacherMessage?: (message: Message) => void,
) {
  const [board, setBoard] = useState<BoardState>(emptyBoard)
  const boardRef = useRef(board)
  boardRef.current = board
  const onTeacherMessageRef = useRef(onTeacherMessage)
  onTeacherMessageRef.current = onTeacherMessage

  const publish = useCallback(
    (messages: Message[], to?: string[]) => {
      for (const m of messages) {
        if (room) {
          room.localParticipant
            .publishData(encode(m), { reliable: true, topic: TOPIC, ...(to ? { destinationIdentities: to } : {}) })
            .catch(() => undefined) // a dropped packet must never break the lesson; the next snapshot repairs it
        }
        if (isTeacher && !to && lanClassroomService.isLanModeActive()) {
          lanClassroomService.broadcast({
            type: 'whiteboard-sync',
            senderId: 'teacher',
            senderName: 'Teacher',
            payload: m,
          })
        }
      }
    },
    [room, isTeacher],
  )

  /** Teacher: apply locally and send to everyone. */
  const dispatch = useCallback(
    (message: Message) => {
      setBoard((b) => apply(b, message))
      publish([message])
      if (isTeacher) onTeacherMessageRef.current?.(message)
    },
    [publish, isTeacher],
  )

  useEffect(() => {
    if (!room) return
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (isTeacher || topic !== TOPIC) return
      if (!participant?.permissions?.canPublish) return // only a teacher's board is believed
      const message = decode(payload)
      if (!message || message.t === 'req') return
      setBoard((b) => apply(b, message))
    }
    room.on(RoomEvent.DataReceived, onData as any)
    return () => {
      room.off(RoomEvent.DataReceived, onData as any)
    }
  }, [room, isTeacher])

  // Teacher: bring each newly connected participant up to date (twice, because their channel may still be opening).
  useEffect(() => {
    if (!room || !isTeacher) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const onJoin = (p: RemoteParticipant) => {
      for (const delay of [800, 3000]) {
        timers.push(setTimeout(() => publish(snapshot(boardRef.current), [p.identity]), delay))
      }
    }
    room.on(RoomEvent.ParticipantConnected, onJoin)
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin)
      timers.forEach(clearTimeout)
    }
  }, [room, isTeacher, publish])

  /** Teacher: show or hide the board for everyone (sending the full board when it is opened). */
  const setOpen = useCallback(
    (open: boolean) => {
      if (!isTeacher) return
      setBoard((b) => ({ ...b, open }))
      const msgs: Message[] = open ? snapshot({ ...boardRef.current, open }) : [{ t: 'open', open: false }]
      publish(msgs)
      onTeacherMessageRef.current?.({ t: 'open', open })
    },
    [isTeacher, publish],
  )

  const applyLocal = useCallback((message: Message) => setBoard((b) => apply(b, message)), [])
  const send = useCallback(
    (message: Message) => {
      publish([message])
      if (isTeacher) onTeacherMessageRef.current?.(message)
    },
    [publish, isTeacher],
  )

  return { board, dispatch, applyLocal, send, setOpen }
}
