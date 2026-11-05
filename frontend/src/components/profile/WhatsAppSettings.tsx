import React, { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { apiRequest } from '../../services/apiClient'
import { useAuth } from '../../context/AuthContext'

const E164 = /^\+[1-9][0-9]{7,14}$/

/** Opt-in WhatsApp alerts. Nothing is sent unless the person adds a number AND ticks the consent box;
 * unticking it (or clearing the number) stops messages straight away. */
export const WhatsAppSettings: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [optIn, setOptIn] = useState(Boolean(user?.whatsapp_opt_in))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const trimmed = phone.trim()
  const invalid = trimmed !== '' && !E164.test(trimmed)
  const needsNumber = optIn && trimmed === ''

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await apiRequest('/users/me', { method: 'PATCH', body: JSON.stringify({ phone: trimmed, whatsapp_opt_in: optIn && trimmed !== '' }) })
      await refreshUser()
      setMessage({ kind: 'ok', text: optIn && trimmed ? 'Saved. You will get class and assignment alerts on WhatsApp.' : 'Saved. WhatsApp alerts are off.' })
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-bold text-[#202B2A] flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#0F5B57]" /> WhatsApp alerts
        </h3>
        <p className="text-xs text-[#687775]">Get a message when a class goes live, a new assignment is posted, or your work is graded.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-xs font-semibold text-[#202B2A]" htmlFor="wa-phone">
          WhatsApp number (with country code, for example +919876543210)
        </label>
        <input
          id="wa-phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-[#CBD7D1] px-3 py-2 text-sm"
          placeholder="+91..."
        />
        {invalid && <p role="alert" className="text-xs text-[#B42318]">Use the international format: a plus sign, the country code, then the number.</p>}
        <label className="flex items-start gap-2 text-xs text-[#202B2A]">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5" />
          <span>
            I agree to receive LanternEd updates (live class alerts, new assignments, grades) on WhatsApp at this number. I can switch this off here at any time.
          </span>
        </label>
        {needsNumber && <p className="text-xs text-[#8A5700]">Add your number to turn alerts on.</p>}
        <Button size="sm" isLoading={busy} disabled={invalid || needsNumber} onClick={save}>
          Save
        </Button>
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${message.kind === 'error' ? 'text-[#B42318]' : 'text-[#247A4D]'}`}>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
