import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Building2,
  Check,
  Clock,
  CheckCircle2,
  Copy,
  KeyRound,
  Layers,
  LogOut,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Dialog, EmptyState, ErrorState, FormField, Input, LoadingState, Select } from '../../components/ui'
import { Logo } from '../../components/ui/Logo'
import { CollegeStructureDialog } from './CollegeStructureDialog'
import { BillingDialog } from './BillingDialog'
import {
  adminApi,
  AdminApiError,
  type AdminOverview,
  type UsageReport,
  type Renewal,
  type AdminRoleRequestItem,
  type College,
  type CollegeDeletionRequest,
  type CollegeInput,
  type CollegeRegistrationRequest,
  type CollegeStatus,
} from '../../services/adminApi'

const PAGE_SIZE = 10

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

const CopyCode: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this code:', code)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <code className="font-mono text-sm font-semibold tracking-wider text-[#202B2A] bg-[#F1F5F2] border border-[#E1E8E4] rounded-md px-2 py-1">
        {code}
      </code>
      <button
        type="button"
        onClick={copy}
        className="p-1.5 rounded-md text-[#687775] hover:text-[#0F5B57] hover:bg-[#DDF3EA]"
        aria-label={`Copy code ${code}`}
      >
        {copied ? <CheckCircle2 className="w-4 h-4 text-[#247A4D]" /> : <Copy className="w-4 h-4" />}
      </button>
    </span>
  )
}

const StatCard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-xl p-4">
    <p className="text-xs font-semibold text-[#687775]">{label}</p>
    <p className="text-2xl font-bold text-[#202B2A] mt-1" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      {value}
    </p>
  </div>
)

interface FormState {
  name: string
  location: string
  contact_email: string
  contact_phone: string
  status: CollegeStatus
}
const emptyForm: FormState = { name: '', location: '', contact_email: '', contact_phone: '', status: 'active' }

const CollegeFormDialog: React.FC<{
  college: College | null
  isOpen: boolean
  onClose: () => void
  onSaved: (c: College, created: boolean) => void
}> = ({ college, isOpen, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(
      college
        ? {
            name: college.name,
            location: college.location ?? '',
            contact_email: college.contact_email ?? '',
            contact_phone: college.contact_phone ?? '',
            status: college.status,
          }
        : emptyForm,
    )
    setErrors({})
    setServerError(null)
  }, [isOpen, college])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (form.name.trim().length < 2) next.name = 'Enter the college name (at least 2 characters).'
    if (form.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
      next.contact_email = 'Enter a valid email address.'
    }
    setErrors(next)
    if (Object.keys(next).length) return
    const payload: CollegeInput = {
      name: form.name.trim(),
      location: form.location.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      ...(college ? {} : { status: form.status }),
    }
    setSaving(true)
    setServerError(null)
    try {
      // Reported as saved only after the server confirms it.
      const saved = college ? await adminApi.updateCollege(college.id, payload) : await adminApi.createCollege(payload)
      onSaved(saved, !college)
    } catch (err: any) {
      setServerError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={college ? 'Edit college' : 'Create college'}
      description={college ? undefined : 'A secure college code is generated automatically.'}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {serverError && (
          <div className="p-3 rounded-lg bg-[#FDE8E7] border border-[#B42318]/30 text-[#B42318] text-xs" role="alert">
            {serverError}
          </div>
        )}
        <FormField label="College name" htmlFor="college-name" required error={errors.name}>
          <Input id="college-name" value={form.name} onChange={set('name')} isError={!!errors.name} maxLength={160} />
        </FormField>
        <FormField label="Location" htmlFor="college-location">
          <Input id="college-location" value={form.location} onChange={set('location')} maxLength={160} />
        </FormField>
        <FormField label="Contact email" htmlFor="college-email" error={errors.contact_email}>
          <Input id="college-email" type="email" value={form.contact_email} onChange={set('contact_email')} isError={!!errors.contact_email} />
        </FormField>
        <FormField label="Contact phone" htmlFor="college-phone">
          <Input id="college-phone" type="tel" value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} />
        </FormField>
        {!college && (
          <FormField label="Status" htmlFor="college-status">
            <Select
              id="college-status"
              value={form.status}
              onChange={set('status')}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </FormField>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={saving}>
            {college ? 'Save changes' : 'Create college'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Colleges that registered themselves (POST /registration/colleges/request) and are awaiting
 * approval. Approving creates the real college AND delegates its founding admin in one step. */
const PendingCollegeRequests: React.FC<{ onDecided: () => void; guard: (err: unknown) => boolean }> = ({ onDecided, guard }) => {
  const [requests, setRequests] = useState<CollegeRegistrationRequest[] | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRequests(await adminApi.listCollegeRequests('pending'))
    } catch (err: any) {
      if (!guard(err)) setError(err.message || 'Could not load pending institution requests.')
    }
  }, [guard])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (r: CollegeRegistrationRequest) => {
    setActingOn(r.id)
    setError(null)
    try {
      await adminApi.approveCollegeRequest(r.id)
      await load()
      onDecided()
    } catch (err: any) {
      if (!guard(err)) setError(err.message || 'Could not approve this request.')
    } finally {
      setActingOn(null)
    }
  }

  const reject = async (r: CollegeRegistrationRequest) => {
    setActingOn(r.id)
    setError(null)
    try {
      await adminApi.rejectCollegeRequest(r.id)
      await load()
    } catch (err: any) {
      if (!guard(err)) setError(err.message || 'Could not reject this request.')
    } finally {
      setActingOn(null)
    }
  }

  if (!requests || requests.length === 0) {
    return (
      <section aria-label="Pending institution requests" className="bg-white border border-[#E1E8E4] rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#202B2A]">Institution Onboarding Queue</h2>
            <p className="text-xs text-[#687775] mt-0.5">
              Institutions register via <code className="text-[#0F5B57] font-semibold bg-[#EAF6F0] px-1.5 py-0.5 rounded">/register/college</code>. Incoming requests are reviewed and approved here.
            </p>
          </div>
          <span className="text-[11px] font-semibold bg-[#EAF6F0] text-[#0F5B57] px-2.5 py-1 rounded-full border border-[#CDE5DA] shrink-0 self-start sm:self-auto">
            0 Pending Requests
          </span>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Pending institution requests" className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-[#202B2A]">Pending Institution Requests ({requests.length})</h2>
      {error && <ErrorState message={error} onRetry={load} />}
      <ul className="flex flex-col gap-3">
        {requests.map((r) => (
          <li key={r.id} className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[#202B2A] break-words">{r.college_name}</h3>
              <p className="text-xs text-[#687775] mt-1 break-words">
                {[r.location, r.contact_email, r.contact_phone].filter(Boolean).join(' · ') || 'No contact details'}
              </p>
              <p className="text-xs text-[#687775] mt-1">
                Founding admin: <strong className="text-[#202B2A]">{r.admin_full_name}</strong> ({r.admin_email})
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="primary" isLoading={actingOn === r.id} onClick={() => approve(r)} icon={<Check className="w-4 h-4" />}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={actingOn === r.id} onClick={() => reject(r)} icon={<X className="w-4 h-4" />}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const AdminDashboardPage: React.FC<{ username: string; onSignedOut: () => void; onSessionExpired: () => void }> = ({
  username,
  onSignedOut,
  onSessionExpired,
}) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [renewals, setRenewals] = useState<Renewal[]>([])
  const [billingFor, setBillingFor] = useState<College | null>(null)
  const [roleRequests, setRoleRequests] = useState<AdminRoleRequestItem[]>([])
  const [roleBusy, setRoleBusy] = useState<string | null>(null)
  const [items, setItems] = useState<College[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CollegeStatus | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<College | null>(null)
  const [created, setCreated] = useState<College | null>(null)
  const [confirmRegen, setConfirmRegen] = useState<College | null>(null)
  const [sectionsFor, setSectionsFor] = useState<College | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<College | null>(null)
  const [deletionRequests, setDeletionRequests] = useState<Record<string, CollegeDeletionRequest>>({})
  const requestSeq = useRef(0)

  // Session management: Idle timeout warning & silent background refresh
  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(300)
  const lastActivityRef = useRef<number>(Date.now())

  // Track user activity
  useEffect(() => {
    const handleUserActivity = () => {
      lastActivityRef.current = Date.now()
    }
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }))
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity))
    }
  }, [])

  // Silent sliding-window refresh every 10 minutes if user was active recently
  useEffect(() => {
    const heartbeat = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current
      if (idleMs < 15 * 60 * 1000) {
        adminApi.refresh().catch(() => {})
      }
    }, 10 * 60 * 1000)
    return () => clearInterval(heartbeat)
  }, [])

  // Idle check every 5 seconds: after 25 minutes of inactivity, show warning modal
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current
      const idleSec = Math.floor(idleMs / 1000)
      const IDLE_LIMIT = 25 * 60 // 25 minutes
      const TERMINATE_LIMIT = 30 * 60 // 30 minutes

      if (idleSec >= TERMINATE_LIMIT) {
        setShowIdleWarning(false)
        onSessionExpired()
      } else if (idleSec >= IDLE_LIMIT) {
        setShowIdleWarning(true)
        setIdleSecondsRemaining(TERMINATE_LIMIT - idleSec)
      } else {
        setShowIdleWarning(false)
      }
    }, 5000)
    return () => clearInterval(checkInterval)
  }, [onSessionExpired])

  const staySignedIn = async () => {
    lastActivityRef.current = Date.now()
    setShowIdleWarning(false)
    try {
      await adminApi.refresh()
    } catch {
      onSessionExpired()
    }
  }

  const guard = useCallback(
    (err: unknown) => {
      if (err instanceof AdminApiError && err.status === 401) {
        onSessionExpired()
        return true
      }
      return false
    },
    [onSessionExpired],
  )

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const [ov, page] = await Promise.all([
        adminApi.overview(),
        adminApi.listColleges({ search, status: statusFilter, limit: PAGE_SIZE, offset }),
      ])
      if (seq !== requestSeq.current) return
      setOverview(ov)
      adminApi.usage(30).then((u) => seq === requestSeq.current && setUsage(u)).catch(() => {})
      adminApi.adminRoleRequests().then((r) => seq === requestSeq.current && Array.isArray(r) && setRoleRequests(r)).catch(() => {})
      adminApi.renewals(45).then((r) => seq === requestSeq.current && Array.isArray(r) && setRenewals(r)).catch(() => {})
      setItems(page.items)
      setTotal(page.total)
    } catch (err: any) {
      if (seq !== requestSeq.current || guard(err)) return
      setError(err.message)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [search, statusFilter, offset, guard])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0)
      setSearch(searchInput)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const toggle = async (c: College) => {
    const next: CollegeStatus = c.status === 'active' ? 'inactive' : 'active'
    setBusyId(c.id)
    setNotice(null)
    try {
      await adminApi.setStatus(c.id, next)
      setNotice({ kind: 'success', text: `${c.name} is now ${next}.` })
      await load()
    } catch (err: any) {
      if (!guard(err)) setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  const regenerate = async () => {
    const c = confirmRegen
    if (!c) return
    setConfirmRegen(null)
    setBusyId(c.id)
    setNotice(null)
    try {
      const updated = await adminApi.regenerateCode(c.id)
      setCreated(updated)
      setNotice({ kind: 'success', text: `New code issued for ${c.name}. The previous code no longer works.` })
      await load()
    } catch (err: any) {
      if (!guard(err)) setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  const requestDeletion = async () => {
    const c = confirmDelete
    if (!c) return
    setConfirmDelete(null)
    setBusyId(c.id)
    setNotice(null)
    try {
      const req = await adminApi.requestCollegeDeletion(c.id)
      setDeletionRequests((prev) => ({ ...prev, [c.id]: req }))
      setNotice({
        kind: 'success',
        text: `Deletion of ${c.name} has been requested. It completes only once that institution's own administrator confirms it with their password and an emailed code.`,
      })
    } catch (err: any) {
      if (!guard(err)) setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  const signOut = async () => {
    try {
      await adminApi.logout()
    } catch {
      /* the cookie is cleared server-side when reachable; either way leave */
    }
    onSignedOut()
  }

  const onSaved = async (c: College, wasCreated: boolean) => {
    setFormOpen(false)
    setEditing(null)
    if (wasCreated) setCreated(c)
    setNotice({ kind: 'success', text: wasCreated ? `${c.name} was created.` : `${c.name} was updated.` })
    if (wasCreated) {
      setSearchInput('')
      setSearch('')
      setStatusFilter('')
      setOffset(0)
    }
    await load()
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = !!(search || statusFilter)

  return (
    <div className="min-h-screen bg-[#F8FAF7]">
      <header className="bg-[#FFFFFF] border-b border-[#E1E8E4]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={36} />
            <h1 className="text-base sm:text-lg font-bold text-[#202B2A] truncate">LanternED Administration</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-[#687775]">{username}</span>
            <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" icon={<LogOut className="w-4 h-4" />} onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
        <section aria-label="Overview" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total colleges" value={overview?.total_colleges ?? '–'} />
          <StatCard label="Active colleges" value={overview?.active_colleges ?? '–'} />
          <StatCard label="Inactive colleges" value={overview?.inactive_colleges ?? '–'} />
          <StatCard label="Codes generated" value={overview?.total_codes_generated ?? '–'} />
        </section>

        {roleRequests.length > 0 && (
          <section aria-label="Administrator requests" className="bg-white border border-[#E1E8E4] rounded-xl p-4">
            <h2 className="text-sm font-bold text-[#202B2A] mb-2">Teachers asking to administer their college</h2>
            <ul className="space-y-2 text-xs">
              {roleRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
                  <span>
                    <span className="font-semibold text-[#202B2A]">{r.full_name}</span> ({r.email}) for <span className="font-semibold">{r.college_name}</span>
                    {r.message ? <span className="block text-[#687775]">&ldquo;{r.message}&rdquo;</span> : null}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      isLoading={roleBusy === r.id}
                      onClick={async () => {
                        setRoleBusy(r.id)
                        try {
                          await adminApi.approveAdminRoleRequest(r.id)
                        } catch (err: any) {
                          setNotice({ kind: 'error', text: err.message || 'Could not approve.' })
                        } finally {
                          setRoleBusy(null)
                          void load()
                        }
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={roleBusy === r.id}
                      onClick={async () => {
                        setRoleBusy(r.id)
                        try {
                          await adminApi.rejectAdminRoleRequest(r.id)
                        } catch (err: any) {
                          setNotice({ kind: 'error', text: err.message || 'Could not decline.' })
                        } finally {
                          setRoleBusy(null)
                          void load()
                        }
                      }}
                    >
                      Decline
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {renewals.length > 0 && (
          <section aria-label="Renewals due" className="bg-white border border-[#E1E8E4] rounded-xl p-4">
            <h2 className="text-sm font-bold text-[#202B2A] mb-2">Renewals due (next 45 days)</h2>
            <ul className="space-y-1 text-xs">
              {renewals.map((r) => (
                <li key={r.college_id} className="flex flex-wrap justify-between gap-2 p-2 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4]">
                  <span className="font-semibold text-[#202B2A]">{r.college_name}</span>
                  <span>
                    {r.plan} · {r.seats} seats
                  </span>
                  <span className={r.overdue ? 'text-[#B42318] font-semibold' : ''}>
                    {r.overdue ? 'Overdue since ' : 'Due '}
                    {r.current_period_end.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {usage && Array.isArray(usage.colleges) && usage.colleges.length > 0 && (
          <section aria-label="Usage, last 30 days" className="bg-white border border-[#E1E8E4] rounded-xl p-4 overflow-x-auto">
            <h2 className="text-sm font-bold text-[#202B2A] mb-1">Usage, last {usage.days} days</h2>
            <p className="text-xs text-[#687775] mb-3">
              {usage.totals.classes_held} classes held · {usage.totals.live_participant_minutes.toLocaleString()} live participant-minutes (the main cost driver) ·{' '}
              {usage.totals.submissions} submissions
            </p>
            <table className="w-full text-xs text-left">
              <thead className="text-[#687775]">
                <tr>
                  <th className="py-1 pr-3">College</th>
                  <th className="py-1 pr-3">Members</th>
                  <th className="py-1 pr-3">Classes</th>
                  <th className="py-1 pr-3">Students attending</th>
                  <th className="py-1 pr-3">Live minutes</th>
                  <th className="py-1 pr-3">Submissions</th>
                  <th className="py-1 pr-3">Recordings</th>
                  <th className="py-1">Summaries</th>
                </tr>
              </thead>
              <tbody>
                {usage.colleges.map((c) => (
                  <tr key={c.college_id} className="border-t border-[#E1E8E4]">
                    <td className="py-1.5 pr-3 font-semibold text-[#202B2A]">{c.name}</td>
                    <td className="py-1.5 pr-3">{c.active_members}</td>
                    <td className="py-1.5 pr-3">{c.classes_held}</td>
                    <td className="py-1.5 pr-3">
                      {c.students_attending}
                      {c.attendance_rate_of_members !== null ? ` (${c.attendance_rate_of_members}%)` : ''}
                    </td>
                    <td className="py-1.5 pr-3">{c.live_participant_minutes.toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{c.submissions}</td>
                    <td className="py-1.5 pr-3">{c.recordings}</td>
                    <td className="py-1.5">{c.summaries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-sm flex items-center gap-2 border ${
              notice.kind === 'success'
                ? 'bg-[#E5F5EB] border-[#247A4D]/30 text-[#247A4D]'
                : 'bg-[#FDE8E7] border-[#B42318]/30 text-[#B42318]'
            }`}
          >
            {notice.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        <PendingCollegeRequests onDecided={load} guard={guard} />

        <section aria-label="Colleges" className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#202B2A]">Institutions</h2>
              <p className="text-xs text-[#687775]">
                Verified institutions onboarded through the registration hierarchy.
              </p>
            </div>
            <Button
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Create college
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                aria-label="Search colleges"
                placeholder="Search by name, location or code"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="sm:w-48">
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => {
                  setOffset(0)
                  setStatusFilter(e.target.value as CollegeStatus | '')
                }}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
          </div>

          {loading && items.length === 0 ? (
            <LoadingState message="Loading colleges..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-6 h-6" />}
              title={filtered ? 'No colleges match your search' : 'No colleges yet'}
              description={filtered ? 'Try a different search or filter.' : 'Create the first college to generate its code.'}
              actionLabel={filtered ? undefined : 'Create college'}
              onAction={() => setFormOpen(true)}
            />
          ) : (
            <ul className="flex flex-col gap-3" aria-busy={loading}>
              {items.map((c) => (
                <li
                  key={c.id}
                  className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-4"
                  data-testid="college-row"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-[#202B2A] break-words">{c.name}</h3>
                      <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>
                        {c.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#687775] mt-1 break-words">
                      {[c.location, c.contact_email, c.contact_phone].filter(Boolean).join(' · ') || 'No contact details'} · Created{' '}
                      {formatDate(c.created_at)}
                    </p>
                    {deletionRequests[c.id] && (
                      <p className="text-xs text-[#B42318] font-semibold mt-1">
                        Deletion requested — waiting on this institution's administrator to confirm.
                      </p>
                    )}
                  </div>
                  <CopyCode code={c.code} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pencil className="w-4 h-4" />}
                      onClick={() => {
                        setEditing(c)
                        setFormOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Power className="w-4 h-4" />}
                      isLoading={busyId === c.id}
                      onClick={() => toggle(c)}
                    >
                      {c.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<KeyRound className="w-4 h-4" />}
                      disabled={busyId === c.id}
                      onClick={() => setConfirmRegen(c)}
                    >
                      New code
                    </Button>
                    <Button size="sm" variant="outline" icon={<Layers className="w-4 h-4" />} onClick={() => setSectionsFor(c)}>
                      Branches
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setBillingFor(c)}>
                      Billing
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      icon={<Trash2 className="w-4 h-4" />}
                      disabled={busyId === c.id || !!deletionRequests[c.id]}
                      onClick={() => setConfirmDelete(c)}
                    >
                      {deletionRequests[c.id] ? 'Deletion Requested' : 'Delete College'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3">
              <Button size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <span className="text-xs text-[#687775]">
                Page {page} of {pages} · {total} colleges
              </span>
              <Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" icon={<RefreshCw className="w-4 h-4" />} onClick={load}>
              Refresh
            </Button>
          </div>
        </section>
      </main>

      <CollegeFormDialog
        college={editing}
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={onSaved}
      />

      <CollegeStructureDialog college={sectionsFor} onClose={() => setSectionsFor(null)} onSessionExpired={onSessionExpired} />
      <BillingDialog college={billingFor} onClose={() => { setBillingFor(null); void load() }} onSessionExpired={onSessionExpired} />

      <Dialog isOpen={!!created} onClose={() => setCreated(null)} title="College code" description={created?.name}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#687775]">Share this code with the college. Keep it private; it does not grant any admin access.</p>
          {created && <CopyCode code={created.code} />}
          <div className="flex justify-end">
            <Button onClick={() => setCreated(null)}>Done</Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={!!confirmRegen} onClose={() => setConfirmRegen(null)} title="Generate a new code?" description={confirmRegen?.name}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#687775]">
            The current code will stop working immediately. The college and everything linked to it stay as they are.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRegen(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={regenerate}>
              Generate new code
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Request college deletion?" description={confirmDelete?.name}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#687775]">
            This only <strong>requests</strong> deletion — nothing is removed yet. {confirmDelete?.name} will stay exactly as it is unless that
            institution's own delegated administrator separately confirms with their own password and a code emailed to the institution's
            registered contact address. If this college has no delegated administrator, the request cannot be confirmed until you delegate one.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={requestDeletion}>
              Request Deletion
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        isOpen={showIdleWarning}
        onClose={() => {}}
        title="Session Inactivity Warning"
        description="Your administrative session is about to expire."
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="p-3 bg-[#FEF6EE] border border-[#FDB022] rounded-xl flex items-start gap-3">
            <Clock className="w-5 h-5 text-[#B54708] shrink-0 mt-0.5" />
            <div className="text-xs text-[#B54708] space-y-1">
              <p className="font-semibold text-sm">Session Idle Timeout</p>
              <p>
                You have been inactive for over 25 minutes. For security compliance and protection of institutional records, your session will automatically terminate in:
              </p>
              <p className="text-base font-bold font-mono text-[#7A271A]">
                {Math.floor(idleSecondsRemaining / 60)}:{(idleSecondsRemaining % 60).toString().padStart(2, '0')}
              </p>
            </div>
          </div>
          <p className="text-xs text-[#687775]">
            Click <strong>Stay Signed In</strong> to refresh your session credentials and continue working, or sign out now.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
            <Button size="sm" onClick={staySignedIn}>
              Stay Signed In
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
