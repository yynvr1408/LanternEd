import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BillingDialog } from '../pages/admin/BillingDialog'
import { adminApi, type BillingSummary, type College } from '../services/adminApi'

const college = { id: 'col-1', name: 'Rural College' } as College

const summary = (over: Partial<BillingSummary> = {}): BillingSummary => ({
  college_id: 'col-1',
  subscription: { plan: 'standard', status: 'trialing', seats: 1000, price_per_seat_paise: 35000, current_period_end: null, notes: null },
  active_students: 1100,
  over_seats: 100,
  annual_value_paise: 35_000_000,
  state: 'trialing',
  payments: [],
  ...over,
})

describe('BillingDialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows seat use against seats and the annual value in rupees', async () => {
    vi.spyOn(adminApi, 'billing').mockResolvedValue(summary())
    render(<BillingDialog college={college} onClose={() => {}} onSessionExpired={() => {}} />)
    expect(await screen.findByText('1100 / 1000 (100 over)')).toBeTruthy()
    expect(screen.getByText('₹3,50,000')).toBeTruthy()
  })

  it('records a payment in paise and reloads', async () => {
    const billing = vi.spyOn(adminApi, 'billing').mockResolvedValue(summary())
    const pay = vi.spyOn(adminApi, 'recordPayment').mockResolvedValue({} as never)
    render(<BillingDialog college={college} onClose={() => {}} onSessionExpired={() => {}} />)
    await screen.findByText('Record a payment received')

    fireEvent.change(screen.getByLabelText('Amount (₹)'), { target: { value: '12500.50' } })
    fireEvent.change(screen.getByLabelText('Reference (UTR / cheque no.)'), { target: { value: 'UTR9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(pay).toHaveBeenCalledWith('col-1', { amount_paise: 1250050, method: 'bank_transfer', reference: 'UTR9', period_months: 12 }))
    await waitFor(() => expect(billing).toHaveBeenCalledTimes(2))
  })

  it('cannot record a payment before terms exist', async () => {
    vi.spyOn(adminApi, 'billing').mockResolvedValue(summary({ subscription: null, active_students: 0, over_seats: 0, annual_value_paise: 0, state: null }))
    render(<BillingDialog college={college} onClose={() => {}} onSessionExpired={() => {}} />)
    await screen.findByText('Save the agreed terms first.')
    expect((screen.getByRole('button', { name: 'Record payment' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('hands a 401 to the session-expired handler instead of showing an error', async () => {
    const expired = vi.fn()
    vi.spyOn(adminApi, 'billing').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    render(<BillingDialog college={college} onClose={() => {}} onSessionExpired={expired} />)
    await waitFor(() => expect(expired).toHaveBeenCalled())
  })
})
