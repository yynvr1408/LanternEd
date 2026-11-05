import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NetworkProvider } from '../context/NetworkContext'
import { SyncProvider } from '../context/SyncContext'
import { NetworkBandwidthController } from '../components/common/NetworkBandwidthController'
import { syncManager } from '../services/syncManager'
import { db } from '../db/db'

describe('NetworkBandwidthController Component', () => {
  beforeEach(async () => {
    localStorage.clear()
    delete (window as any).__LANTERNED_SIMULATED_KBPS__
    await db.assignmentDrafts.clear()
    await db.syncOperations.clear()
    vi.clearAllMocks()
  })

  it('renders the draggable floating pill initially with native speed', () => {
    render(
      <NetworkProvider>
        <SyncProvider>
          <NetworkBandwidthController />
        </SyncProvider>
      </NetworkProvider>
    )

    expect(screen.getByText(/⚡ Native \(Unlimited\)/i)).toBeInTheDocument()
  })

  it('expands into the full controller panel when pill is clicked', () => {
    render(
      <NetworkProvider>
        <SyncProvider>
          <NetworkBandwidthController />
        </SyncProvider>
      </NetworkProvider>
    )

    const pill = screen.getByText(/⚡ Native \(Unlimited\)/i)
    fireEvent.click(pill)

    expect(screen.getByText('Bandwidth Simulation Tool')).toBeInTheDocument()
    expect(screen.getByText('Bandwidth Presets')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Offline/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2G \(20k\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3G \(150k\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /4G \(1.5M\)/i })).toBeInTheDocument()
  })

  it('simulates offline mode when Offline preset is clicked', async () => {
    render(
      <NetworkProvider>
        <SyncProvider>
          <NetworkBandwidthController />
        </SyncProvider>
      </NetworkProvider>
    )

    // Expand
    fireEvent.click(screen.getByText(/⚡ Native \(Unlimited\)/i))

    // Click Offline preset
    const offlineBtn = screen.getByRole('button', { name: /Offline/i })
    fireEvent.click(offlineBtn)

    await waitFor(() => {
      expect((window as any).__LANTERNED_SIMULATED_KBPS__).toBe(0)
      expect(screen.getByText(/Offline Fallback:/i)).toBeInTheDocument()
    })
  })

  it('simulates 2G low-bandwidth mode and triggers audio-only fallback details', async () => {
    render(
      <NetworkProvider>
        <SyncProvider>
          <NetworkBandwidthController />
        </SyncProvider>
      </NetworkProvider>
    )

    // Expand
    fireEvent.click(screen.getByText(/⚡ Native \(Unlimited\)/i))

    // Click 2G preset
    const twoGBtn = screen.getByRole('button', { name: /2G \(20k\)/i })
    fireEvent.click(twoGBtn)

    await waitFor(() => {
      expect((window as any).__LANTERNED_SIMULATED_KBPS__).toBe(20)
      expect(screen.getByText(/LiveKit Fallback:/i)).toBeInTheDocument()
    })
  })

  it('updates simulated bandwidth when slider is dragged', async () => {
    render(
      <NetworkProvider>
        <SyncProvider>
          <NetworkBandwidthController />
        </SyncProvider>
      </NetworkProvider>
    )

    fireEvent.click(screen.getByText(/⚡ Native \(Unlimited\)/i))

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '250' } })

    await waitFor(() => {
      expect((window as any).__LANTERNED_SIMULATED_KBPS__).toBe(250)
    })
  })

  it('sets custom limit and triggers restore & forward-push queue', async () => {
    const processQueueSpy = vi.spyOn(syncManager, 'processQueue').mockResolvedValue({
      successful: 2,
      failed: 0,
      remaining: 0,
    })

    render(
      <NetworkProvider>
        <SyncProvider>
          <NetworkBandwidthController />
        </SyncProvider>
      </NetworkProvider>
    )

    fireEvent.click(screen.getByText(/⚡ Native \(Unlimited\)/i))

    // Type custom 64 kbps and submit
    const input = screen.getByPlaceholderText(/Custom kbps/i)
    fireEvent.change(input, { target: { value: '64' } })
    fireEvent.click(screen.getByRole('button', { name: /Set Limit/i }))

    await waitFor(() => {
      expect((window as any).__LANTERNED_SIMULATED_KBPS__).toBe(64)
    })

    // Click Restore Internet & Forward-Push Queue
    const pushBtn = screen.getByRole('button', { name: /Restore Internet & Forward-Push Queue/i })
    fireEvent.click(pushBtn)

    await waitFor(() => {
      expect(processQueueSpy).toHaveBeenCalled()
      expect((window as any).__LANTERNED_SIMULATED_KBPS__).toBeUndefined()
      expect(screen.getByText(/Forward-pushed successfully! 2 synced, 0 remaining./i)).toBeInTheDocument()
    })
  })
})
