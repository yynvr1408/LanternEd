import React, { useEffect, useRef, useState } from 'react'
import { Building2, Check, Download, RefreshCw, FileUp, KeyRound, Layers, Mail, Pencil, PauseCircle, PlayCircle, ShieldAlert, UserMinus, Users, X, Sparkles, Sliders, CheckSquare, Square, ChevronDown, ChevronRight, ShieldCheck, AlertTriangle } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { Card, CardContent, Badge, Button, Dialog, FormField, Input, LoadingState, ErrorState, EmptyState } from '../../components/ui'
import { CollegeStructureDialog } from '../admin/CollegeStructureDialog'
import {
  institutionAdminApi,
  type CollegeDeletionRequest,
  type PendingUser,
  type RosterEntry,
  type RosterImportResult,
  type AiScreenedApplicant,
  type CollegeSettings,
} from '../../services/institutionAdminApi'
import type { BillingSummary, College } from '../../services/adminApi'
import { platformAdapter } from '../../services/platformAdapter'
import { AppDownloadModal } from '../../components/common/AppDownloadModal'
import { AppUpdateModal } from '../../components/common/AppUpdateModal'

/** "Rural Science College" -> "RSC"; a single-word name falls back to its first few letters
 * ("Harvard" -> "HARV") rather than a single, meaningless initial. */
const shortForm = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return words.map((w) => w[0]!.toUpperCase()).join('').slice(0, 6)
  return (words[0] || '').slice(0, 4).toUpperCase()
}

/** The two-step confirmation a college administrator must complete before a super admin's
 * deletion request actually takes effect: their own password, then an OTP emailed to the
 * college's registered contact address. Nothing is deleted until both succeed. */
const DeletionConfirmPanel: React.FC<{ college: College; request: CollegeDeletionRequest; onResolved: () => void }> = ({
  college,
  request,
  onResolved,
}) => {
  const [otpSent, setOtpSent] = useState(false)
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendOtp = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await institutionAdminApi.requestDeletionOtp(college.id, request.id, password)
      setOtpSent(true)
      setDevOtp(res.dev_otp ?? null)
    } catch (err: any) {
      setError(err.message || 'Could not verify your password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirm = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      await institutionAdminApi.confirmDeletion(college.id, request.id, otp)
      onResolved()
    } catch (err: any) {
      setError(err.message || 'That code is incorrect or has expired.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const decline = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      await institutionAdminApi.declineDeletion(college.id, request.id)
      onResolved()
    } catch (err: any) {
      setError(err.message || 'Could not decline the request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="border border-[#B42318]/30 bg-[#FDE8E7] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[#B42318] font-bold text-sm">
        <ShieldAlert className="w-4 h-4" /> Deletion Requested
      </div>
      <p className="text-xs text-[#B42318] leading-relaxed">
        A platform administrator has requested that <strong>{college.name}</strong> be permanently deleted — its
        branches, sections and registration code will be removed (students' and teachers' accounts are kept, just
        detached from this institution). As this institution's administrator, confirming requires your own password
        plus a code emailed to the institution's registered contact address.
      </p>
      {error && <p className="text-xs text-[#B42318] font-semibold">{error}</p>}

      {!otpSent ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField label="Your password" htmlFor={`del-pw-${request.id}`} className="flex-1">
            <Input
              id={`del-pw-${request.id}`}
              type="password"
              isPassword
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" isLoading={isSubmitting} disabled={!password} onClick={sendOtp} icon={<Mail className="w-3.5 h-3.5" />}>
              Send Code
            </Button>
            <Button size="sm" variant="outline" disabled={isSubmitting} onClick={decline} icon={<X className="w-3.5 h-3.5" />}>
              Decline
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {devOtp && (
            <p className="text-xs text-[#8A5700] bg-[#FFF0CB] p-2 rounded-lg border border-[#8A5700]/30">
              Development mode: email is not configured. Your code is <strong className="font-mono">{devOtp}</strong>.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField label="Confirmation code" htmlFor={`del-otp-${request.id}`} className="flex-1">
              <Input
                id={`del-otp-${request.id}`}
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </FormField>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                isLoading={isSubmitting}
                disabled={otp.length !== 6}
                onClick={confirm}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Confirm Deletion
              </Button>
              <Button size="sm" variant="outline" disabled={isSubmitting} onClick={decline} icon={<X className="w-3.5 h-3.5" />}>
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Everyone already admitted to this college (active or suspended), with account-management
 * actions. A college admin can never act on themselves or on a peer administrator of the same
 * college through here (enforced server-side too — see college_service.suspend_member). */
const MembersRosterSection: React.FC<{ collegeId: string; refreshKey: number }> = ({ collegeId, refreshKey }) => {
  const [members, setMembers] = useState<PendingUser[] | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<PendingUser | null>(null)

  const load = async () => {
    setError(null)
    try {
      setMembers(await institutionAdminApi.listMembers(collegeId))
    } catch (err: any) {
      setError(err.message || 'Could not load the student/teacher roster.')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId, refreshKey])

  const toggleSuspend = async (m: PendingUser) => {
    setActingOn(m.id)
    setError(null)
    try {
      if (m.status === 'suspended') await institutionAdminApi.reactivateMember(collegeId, m.id)
      else await institutionAdminApi.suspendMember(collegeId, m.id)
      await load()
    } catch (err: any) {
      setError(err.message || 'Could not update this account.')
    } finally {
      setActingOn(null)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setActingOn(removing.id)
    setError(null)
    try {
      await institutionAdminApi.removeMember(collegeId, removing.id)
      setRemoving(null)
      await load()
    } catch (err: any) {
      setError(err.message || 'Could not remove this person from the institution.')
    } finally {
      setActingOn(null)
    }
  }

  return (
    <div className="border-t border-[#E1E8E4] pt-4 flex flex-col gap-2">
      <p className="text-xs font-bold text-[#687775] uppercase tracking-wider flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Students & Teachers {members ? `(${members.length})` : ''}
      </p>
      {error && <p className="text-xs text-[#B42318]">{error}</p>}
      {members === null ? (
        <p className="text-xs text-[#687775]">Loading roster...</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-[#687775] italic">No one has been admitted to this institution yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#F8FAF7] border border-[#E1E8E4] rounded-lg">
              <div>
                <p className="text-sm font-semibold text-[#202B2A]">{m.full_name}</p>
                <p className="text-xs text-[#687775] flex items-center gap-1.5 flex-wrap">
                  {m.email}
                  <Badge variant="secondary" size="sm">{m.role}</Badge>
                  <Badge variant={m.status === 'active' ? 'success' : 'warning'} size="sm">{m.status}</Badge>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={actingOn === m.id}
                  onClick={() => toggleSuspend(m)}
                  icon={m.status === 'suspended' ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                >
                  {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actingOn === m.id}
                  onClick={() => setRemoving(m)}
                  icon={<UserMinus className="w-3.5 h-3.5" />}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog isOpen={!!removing} onClose={() => setRemoving(null)} title="Remove from institution?" description={removing?.full_name}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#687775]">
            {removing?.full_name} will be detached from this institution — their branch/section assignment is cleared. Their account, and
            everything else tied to it (courses, submissions, recordings), is kept; they simply won't belong to this institution anymore.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" isLoading={actingOn === removing?.id} onClick={confirmRemove}>
              Remove
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

let razorpayScript: Promise<void> | null = null
/** Loads Razorpay Checkout only when a college actually pays, so it is never fetched on an ordinary page view. */
const loadRazorpay = (): Promise<void> => {
  if ((window as any).Razorpay) return Promise.resolve()
  razorpayScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => {
      razorpayScript = null
      reject(new Error('Could not load the payment window. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return razorpayScript
}

/** What this college pays, who is using it, and a way to pay online. The college is extended only when the payment
 * provider confirms to our server, never because this page says so. */
const BillingSection: React.FC<{ college: College }> = ({ college }) => {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [months, setMonths] = useState(12)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const data = await institutionAdminApi.billing(college.id)
      setSummary(data)
      return data
    } catch {
      return null
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [college.id])

  const confirmPayment = async (paymentsBefore: number) => {
    setNotice('Payment received. Confirming with the payment provider...')
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const data = await load()
      if (data && data.payments.length > paymentsBefore) {
        setNotice('Payment confirmed. Thank you.')
        return
      }
    }
    setNotice('Your payment is being confirmed. It will appear here shortly; you do not need to pay again.')
  }

  const payOnline = async () => {
    if (!summary) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const order = await institutionAdminApi.startOnlinePayment(college.id, months)
      await loadRazorpay()
      const before = summary.payments.length
      const Razorpay = (window as any).Razorpay
      new Razorpay({
        key: order.key_id,
        amount: order.amount_paise,
        currency: order.currency,
        order_id: order.order_id,
        name: 'LanternEd',
        description: `${college.name}: ${months} months`,
        handler: () => void confirmPayment(before),
        modal: { ondismiss: () => setBusy(false) },
      }).open()
    } catch (err: any) {
      setError(err.message || 'Could not start the payment.')
      setBusy(false)
    }
  }

  if (!summary || !summary.subscription) return null
  const sub = summary.subscription
  const due = Math.round((sub.seats * sub.price_per_seat_paise * months) / 12)

  return (
    <div className="border-t border-[#E1E8E4] pt-4 flex flex-col gap-2">
      <p className="text-xs font-bold text-[#687775] uppercase tracking-wider">Plan and billing</p>
      <p className="text-sm text-[#202B2A]">
        <span className="font-semibold capitalize">{sub.plan}</span> · {summary.active_students} of {sub.seats} seats in use
        {summary.over_seats > 0 ? ` (${summary.over_seats} over: contact us to add seats)` : ''} · status <span className="font-semibold">{summary.state}</span>
        {sub.current_period_end ? ` · paid until ${sub.current_period_end.slice(0, 10)}` : ''}
      </p>
      {summary.payments.length > 0 && (
        <ul className="text-xs text-[#687775] list-disc pl-5">
          {summary.payments.slice(0, 5).map((p) => (
            <li key={p.id}>
              {rupees(p.amount_paise)} on {p.created_at.slice(0, 10)} ({p.method.replace('_', ' ')}), covers until {p.period_end_after.slice(0, 10)}
            </li>
          ))}
        </ul>
      )}
      {summary.online_payments_enabled && sub.status !== 'canceled' && due >= 100 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[#202B2A]">
            Pay for{' '}
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded border border-[#CBD7D1] px-2 py-1 text-xs">
              {[3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" isLoading={busy} onClick={payOnline}>
            Pay {rupees(due)} online
          </Button>
        </div>
      )}
      {notice && <p role="status" className="text-xs text-[#247A4D]">{notice}</p>}
      {error && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}
    </div>
  )
}

const ROSTER_TEMPLATE = 'email,full_name,role,branch,section\nasha@example.com,Asha Rao,student,Computer Science,Section A\nravi@example.com,Ravi Kumar,teacher,Computer Science,all\n'

/** Pre-approve a whole class list at once. Nobody gets an account or password from this: each person still registers
 * with their own email code and the college code, and a listed email simply skips the approval queue. */
const RosterImportSection: React.FC<{ collegeId: string }> = ({ collegeId }) => {
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<'check' | 'import' | null>(null)
  const [result, setResult] = useState<RosterImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<{ items: RosterEntry[]; total: number } | null>(null)

  const loadEntries = async () => {
    try {
      setEntries(await institutionAdminApi.listRoster(collegeId))
    } catch {
      setEntries(null)
    }
  }

  useEffect(() => {
    void loadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId])

  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(dryRun ? 'check' : 'import')
    setError(null)
    try {
      setResult(await institutionAdminApi.importRoster(collegeId, file, dryRun))
      if (!dryRun) {
        setFile(null)
        if (fileInput.current) fileInput.current.value = ''
        await loadEntries()
      }
    } catch (err: any) {
      setResult(null)
      setError(err.message || 'Could not read that file.')
    } finally {
      setBusy(null)
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([ROSTER_TEMPLATE], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'roster-template.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="border-t border-[#E1E8E4] pt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#687775] uppercase tracking-wider">
          Class list {entries ? `(${entries.total} pre-approved)` : ''}
        </p>
        <Button size="sm" variant="outline" onClick={downloadTemplate} icon={<Download className="w-3.5 h-3.5" />}>
          CSV template
        </Button>
      </div>
      <p className="text-xs text-[#687775]">
        Upload a CSV of your students and teachers. They still register themselves with the college code and an emailed code, but anyone on this list is
        approved automatically instead of waiting in the queue above.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="Class list CSV file"
          className="text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null)
            setError(null)
          }}
        />
        <Button size="sm" variant="outline" disabled={!file || busy !== null} isLoading={busy === 'check'} onClick={() => run(true)}>
          Check file
        </Button>
        <Button size="sm" disabled={!file || busy !== null} isLoading={busy === 'import'} onClick={() => run(false)} icon={<FileUp className="w-3.5 h-3.5" />}>
          Import
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}
      {result && (
        <div role="status" className="text-sm p-3 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
          <p className="font-semibold text-[#202B2A]">
            {result.dry_run ? 'Check only, nothing saved: ' : 'Imported: '}
            {result.created} new, {result.updated} updated, {result.errors.length} with problems (of {result.total_rows} rows).
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-[#B42318] list-disc pl-5 max-h-40 overflow-auto">
              {result.errors.slice(0, 50).map((e) => (
                <li key={`${e.row}-${e.email}`}>
                  Row {e.row}{e.email ? ` (${e.email})` : ''}: {e.error}
                </li>
              ))}
              {result.errors.length > 50 && <li>…and {result.errors.length - 50} more.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const PendingRegistrationsSection: React.FC<{ collegeId: string; onChange: () => void }> = ({ collegeId, onChange }) => {
  const [pending, setPending] = useState<PendingUser[] | null>(null)
  const [aiScreening, setAiScreening] = useState<Record<string, AiScreenedApplicant>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [isBulkActing, setIsBulkActing] = useState(false)
  const [isAiScreening, setIsAiScreening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  const load = async () => {
    try {
      const list = await institutionAdminApi.listPendingRegistrations(collegeId)
      setPending(list)
      if (list.length > 0) {
        void runAiScreening()
      }
    } catch (err: any) {
      setError(err.message || 'Could not load pending registrations.')
    }
  }

  const runAiScreening = async () => {
    setIsAiScreening(true)
    try {
      const screening = await institutionAdminApi.aiScreenRegistrations(collegeId)
      const map: Record<string, AiScreenedApplicant> = {}
      screening.forEach((s) => {
        map[s.user_id] = s
      })
      setAiScreening(map)
    } catch {
      // Non-fatal, admin can still review manually
    } finally {
      setIsAiScreening(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (!pending) return
    if (selectedIds.size === pending.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pending.map((p) => p.id)))
    }
  }

  const selectVerifiedOnly = () => {
    if (!pending) return
    const verified = pending
      .filter((p) => aiScreening[p.id]?.ai_recommendation === 'approve')
      .map((p) => p.id)
    setSelectedIds(new Set(verified))
  }

  const actSingle = async (userId: string, action: 'approve' | 'reject') => {
    setActingOn(userId)
    setError(null)
    setSuccessNotice(null)
    try {
      if (action === 'approve') await institutionAdminApi.approveRegistration(collegeId, userId)
      else await institutionAdminApi.rejectRegistration(collegeId, userId)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      await load()
      onChange()
    } catch (err: any) {
      setError(err.message || 'Could not update this registration.')
    } finally {
      setActingOn(null)
    }
  }

  const actBulk = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return
    setIsBulkActing(true)
    setError(null)
    setSuccessNotice(null)
    try {
      const ids = Array.from(selectedIds)
      if (action === 'approve') {
        const res = await institutionAdminApi.bulkApproveRegistrations(collegeId, ids)
        setSuccessNotice(res.message)
      } else {
        const reason = window.prompt('Optional reason for rejecting selected applications:') || undefined
        const res = await institutionAdminApi.bulkRejectRegistrations(collegeId, ids, reason)
        setSuccessNotice(res.message)
      }
      setSelectedIds(new Set())
      await load()
      onChange()
    } catch (err: any) {
      setError(err.message || 'Could not complete bulk operation.')
    } finally {
      setIsBulkActing(false)
    }
  }

  const handleAiAutoApprove = async () => {
    setIsBulkActing(true)
    setError(null)
    setSuccessNotice(null)
    try {
      const res = await institutionAdminApi.aiAutoApproveRegistrations(collegeId)
      setSuccessNotice(res.message)
      setSelectedIds(new Set())
      await load()
      onChange()
    } catch (err: any) {
      setError(err.message || 'AI Auto-Approval encountered an error.')
    } finally {
      setIsBulkActing(false)
    }
  }

  if (pending === null) return null
  if (pending.length === 0) return null

  const verifiedCount = pending.filter((p) => aiScreening[p.id]?.ai_recommendation === 'approve').length

  return (
    <div className="border-t border-[#E1E8E4] pt-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-[#687775] uppercase tracking-wider">
              Pending Registrations ({pending.length})
            </p>
            {isAiScreening && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#0F5B57] bg-[#DDF3EA] px-2 py-0.5 rounded-full font-medium">
                <Sparkles className="w-3 h-3 animate-spin" /> AI Screening Active...
              </span>
            )}
          </div>
          <p className="text-xs text-[#687775] mt-0.5">
            Verified applications are screened for institutional validity and fraud prevention.
          </p>
        </div>

        {verifiedCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAiAutoApprove}
            disabled={isBulkActing}
            isLoading={isBulkActing}
            className="text-xs h-8 border-[#0F5B57] text-[#0F5B57] hover:bg-[#DDF3EA]"
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Auto-Approve {verifiedCount} Verified with AI
          </Button>
        )}
      </div>

      {successNotice && (
        <div className="p-2.5 bg-[#E5F5EB] border border-[#CBD7D1] rounded-lg text-xs text-[#247A4D] font-medium flex items-center justify-between">
          <span>{successNotice}</span>
          <button type="button" onClick={() => setSuccessNotice(null)} className="p-1 text-[#247A4D] hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[#B42318]">{error}</p>}

      {/* Bulk Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#F1F5F2] border border-[#CBD7D1] rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="inline-flex items-center gap-1.5 font-medium text-[#202B2A] hover:text-[#0F5B57] cursor-pointer"
          >
            {selectedIds.size > 0 && selectedIds.size === pending.length ? (
              <CheckSquare className="w-4 h-4 text-[#0F5B57]" />
            ) : (
              <Square className="w-4 h-4 text-[#687775]" />
            )}
            <span>Select All ({selectedIds.size}/{pending.length})</span>
          </button>

          {verifiedCount > 0 && (
            <button
              type="button"
              onClick={selectVerifiedOnly}
              className="text-[#0F5B57] hover:underline font-semibold ml-2 cursor-pointer"
            >
              Select Verified Only ({verifiedCount})
            </button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              isLoading={isBulkActing}
              onClick={() => actBulk('approve')}
              className="text-xs h-7 px-2.5"
              icon={<Check className="w-3 h-3" />}
            >
              Approve ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkActing}
              onClick={() => actBulk('reject')}
              className="text-xs h-7 px-2.5 text-[#B42318] hover:bg-[#FDE8E7]"
              icon={<X className="w-3 h-3" />}
            >
              Reject ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* Applicants List */}
      <div className="flex flex-col gap-2">
        {pending.map((u) => {
          const ai = aiScreening[u.id]
          const isSelected = selectedIds.has(u.id)
          const isExpanded = expandedId === u.id

          return (
            <div
              key={u.id}
              className={`flex flex-col gap-2 p-3 bg-[#FFFFFF] border rounded-xl transition-all ${
                isSelected ? 'border-[#0F5B57] bg-[#F8FAF7]' : 'border-[#E1E8E4]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleSelect(u.id)}
                    className="cursor-pointer text-[#0F5B57] p-0.5"
                    aria-label={isSelected ? 'Deselect applicant' : 'Select applicant'}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#0F5B57]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#CBD7D1] hover:text-[#687775]" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#202B2A] truncate">{u.full_name}</p>
                      <Badge variant="secondary" size="sm">{u.role}</Badge>

                      {ai && (
                        ai.ai_recommendation === 'approve' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#247A4D] bg-[#E5F5EB] px-2 py-0.5 rounded-full border border-[#CBD7D1]">
                            <Sparkles className="w-3 h-3 text-[#247A4D]" /> Verified ({ai.ai_score}%)
                          </span>
                        ) : ai.ai_risk_level === 'high' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B42318] bg-[#FDE8E7] px-2 py-0.5 rounded-full border border-[#B42318]/30">
                            <ShieldAlert className="w-3 h-3" /> Flagged High Risk ({ai.ai_score}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8A5700] bg-[#FFF0CB] px-2 py-0.5 rounded-full border border-[#CBD7D1]">
                            <AlertTriangle className="w-3 h-3" /> Needs Review ({ai.ai_score}%)
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs text-[#687775] truncate mt-0.5">
                      {u.email}
                      {ai?.branch_name && ` · ${ai.branch_name}`}
                      {ai?.section_name && ` (${ai.section_name})`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {ai?.ai_reasons && ai.ai_reasons.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : u.id)}
                      className="text-xs text-[#687775] hover:text-[#202B2A] flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
                    >
                      <span>AI Insights</span>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={actingOn === u.id}
                    onClick={() => actSingle(u.id, 'approve')}
                    className="h-7 text-xs px-2.5"
                    icon={<Check className="w-3.5 h-3.5" />}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actingOn === u.id}
                    onClick={() => actSingle(u.id, 'reject')}
                    className="h-7 text-xs px-2.5 text-[#B42318] hover:bg-[#FDE8E7]"
                    icon={<X className="w-3.5 h-3.5" />}
                  >
                    Reject
                  </Button>
                </div>
              </div>

              {/* Expandable AI Reasoning breakdown */}
              {isExpanded && ai?.ai_reasons && (
                <div className="mt-2 pt-2 border-t border-[#E1E8E4] bg-[#F8FAF7] p-2.5 rounded-lg text-xs space-y-1">
                  <p className="font-semibold text-[#202B2A] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#0F5B57]" /> Automated Screening Assessment:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[#687775] pl-1">
                    {ai.ai_reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const InstitutionSettingsSection: React.FC<{ collegeId: string }> = ({ collegeId }) => {
  const [settings, setSettings] = useState<CollegeSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [allowedDomainsText, setAllowedDomainsText] = useState('')

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await institutionAdminApi.getCollegeSettings(collegeId)
      setSettings(data)
      setAllowedDomainsText((data.allowed_email_domains || []).join(', '))
    } catch (err: any) {
      setError(err.message || 'Could not load institution settings.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId])

  const handleSave = async () => {
    if (!settings) return
    setIsSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const domains = allowedDomainsText
        .split(',')
        .map((d) => d.trim().replace(/^@/, ''))
        .filter(Boolean)
      const updated = await institutionAdminApi.updateCollegeSettings(collegeId, {
        institution_type: settings.institution_type,
        approval_mode: settings.approval_mode,
        allowed_email_domains: domains,
        features: settings.features,
      })
      setSettings(updated)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Could not save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleFeature = (key: keyof CollegeSettings['features']) => {
    if (!settings) return
    setSettings({
      ...settings,
      features: {
        ...settings.features,
        [key]: !settings.features[key],
      },
    })
  }

  if (isLoading || !settings) {
    return <div className="text-xs text-[#687775] py-2">Loading institution settings...</div>
  }

  return (
    <div className="border-t border-[#E1E8E4] pt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#0F5B57]" />
          <p className="text-xs font-bold text-[#687775] uppercase tracking-wider">
            Institution Configuration & Feature Controls
          </p>
        </div>
        {saveSuccess && (
          <span className="text-xs font-semibold text-[#247A4D] bg-[#E5F5EB] px-2 py-0.5 rounded border border-[#CBD7D1]">
            ✓ Settings Saved
          </span>
        )}
      </div>

      {error && <p className="text-xs text-[#B42318]">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl text-xs">
        {/* Institution Type */}
        <div className="space-y-1">
          <label className="font-semibold text-[#202B2A] block">Institution Classification</label>
          <select
            value={settings.institution_type}
            onChange={(e) => setSettings({ ...settings, institution_type: e.target.value })}
            className="w-full bg-[#FFFFFF] border border-[#CBD7D1] rounded-lg px-3 py-1.5 text-xs text-[#202B2A] focus:outline-none focus:ring-1 focus:ring-[#0F5B57]"
          >
            <option value="engineering">Engineering / Technology College</option>
            <option value="polytechnic">Polytechnic / Vocational Institute</option>
            <option value="school">High School / Rural Academy</option>
            <option value="coaching">Independent Coaching Institute</option>
            <option value="general">General University / Higher Ed</option>
          </select>
          <p className="text-[11px] text-[#687775]">Adapts classroom nomenclature and default cohort structures.</p>
        </div>

        {/* Approval Policy */}
        <div className="space-y-1">
          <label className="font-semibold text-[#202B2A] block">Member Onboarding Policy</label>
          <select
            value={settings.approval_mode}
            onChange={(e) => setSettings({ ...settings, approval_mode: e.target.value as any })}
            className="w-full bg-[#FFFFFF] border border-[#CBD7D1] rounded-lg px-3 py-1.5 text-xs text-[#202B2A] focus:outline-none focus:ring-1 focus:ring-[#0F5B57]"
          >
            <option value="manual_admin">Strict Review (Admin approves every applicant)</option>
            <option value="ai_auto_approve">AI Assisted (Auto-admit verified low-risk, review others)</option>
            <option value="instant_code">Open Enrollment (Instant admission with valid College Code)</option>
          </select>
          <p className="text-[11px] text-[#687775]">Controls how new students and teachers are verified.</p>
        </div>

        {/* Email Whitelist */}
        <div className="md:col-span-2 space-y-1">
          <label className="font-semibold text-[#202B2A] block">Authorized Email Domain Whitelist</label>
          <Input
            value={allowedDomainsText}
            onChange={(e) => setAllowedDomainsText(e.target.value)}
            placeholder="e.g. kmit.in, ruralcollege.edu.in (leave empty to permit all verified emails)"
            className="text-xs h-8"
          />
          <p className="text-[11px] text-[#687775]">Comma-separated domain suffixes. Applicants with matching domains receive top AI confidence scores.</p>
        </div>

        {/* Feature Toggles Grid */}
        <div className="md:col-span-2 space-y-2 pt-2 border-t border-[#E1E8E4]">
          <label className="font-semibold text-[#202B2A] block">Enabled Platform Modules</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              { key: 'whiteboard_enabled' as const, label: 'Interactive Whiteboard' },
              { key: 'ai_summaries_enabled' as const, label: 'AI Lecture Summaries' },
              { key: 'offline_bundles_enabled' as const, label: 'Single-Stream .ZIP Bundles' },
              { key: 'low_bandwidth_default' as const, label: 'Audio-Only Default on 2G/3G' },
              { key: 'whatsapp_alerts_enabled' as const, label: 'WhatsApp Class Reminders' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 p-2 bg-[#FFFFFF] border border-[#CBD7D1] rounded-lg cursor-pointer hover:bg-[#F1F5F2]">
                <input
                  type="checkbox"
                  checked={Boolean(settings.features?.[key])}
                  onChange={() => toggleFeature(key)}
                  className="rounded text-[#0F5B57] focus:ring-[#0F5B57] h-3.5 w-3.5 cursor-pointer"
                />
                <span className="text-xs text-[#202B2A] font-medium">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="md:col-span-2 flex justify-end pt-2">
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            className="text-xs h-8 px-4"
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  )
}

export const TeacherInstitutionAdminPage: React.FC = () => {
  const [colleges, setColleges] = useState<College[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<College | null>(null)
  const [editLocation, setEditLocation] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editContactPhone, setEditContactPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [isDownloadOpen, setIsDownloadOpen] = useState(false)
  const [isUpdateOpen, setIsUpdateOpen] = useState(false)
  const isNative = platformAdapter.isNative()
  const [notice, setNotice] = useState<string | null>(null)
  const [structureCollege, setStructureCollege] = useState<College | null>(null)
  const [deletionRequests, setDeletionRequests] = useState<Record<string, CollegeDeletionRequest | null>>({})
  const [refreshTick, setRefreshTick] = useState(0)

  const load = async () => {
    setError(null)
    try {
      const list = await institutionAdminApi.myColleges()
      setColleges(list)
      const entries = await Promise.all(
        list.map(async (c) => [c.id, await institutionAdminApi.getDeletionRequest(c.id).catch(() => null)] as const)
      )
      setDeletionRequests(Object.fromEntries(entries))
    } catch (err: any) {
      setError(err.message || 'Could not load your institutions.')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  const startEdit = (college: College) => {
    setEditing(college)
    setEditLocation(college.location ?? '')
    setEditContactEmail(college.contact_email ?? '')
    setEditContactPhone(college.contact_phone ?? '')
    setSaveError(null)
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    setSaveError(null)
    try {
      await institutionAdminApi.updateCollege(editing.id, {
        location: editLocation.trim() || null,
        contact_email: editContactEmail.trim() || null,
        contact_phone: editContactPhone.trim() || null,
      })
      setEditing(null)
      setNotice('Institution details updated.')
      await load()
    } catch (err: any) {
      setSaveError(err.message || 'Could not save these changes.')
    } finally {
      setSaving(false)
    }
  }

  const regenerateCode = async (college: College) => {
    if (!window.confirm(`Generate a new registration code for ${college.name}? The old code (${college.code}) stops working immediately.`)) {
      return
    }
    setRegeneratingId(college.id)
    setError(null)
    try {
      await institutionAdminApi.regenerateCode(college.id)
      setNotice('A new registration code was generated.')
      await load()
    } catch (err: any) {
      setError(err.message || 'Could not regenerate the code.')
    } finally {
      setRegeneratingId(null)
    }
  }

  const pageTitle = colleges && colleges.length === 1 ? `${shortForm(colleges[0].name)} Console` : 'Institution Administration'
  const pageSubtitle =
    colleges && colleges.length === 1
      ? `${colleges[0].name} — manage its branches, sections, registration code and student/teacher roster.`
      : "Manage the branches, sections and registration code for the institution(s) you've been delegated to administer."

  return (
    <PageContainer title={pageTitle} subtitle={pageSubtitle} maxWidth="lg">
      {notice && (
        <div className="mb-4 p-3 rounded-lg bg-[#E5F5EB] border border-[#247A4D]/30 text-[#247A4D] text-xs" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorState message={error} onRetry={load} className="mb-4" />}

      {colleges === null ? (
        <LoadingState message="Loading your institutions..." />
      ) : colleges.length === 0 ? (
        <EmptyState
          icon={<Building2 className="w-6 h-6" />}
          title="You're not an administrator of any institution"
          description="A platform administrator can delegate management of a college's branches, sections and registration code to a teacher. If you were expecting access here, ask them to grant it."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {colleges.map((college) => (
            <Card key={college.id}>
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-[#0F5B57] bg-[#DDF3EA] border border-[#CBD7D1] rounded px-1.5 py-0.5">
                        {shortForm(college.name)}
                      </span>
                      <h3 className="text-base font-bold text-[#202B2A]">{college.name}</h3>
                      <Badge variant={college.status === 'active' ? 'success' : 'secondary'} size="sm">
                        {college.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#687775]">{college.location || 'No location set'}</p>
                    <p className="text-xs font-mono text-[#0F5B57] mt-1">{college.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={isNative ? <RefreshCw className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                      onClick={() => (isNative ? setIsUpdateOpen(true) : setIsDownloadOpen(true))}
                    >
                      {isNative ? 'App Updates (v0.1.0)' : 'Download Client App'}
                    </Button>
                    <Button size="sm" variant="outline" icon={<Pencil className="w-4 h-4" />} onClick={() => startEdit(college)}>
                      Edit Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<KeyRound className="w-4 h-4" />}
                      isLoading={regeneratingId === college.id}
                      onClick={() => regenerateCode(college)}
                    >
                      Regenerate Code
                    </Button>
                    <Button size="sm" icon={<Layers className="w-4 h-4" />} onClick={() => setStructureCollege(college)}>
                      Branches &amp; Sections
                    </Button>
                  </div>
                </div>

                {editing?.id === college.id && (
                  <div className="border-t border-[#E1E8E4] pt-4 flex flex-col gap-3">
                    {saveError && <p className="text-xs text-[#B42318]">{saveError}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FormField label="Location" htmlFor={`loc-${college.id}`}>
                        <Input id={`loc-${college.id}`} value={editLocation} onChange={(e) => setEditLocation(e.target.value)} maxLength={160} />
                      </FormField>
                      <FormField label="Contact email" htmlFor={`email-${college.id}`}>
                        <Input id={`email-${college.id}`} type="email" value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value)} />
                      </FormField>
                      <FormField label="Contact phone" htmlFor={`phone-${college.id}`}>
                        <Input id={`phone-${college.id}`} value={editContactPhone} onChange={(e) => setEditContactPhone(e.target.value)} maxLength={40} />
                      </FormField>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" isLoading={saving} onClick={saveEdit}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {deletionRequests[college.id] && (
                  <DeletionConfirmPanel
                    college={college}
                    request={deletionRequests[college.id]!}
                    onResolved={() => setRefreshTick((t) => t + 1)}
                  />
                )}

                <PendingRegistrationsSection collegeId={college.id} onChange={() => setRefreshTick((t) => t + 1)} />

                <InstitutionSettingsSection collegeId={college.id} />

                <RosterImportSection collegeId={college.id} />

                <BillingSection college={college} />

                <MembersRosterSection collegeId={college.id} refreshKey={refreshTick} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CollegeStructureDialog
        college={structureCollege}
        onClose={() => setStructureCollege(null)}
        onSessionExpired={() => setStructureCollege(null)}
        api={institutionAdminApi}
      />
      <AppDownloadModal isOpen={isDownloadOpen} onClose={() => setIsDownloadOpen(false)} />
      <AppUpdateModal isOpen={isUpdateOpen} onClose={() => setIsUpdateOpen(false)} />
    </PageContainer>
  )
}
