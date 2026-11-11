/**
 * Local LAN Campus Classroom Service
 *
 * Implements zero-internet peer-to-peer classroom sessions over local school Wi-Fi
 * or ethernet routers when external WAN connectivity is down. Audio, whiteboard frames,
 * live captions, and cached lesson packs stream across local network sockets without cloud egress.
 */

import { platformAdapter, type LanClassroomSession } from './platformAdapter'

export interface LanPeerMessage {
  type: 'whiteboard-sync' | 'chat-msg' | 'roster-ping' | 'audio-status' | 'caption-chunk'
  senderId: string
  senderName: string
  payload: any
  timestamp: number
}

class LanClassroomManager {
  private activeSession: LanClassroomSession | null = null
  private peers: Map<string, { id: string; name: string; ip: string; ping: number }> = new Map()
  private messageListeners: Set<(msg: LanPeerMessage) => void> = new Set()
  private socket: WebSocket | null = null
  private sharedPacks: Map<string, { url: string; sha256: string }> = new Map()

  async startSession(classId: string, title: string, teacherName: string): Promise<LanClassroomSession> {
    const session = await platformAdapter.startLanClassroom({
      classId,
      title,
      teacherName,
    })
    this.activeSession = session
    this.peers.clear()
    return session
  }

  /** Connects a student browser or desktop client to an active teacher LAN WebSocket URL. */
  connectToRoom(wsUrl: string): void {
    if (typeof WebSocket === 'undefined') return
    this.disconnectSocket()
    try {
      const ws = new WebSocket(wsUrl)
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as LanPeerMessage
          if (parsed && typeof parsed === 'object' && parsed.type) {
            if (parsed.type === 'roster-ping' && parsed.senderId) {
              this.peers.set(parsed.senderId, {
                id: parsed.senderId,
                name: parsed.senderName || 'Student',
                ip: 'LAN',
                ping: 0,
              })
            }
            this.messageListeners.forEach((listener) => listener(parsed))
          }
        } catch {
          // ignore malformed LAN frame
        }
      }
      this.socket = ws
    } catch {
      // WebSocket unsupported or refused
    }
  }

  private disconnectSocket(): void {
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore close failure
      }
      this.socket = null
    }
  }

  async stopSession(classId: string): Promise<void> {
    this.disconnectSocket()
    if (this.activeSession && this.activeSession.classId === classId) {
      await platformAdapter.stopLanClassroom(classId)
      this.activeSession = null
      this.peers.clear()
      this.sharedPacks.clear()
    }
  }

  getActiveSession(): LanClassroomSession | null {
    return this.activeSession
  }

  isLanModeActive(): boolean {
    return Boolean(this.activeSession?.isRunning)
  }

  getConnectedPeers() {
    return Array.from(this.peers.values())
  }

  async sharePackOverLan(packId: string, blob: Blob, sha256: string): Promise<string | null> {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const url = await platformAdapter.registerLanPack(packId, blob.type || 'application/zip', sha256, bytes)
    if (url) {
      this.sharedPacks.set(packId, { url, sha256 })
    }
    return url
  }

  getSharedPacks(): Array<{ id: string; url: string; sha256: string }> {
    return Array.from(this.sharedPacks.entries()).map(([id, v]) => ({ id, ...v }))
  }

  broadcast(message: Omit<LanPeerMessage, 'timestamp'>): void {
    const fullMsg: LanPeerMessage = {
      ...message,
      timestamp: Date.now(),
    }
    const serialized = JSON.stringify(fullMsg)
    this.messageListeners.forEach((listener) => listener(fullMsg))
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(serialized)
    } else if (this.activeSession?.isRunning) {
      void platformAdapter.broadcastLanMessage(serialized)
    }
  }

  onMessage(callback: (msg: LanPeerMessage) => void): () => void {
    this.messageListeners.add(callback)
    return () => {
      this.messageListeners.delete(callback)
    }
  }
}

export const lanClassroomService = new LanClassroomManager()
