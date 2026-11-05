import React, { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { apiRequest } from '../../services/apiClient'
import { institutionAdminApi } from '../../services/institutionAdminApi'

interface MyRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  rejected_reason: string | null
}

/** A teacher asks to administer their own college (branches, sections, class list, billing). Hidden for teachers who
 * already administer one. The platform administrator decides; the answer arrives as a notification. */
export const AdminRoleRequest: React.FC = () => {
  const [administers, setAdministers] = useState<boolean | null>(null)
  const [request, setRequest] = useState<MyRequest | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([institutionAdminApi.myColleges(), apiRequest<MyRequest | null>('/institution-admin/my-admin-request')])
      .then(([colleges, mine]) => {
        if (!live) return
        setAdministers(colleges.length > 0)
        setRequest(mine)
      })
      .catch(() => live && setAdministers(true)) // offline or not applicable: show nothing rather than a broken card
    return () => {
      live = false
    }
  }, [])

  const ask = async () => {
    setBusy(true)
    setError(null)
    try {
      setRequest(await apiRequest<MyRequest>('/institution-admin/my-admin-request', { method: 'POST', body: JSON.stringify({ message: message.trim() || null }) }))
    } catch (err: any) {
      setError(err.message || 'Could not send the request.')
    } finally {
      setBusy(false)
    }
  }

  if (administers !== false) return null
  const pending = request?.status === 'pending'

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-bold text-[#202B2A] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#0F5B57]" /> Manage your college
        </h3>
        <p className="text-xs text-[#687775]">Administrators set up branches and sections, import the class list and approve sign-ups.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending ? (
          <p role="status" className="text-xs text-[#8A5700]">Your request is waiting for review. You will get a notification when it is decided.</p>
        ) : (
          <>
            {request?.status === 'rejected' && (
              <p className="text-xs text-[#B42318]">Your last request was declined{request.rejected_reason ? `: ${request.rejected_reason}` : '.'}</p>
            )}
            <label className="block text-xs font-semibold text-[#202B2A]" htmlFor="admin-role-message">
              Why you (optional)
            </label>
            <textarea
              id="admin-role-message"
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-[#CBD7D1] px-3 py-2 text-sm"
              rows={2}
              placeholder="For example: I am the head of the department."
            />
            <Button size="sm" isLoading={busy} onClick={ask}>
              Ask to administer my college
            </Button>
          </>
        )}
        {error && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}
      </CardContent>
    </Card>
  )
}
