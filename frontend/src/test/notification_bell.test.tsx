import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { NotificationBell } from '../components/layout/NotificationBell'
import * as network from '../context/NetworkContext'
import * as api from '../services/apiClient'

const note = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'n1',
  kind: 'class_live',
  title: 'Class is live: Optics',
  body: 'Tap to join now.',
  link: '/classroom/c1',
  created_at: new Date().toISOString(),
  read_at: null,
  ...over,
})

const Where: React.FC = () => <p data-testid="where">{useLocation().pathname}</p>

const renderBell = () =>
  render(
    <MemoryRouter initialEntries={['/student/dashboard']}>
      <NotificationBell />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.spyOn(network, 'useNetworkStatus').mockReturnValue({ isOnline: true, quality: 'good' } as ReturnType<typeof network.useNetworkStatus>)
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the unread count and the list, and opening one marks it read and navigates in-app', async () => {
    const request = vi.spyOn(api, 'apiRequest').mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/notifications?')) return { items: [note()], unread: 1 } as never
      return { marked: 1 } as never
    })
    renderBell()

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    fireEvent.click(bell)
    fireEvent.click(await screen.findByText('Class is live: Optics'))

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/classroom/c1'))
    expect(request).toHaveBeenCalledWith('/notifications/read', expect.objectContaining({ method: 'POST', body: JSON.stringify({ ids: ['n1'] }) }))
  })

  it('never follows an external link from a notification', async () => {
    vi.spyOn(api, 'apiRequest').mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/notifications?')) return { items: [note({ link: 'https://evil.example/x' }), note({ id: 'n2', title: 'Protocol relative', link: '//evil.example' })], unread: 2 } as never
      return { marked: 1 } as never
    })
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
    fireEvent.click(await screen.findByText('Class is live: Optics'))
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    fireEvent.click(await screen.findByText('Protocol relative'))
    expect(screen.getByTestId('where').textContent).toBe('/student/dashboard')
  })

  it('stays quiet when the server cannot be reached', async () => {
    vi.spyOn(api, 'apiRequest').mockRejectedValue(new Error('offline'))
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('Nothing new yet.')).toBeTruthy()
  })
})
