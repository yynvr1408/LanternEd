import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WhatsAppSettings } from '../components/profile/WhatsAppSettings'
import * as auth from '../context/AuthContext'
import * as api from '../services/apiClient'

const mockUser = (over = {}) =>
  vi.spyOn(auth, 'useAuth').mockReturnValue({
    user: { id: 'u1', email: 'a@example.com', full_name: 'Asha', role: 'student', phone: null, whatsapp_opt_in: false, ...over },
    refreshUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof auth.useAuth>)

describe('WhatsAppSettings', () => {
  afterEach(() => vi.restoreAllMocks())

  it('will not save a number that is not in international format', () => {
    mockUser()
    render(<WhatsAppSettings />)
    fireEvent.change(screen.getByLabelText(/WhatsApp number/), { target: { value: '9876543210' } })
    expect(screen.getByRole('alert').textContent).toMatch(/international format/)
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('needs a number before alerts can be switched on', () => {
    mockUser()
    render(<WhatsAppSettings />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText('Add your number to turn alerts on.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves the number together with the explicit consent', async () => {
    mockUser()
    const request = vi.spyOn(api, 'apiRequest').mockResolvedValue({} as never)
    render(<WhatsAppSettings />)
    fireEvent.change(screen.getByLabelText(/WhatsApp number/), { target: { value: '+919876543210' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/users/me', { method: 'PATCH', body: JSON.stringify({ phone: '+919876543210', whatsapp_opt_in: true }) }),
    )
    expect(await screen.findByText(/You will get class and assignment alerts/)).toBeTruthy()
  })

  it('unticking consent switches alerts off but keeps the number', async () => {
    mockUser({ phone: '+919876543210', whatsapp_opt_in: true })
    const request = vi.spyOn(api, 'apiRequest').mockResolvedValue({} as never)
    render(<WhatsAppSettings />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/users/me', { method: 'PATCH', body: JSON.stringify({ phone: '+919876543210', whatsapp_opt_in: false }) }),
    )
    expect(await screen.findByText('Saved. WhatsApp alerts are off.')).toBeTruthy()
  })
})
