/**
 * Local LAN Campus Classroom Service
 *
 * Implements zero-internet peer-to-peer classroom sessions over local school Wi-Fi
 * or ethernet routers when external WAN connectivity is down. Audio, video, and
 * whiteboard state stream directly across local network sockets without cloud egress.
 */

import { platformAdapter, type LanClassroomSession } from './platformAdapter'

export interface LanPeerMessage {
  type: 'whiteboard-sync' | 'chat-msg' | 'roster-ping' | 'audio-status'
  senderId: string
  senderName: string
  payload: any
  timestamp: number
}

class LanClassroomManager {
  private activeSession: LanClassroomSession | null = null
  private peers: Map<string, { id: string; name: string; ip: string; ping: number }> = new Map()
  private messageListeners: Set<(msg: LanPeerMessage) => void> = new Set()

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

  async stopSession(classId: string): Promise<void> {
    if (this.activeSession && this.activeSession.classId === classId) {
      await platformAdapter.stopLanClassroom(classId)
      this.activeSession = null
      this.peers.clear()
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

  broadcast(message: Omit<LanPeerMessage, 'timestamp'>): void {
    const fullMsg: LanPeerMessage = {
      ...message,
      timestamp: Date.now(),
    }
    this.messageListeners.forEach((listener) => listener(fullMsg))
  }

  onMessage(callback: (msg: LanPeerMessage) => void): () => void {
    this.messageListeners.add(callback)
    return () => {
      this.messageListeners.delete(callback)
    }
  }
}

export const lanClassroomService = new LanClassroomManager()
