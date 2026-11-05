import React, { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { apiRequest } from '../../services/apiClient'
import { downloadFile } from '../../services/reportsApi'
import { db } from '../../db/db'

/** Self-service data rights: download everything held about you, or erase the account. */
export const PrivacyControls: React.FC<{ onErased?: () => void }> = ({ onErased }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmWord, setConfirmWord] = useState('')

  const exportData = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadFile('/users/me/export', 'my-lanterned-data.json')
    } catch (err: any) {
      setError(err.message || 'Could not download your data.')
    } finally {
      setBusy(false)
    }
  }

  const erase = async () => {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/users/me/erase', { method: 'POST', body: JSON.stringify({ password, confirm: confirmWord }) })
      await db.clearPrivateUserData({ includeDownloads: true }).catch(() => {})
      localStorage.clear()
      sessionStorage.clear()
      onErased?.()
      window.location.href = '/login'
    } catch (err: any) {
      setError(err.message || 'Could not erase the account.')
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-bold text-[#202B2A]">Your data</h3>
        <p className="text-xs text-[#687775]">Download a copy of what LanternED holds about you, or erase your account.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" isLoading={busy && !confirmOpen} onClick={exportData} icon={<Download className="w-3.5 h-3.5" />}>
            Download my data
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} icon={<Trash2 className="w-3.5 h-3.5 text-[#B42318]" />}>
            Erase my account
          </Button>
        </div>
        {error && !confirmOpen && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}
      </CardContent>

      <Dialog
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="Erase your account?"
        description="This signs you out everywhere and removes your name, email, answers and files. Marks stay as anonymous numbers in your college's records. It cannot be undone."
        maxWidth="sm"
      >
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-semibold text-[#202B2A]">
            Your password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-[#CBD7D1] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-[#202B2A]">
            Type DELETE to confirm
            <input
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#CBD7D1] px-3 py-2 text-sm"
            />
          </label>
          {error && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={busy} disabled={!password || confirmWord !== 'DELETE'} onClick={erase}>
              Erase permanently
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}
