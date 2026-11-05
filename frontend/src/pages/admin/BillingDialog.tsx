import React, { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, FormField, Input, LoadingState } from '../../components/ui'
import { adminApi, type BillingSummary, type College } from '../../services/adminApi'

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

const PLANS = ['pilot', 'standard', 'plus']
const STATUSES = ['trialing', 'active', 'past_due', 'canceled']
const METHODS = [
  ['bank_transfer', 'Bank transfer'],
  ['upi', 'UPI'],
  ['cheque', 'Cheque'],
  ['cash', 'Cash'],
  ['other', 'Other'],
]

const selectClass = 'w-full rounded-lg border border-[#CBD7D1] px-3 py-2 text-sm bg-white'

/** Platform admin: what a college has agreed to pay, the seats it uses, and the payments received (recorded by hand
 * after a bank transfer, UPI or cheque). Nothing here locks a college out. */
export const BillingDialog: React.FC<{ college: College | null; onClose: () => void; onSessionExpired: () => void }> = ({
  college,
  onClose,
  onSessionExpired,
}) => {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [plan, setPlan] = useState('standard')
  const [status, setStatus] = useState('trialing')
  const [seats, setSeats] = useState('0')
  const [priceRupees, setPriceRupees] = useState('0')
  const [periodEnd, setPeriodEnd] = useState('')
  const [notes, setNotes] = useState('')

  const [amountRupees, setAmountRupees] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [months, setMonths] = useState('12')

  const fail = useCallback(
    (err: any) => {
      if (err?.status === 401) return onSessionExpired()
      setError(err?.message || 'Something went wrong.')
    },
    [onSessionExpired],
  )

  const load = useCallback(async () => {
    if (!college) return
    try {
      const data = await adminApi.billing(college.id)
      setSummary(data)
      if (data.subscription) {
        setPlan(data.subscription.plan)
        setStatus(data.subscription.status)
        setSeats(String(data.subscription.seats))
        setPriceRupees(String(data.subscription.price_per_seat_paise / 100))
        setPeriodEnd(dateOnly(data.subscription.current_period_end))
        setNotes(data.subscription.notes ?? '')
      }
    } catch (err) {
      fail(err)
    }
  }, [college, fail])

  useEffect(() => {
    setSummary(null)
    setError(null)
    void load()
  }, [load])

  const saveSubscription = async () => {
    if (!college) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.setSubscription(college.id, {
        plan,
        status,
        seats: Math.max(0, Math.round(Number(seats) || 0)),
        price_per_seat_paise: Math.max(0, Math.round((Number(priceRupees) || 0) * 100)),
        current_period_end: periodEnd ? `${periodEnd}T00:00:00Z` : null,
        notes: notes.trim() || null,
      })
      await load()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const savePayment = async () => {
    if (!college) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.recordPayment(college.id, {
        amount_paise: Math.round((Number(amountRupees) || 0) * 100),
        method,
        reference: reference.trim() || null,
        period_months: Math.round(Number(months) || 0),
      })
      setAmountRupees('')
      setReference('')
      await load()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog isOpen={!!college} onClose={onClose} title={college ? `Billing: ${college.name}` : 'Billing'} maxWidth="lg">
      {!summary ? (
        <LoadingState message="Loading billing..." />
      ) : (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
              <p className="text-[#687775]">State</p>
              <p className="font-bold text-[#202B2A]">{summary.state ?? 'no subscription'}</p>
            </div>
            <div className="p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
              <p className="text-[#687775]">Active students / seats</p>
              <p className="font-bold text-[#202B2A]">
                {summary.active_students} / {summary.subscription?.seats ?? 0}
                {summary.over_seats > 0 ? ` (${summary.over_seats} over)` : ''}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
              <p className="text-[#687775]">Annual value</p>
              <p className="font-bold text-[#202B2A]">{rupees(summary.annual_value_paise)}</p>
            </div>
            <div className="p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
              <p className="text-[#687775]">Paid until</p>
              <p className="font-bold text-[#202B2A]">{dateOnly(summary.subscription?.current_period_end ?? null) || '-'}</p>
            </div>
          </div>

          {error && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#687775]">Agreed terms</h3>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Plan" htmlFor="bill-plan">
                <select id="bill-plan" className={selectClass} value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {PLANS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status" htmlFor="bill-status">
                <select id="bill-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Seats (students)" htmlFor="bill-seats">
                <Input id="bill-seats" type="number" min={0} value={seats} onChange={(e) => setSeats(e.target.value)} />
              </FormField>
              <FormField label="Price per student per year (₹)" htmlFor="bill-price">
                <Input id="bill-price" type="number" min={0} value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} />
              </FormField>
              <FormField label="Paid until (optional)" htmlFor="bill-end">
                <Input id="bill-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </FormField>
              <FormField label="Notes" htmlFor="bill-notes">
                <Input id="bill-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            </div>
            <Button size="sm" isLoading={busy} onClick={saveSubscription}>
              Save terms
            </Button>
          </section>

          <section className="space-y-2 border-t border-[#E1E8E4] pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#687775]">Record a payment received</h3>
            {!summary.subscription && <p className="text-xs text-[#687775]">Save the agreed terms first.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <FormField label="Amount (₹)" htmlFor="bill-amount">
                <Input id="bill-amount" type="number" min={0} value={amountRupees} onChange={(e) => setAmountRupees(e.target.value)} />
              </FormField>
              <FormField label="Method" htmlFor="bill-method">
                <select id="bill-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Reference (UTR / cheque no.)" htmlFor="bill-reference">
                <Input id="bill-reference" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
              </FormField>
              <FormField label="Months covered" htmlFor="bill-months">
                <Input id="bill-months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} />
              </FormField>
            </div>
            <Button size="sm" isLoading={busy} disabled={!summary.subscription || !Number(amountRupees)} onClick={savePayment}>
              Record payment
            </Button>
          </section>

          <section className="border-t border-[#E1E8E4] pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#687775] mb-2">Payments</h3>
            {summary.payments.length === 0 ? (
              <p className="text-xs text-[#687775]">None recorded yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {summary.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
                    <span className="font-semibold text-[#202B2A]">{rupees(p.amount_paise)}</span>
                    <span>
                      {p.method.replace('_', ' ')}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <span>
                      {p.period_months} mo, until {dateOnly(p.period_end_after)}
                    </span>
                    <span className="text-[#687775]">{dateOnly(p.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  )
}
