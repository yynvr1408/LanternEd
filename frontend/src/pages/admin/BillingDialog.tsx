import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  PlusCircle,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge, Button, Dialog, FormField, Input, LoadingState } from '../../components/ui'
import { adminApi, type BillingPayment, type BillingSummary, type College } from '../../services/adminApi'

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

const PLANS = ['pilot', 'standard', 'plus']
const STATUSES = ['trialing', 'active', 'past_due', 'canceled']
const METHODS: [string, string][] = [
  ['bank_transfer', 'Bank Transfer (NEFT/RTGS/IMPS)'],
  ['upi', 'UPI'],
  ['cheque', 'Cheque / DD'],
  ['cash', 'Cash Deposit'],
  ['other', 'Other Direct Settlement'],
]

const selectClass = 'w-full rounded-lg border border-[#CBD7D1] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F5B57]'

export const BillingDialog: React.FC<{ college: College | null; onClose: () => void; onSessionExpired: () => void }> = ({
  college,
  onClose,
  onSessionExpired,
}) => {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'ledger' | 'record' | 'terms'>('ledger')

  // Terms state
  const [plan, setPlan] = useState('standard')
  const [status, setStatus] = useState('trialing')
  const [seats, setSeats] = useState('0')
  const [priceRupees, setPriceRupees] = useState('0')
  const [periodEnd, setPeriodEnd] = useState('')
  const [notes, setNotes] = useState('')

  // Payment form state
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
    setSuccessMsg(null)
    setActiveTab('ledger')
    void load()
  }, [load])

  const saveSubscription = async () => {
    if (!college) return
    setBusy(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await adminApi.setSubscription(college.id, {
        plan,
        status,
        seats: Math.max(0, Math.round(Number(seats) || 0)),
        price_per_seat_paise: Math.max(0, Math.round((Number(priceRupees) || 0) * 100)),
        current_period_end: periodEnd ? `${periodEnd}T00:00:00Z` : null,
        notes: notes.trim() || null,
      })
      setSuccessMsg('Subscription terms successfully updated.')
      await load()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const savePayment = async () => {
    if (!college) return
    if (!Number(amountRupees) || Number(amountRupees) <= 0) {
      setError('Please enter a valid payment amount.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await adminApi.recordPayment(college.id, {
        amount_paise: Math.round((Number(amountRupees) || 0) * 100),
        method,
        reference: reference.trim() || null,
        period_months: Math.round(Number(months) || 0),
      })
      setAmountRupees('')
      setReference('')
      setSuccessMsg('Payment successfully recorded and receipt logged.')
      await load()
      setActiveTab('ledger')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const exportInvoicesCsv = () => {
    if (!summary || !summary.payments.length) return
    const headers = ['Receipt / Invoice ID', 'Date', 'Amount (INR)', 'Payment Method', 'Reference (UTR/Cheque)', 'Coverage (Months)', 'Valid Until', 'Status']
    const rows = summary.payments.map((p, idx) => {
      const isPast = p.period_end_after && new Date(p.period_end_after) < new Date()
      const invNum = `INV-${college?.code || 'COL'}-${String(idx + 1).padStart(4, '0')}`
      return [
        invNum,
        dateOnly(p.created_at),
        (p.amount_paise / 100).toFixed(2),
        p.method.replace('_', ' ').toUpperCase(),
        `"${p.reference || 'N/A'}"`,
        p.period_months,
        dateOnly(p.period_end_after),
        isPast ? 'Expired' : 'Paid',
      ]
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${college?.name.replace(/[^a-zA-Z0-9]/g, '_')}_billing_ledger.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const isExpired = summary?.subscription?.current_period_end ? new Date(summary.subscription.current_period_end) < new Date() : false
  const seatCapacity = summary?.subscription?.seats || 0
  const seatUtilizationPct = seatCapacity > 0 ? Math.min(100, Math.round(((summary?.active_students || 0) / seatCapacity) * 100)) : 0

  return (
    <Dialog
      isOpen={!!college}
      onClose={onClose}
      title={college ? `Billing & Licensing · ${college.name}` : 'Institution Billing'}
      description={college ? `College Code: ${college.code} · ${college.location || 'Campus'}` : undefined}
      maxWidth="xl"
    >
      {!summary ? (
        <LoadingState message="Fetching billing ledger and license parameters..." className="py-12" />
      ) : (
        <div className="space-y-6 text-sm">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Plan Tier & State */}
            <div className="p-3.5 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-[#687775] mb-1">
                <span>Plan & Tier</span>
                <ShieldCheck className="w-4 h-4 text-[#0F5B57]" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-[#202B2A] capitalize">
                  {summary.subscription?.plan ?? 'No Plan'} Tier
                </p>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={
                      summary.state === 'active'
                        ? 'success'
                        : summary.state === 'trialing'
                        ? 'warning'
                        : summary.state === 'past_due'
                        ? 'error'
                        : 'secondary'
                    }
                  >
                    {summary.state ? summary.state.toUpperCase() : 'NO PLAN'}
                  </Badge>
                  {isExpired && <span className="text-[10px] text-[#B42318] font-bold">OVERDUE</span>}
                </div>
              </div>
            </div>

            {/* Card 2: Active Students / Seat Limits */}
            <div className="p-3.5 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-[#687775] mb-1">
                <span>Licensed Licenses</span>
                <Users className="w-4 h-4 text-[#0F5B57]" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <p className="text-base font-bold text-[#202B2A]">
                    {summary.active_students} <span className="text-xs font-normal text-[#687775]">/ {seatCapacity} seats</span>
                  </p>
                  <span className="text-xs font-semibold text-[#0F5B57]">{seatUtilizationPct}%</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-[#E1E8E4] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      summary.over_seats > 0 ? 'bg-[#B42318]' : 'bg-[#0F5B57]'
                    }`}
                    style={{ width: `${seatUtilizationPct}%` }}
                  />
                </div>
                {summary.over_seats > 0 && (
                  <p className="text-[11px] text-[#B42318] font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> +{summary.over_seats} seats over limit!
                  </p>
                )}
              </div>
            </div>

            {/* Card 3: Annual Contract Value */}
            <div className="p-3.5 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-[#687775] mb-1">
                <span>Contract Value</span>
                <TrendingUp className="w-4 h-4 text-[#0F5B57]" />
              </div>
              <div>
                <p className="text-base font-bold text-[#202B2A]">{rupees(summary.annual_value_paise)}</p>
                <p className="text-[11px] text-[#687775] mt-0.5">
                  ₹{((summary.subscription?.price_per_seat_paise ?? 0) / 100).toLocaleString('en-IN')}/seat/year
                </p>
              </div>
            </div>

            {/* Card 4: Renewal & Coverage */}
            <div className="p-3.5 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-[#687775] mb-1">
                <span>Renewal / Validity</span>
                <Calendar className="w-4 h-4 text-[#0F5B57]" />
              </div>
              <div>
                <p className="text-base font-bold text-[#202B2A]">
                  {dateOnly(summary.subscription?.current_period_end ?? null) || 'Not Configured'}
                </p>
                <p className="text-[11px] text-[#687775] mt-0.5">
                  {isExpired ? (
                    <span className="text-[#B42318] font-semibold">Renewal Past Due</span>
                  ) : summary.subscription?.current_period_end ? (
                    'Active coverage'
                  ) : (
                    'Set terms below'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Feedback banners */}
          {error && (
            <div className="p-3 rounded-lg bg-[#FDE8E7] border border-[#B42318]/30 text-[#B42318] text-xs flex items-center gap-2" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg bg-[#E5F5EB] border border-[#247A4D]/30 text-[#247A4D] text-xs flex items-center gap-2" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tabs header */}
          <div className="flex items-center justify-between border-b border-[#E1E8E4] pb-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'ledger'
                    ? 'bg-[#0F5B57] text-white'
                    : 'text-[#687775] hover:text-[#202B2A] hover:bg-[#F0F4F2]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                Invoice & Payment Ledger ({summary.payments.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('record')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'record'
                    ? 'bg-[#0F5B57] text-white'
                    : 'text-[#687775] hover:text-[#202B2A] hover:bg-[#F0F4F2]'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Record Offline Payment
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('terms')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'terms'
                    ? 'bg-[#0F5B57] text-white'
                    : 'text-[#687775] hover:text-[#202B2A] hover:bg-[#F0F4F2]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Subscription & Licenses
              </button>
            </div>

            {activeTab === 'ledger' && summary.payments.length > 0 && (
              <Button size="sm" variant="outline" icon={<Download className="w-3.5 h-3.5" />} onClick={exportInvoicesCsv}>
                Export CSV
              </Button>
            )}
          </div>

          {/* Tab 1: Structured Invoice & Payment History */}
          {activeTab === 'ledger' && (
            <div className="space-y-3">
              {summary.payments.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-[#CBD7D1] bg-[#F8FAF7]">
                  <Receipt className="w-8 h-8 text-[#687775] mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-sm text-[#202B2A]">No payment records found</p>
                  <p className="text-xs text-[#687775] mt-1 max-w-sm mx-auto">
                    No manual or institutional payments have been logged yet. Use the "Record Offline Payment" tab to log bank transfers, cheques, or UPI settlements.
                  </p>
                  <Button size="sm" className="mt-4" onClick={() => setActiveTab('record')}>
                    Record First Payment
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#E1E8E4] rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAF7] border-b border-[#E1E8E4] text-[#687775] font-semibold">
                        <th className="py-2.5 px-3">Receipt / ID</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3">Reference (UTR / Cheque)</th>
                        <th className="py-2.5 px-3">Coverage</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E8E4] bg-white">
                      {summary.payments.map((p, idx) => {
                        const isPast = p.period_end_after && new Date(p.period_end_after) < new Date()
                        return (
                          <tr key={p.id} className="hover:bg-[#F9FBFA] transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-[#202B2A]">
                              INV-{college?.code || 'COL'}-{String(idx + 1).padStart(4, '0')}
                            </td>
                            <td className="py-2.5 px-3 text-[#687775]">{dateOnly(p.created_at)}</td>
                            <td className="py-2.5 px-3">
                              <span className="capitalize px-2 py-0.5 rounded bg-[#F0F4F2] text-[#202B2A] font-medium">
                                {p.method.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#202B2A]">
                              {p.reference || <span className="text-[#A0AEC0] italic">—</span>}
                            </td>
                            <td className="py-2.5 px-3 text-[#202B2A]">
                              {p.period_months} mo.
                              <span className="text-[#687775] block text-[10px]">until {dateOnly(p.period_end_after)}</span>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-[#0F5B57]">{rupees(p.amount_paise)}</td>
                            <td className="py-2.5 px-3 text-right">
                              <Badge variant={isPast ? 'secondary' : 'success'}>
                                {isPast ? 'Expired' : 'Paid'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Record Offline Payment */}
          {activeTab === 'record' && (
            <div className="p-4 rounded-xl border border-[#E1E8E4] bg-[#F8FAF7] space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#202B2A]">Log Offline Payment Receipt</h4>
                <p className="text-xs text-[#687775]">
                  Record institution bank settlements, government grants, UPI transactions, or paper cheques. This immediately advances the college's renewal term.
                </p>
              </div>

              {!summary.subscription && (
                <div className="p-3 rounded-lg bg-[#FEF6EE] border border-[#FDB022] text-[#B54708] text-xs">
                  Please set and save the Subscription Terms first before recording payment receipts.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Amount Received (₹)" htmlFor="bill-amount">
                  <Input
                    id="bill-amount"
                    type="number"
                    min={0}
                    placeholder="e.g. 150000"
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(e.target.value)}
                  />
                </FormField>

                <FormField label="Payment Method" htmlFor="bill-method">
                  <select id="bill-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                    {METHODS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Reference (UTR / Transaction / Cheque #)" htmlFor="bill-reference">
                  <Input
                    id="bill-reference"
                    placeholder="e.g. UTR-982347102934 or CHQ-00129"
                    value={reference}
                    maxLength={120}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </FormField>

                <FormField label="Term Extension (Months)" htmlFor="bill-months">
                  <select id="bill-months" className={selectClass} value={months} onChange={(e) => setMonths(e.target.value)}>
                    <option value="1">1 Month</option>
                    <option value="3">3 Months (Quarter)</option>
                    <option value="6">6 Months (Semester)</option>
                    <option value="12">12 Months (1 Academic Year)</option>
                    <option value="24">24 Months (2 Academic Years)</option>
                    <option value="36">36 Months (3 Academic Years)</option>
                  </select>
                </FormField>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setActiveTab('ledger')}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  isLoading={busy}
                  disabled={!summary.subscription || !Number(amountRupees)}
                  onClick={savePayment}
                  icon={<Receipt className="w-4 h-4" />}
                >
                  Record Payment & Issue Receipt
                </Button>
              </div>
            </div>
          )}

          {/* Tab 3: Subscription & License Terms */}
          {activeTab === 'terms' && (
            <div className="p-4 rounded-xl border border-[#E1E8E4] bg-white space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#202B2A]">Institutional Subscription Terms</h4>
                <p className="text-xs text-[#687775]">
                  Configure licensed student seat capacity, billing plan tier, price per student seat, and expiry dates.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Plan Tier" htmlFor="bill-plan">
                  <select id="bill-plan" className={selectClass} value={plan} onChange={(e) => setPlan(e.target.value)}>
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p.toUpperCase()} Plan
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Subscription Status" htmlFor="bill-status">
                  <select id="bill-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {STATUSES.map((p) => (
                      <option key={p} value={p}>
                        {p.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Licensed Student Seats (Capacity)" htmlFor="bill-seats">
                  <Input id="bill-seats" type="number" min={0} value={seats} onChange={(e) => setSeats(e.target.value)} />
                </FormField>

                <FormField label="Annual Rate per Seat (₹)" htmlFor="bill-price">
                  <Input id="bill-price" type="number" min={0} value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} />
                </FormField>

                <FormField label="Renewal / Paid Until Date" htmlFor="bill-end">
                  <Input id="bill-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </FormField>

                <FormField label="Administrative Contract Notes" htmlFor="bill-notes">
                  <Input
                    id="bill-notes"
                    placeholder="e.g. MOA signed Jan 2026, autonomous tier discount"
                    value={notes}
                    maxLength={500}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </FormField>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setActiveTab('ledger')}>
                  Cancel
                </Button>
                <Button size="sm" isLoading={busy} onClick={saveSubscription}>
                  Save Terms & Recalculate
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
