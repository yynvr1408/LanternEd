import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, Copy, Check, Globe } from 'lucide-react'
import { LoadingState } from '../../components/ui'
import { adminApi, AdminApiError } from '../../services/adminApi'
import { platformAdapter } from '../../services/platformAdapter'
import { AdminLoginPage } from './AdminLoginPage'
import { AdminDashboardPage } from './AdminDashboardPage'

type State = { status: 'checking' } | { status: 'out' } | { status: 'in'; username: string }

/**
 * /super-admin: Platform Super-Administrator Console.
 * Manages global colleges, activation/suspension, billing quotas, and system telemetry.
 *
 * Strictly restricted to secure web portals — blocked and completely inaccessible
 * from native desktop (Windows/macOS) and mobile (Android/iOS) client applications.
 */
export const AdminApp: React.FC = () => {
  const [state, setState] = useState<State>({ status: 'checking' })
  const [copied, setCopied] = useState(false)
  const isNative = platformAdapter.isNative()

  useEffect(() => {
    if (isNative) return
    document.title = 'LanternEd Administration'
    let cancelled = false
    adminApi.me().then(
      (a) => {
        if (!cancelled) setState({ status: 'in', username: a.username })
      },
      () => {
        // 401 or an unreachable server: either way the sign-in form is the right place to be.
        if (!cancelled) setState({ status: 'out' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [isNative])

  const webConsoleUrl = window.location.origin.startsWith('http') && !window.location.origin.includes('localhost')
    ? `${window.location.origin}/super-admin`
    : 'https://lanterned.vercel.app/super-admin'

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(webConsoleUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Security barrier: block native client applications from accessing super-admin console
  if (isNative) {
    return (
      <div className="min-h-screen bg-[#121A19] flex flex-col items-center justify-center p-6 text-center text-[#FFFFFF]">
        <div className="w-16 h-16 rounded-full bg-[#B42318]/20 flex items-center justify-center mb-4 text-[#F97066] border border-[#B42318]/40 shadow-lg">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight mb-2">Platform Administration Restricted</h1>
        <p className="text-sm text-[#84908D] max-w-lg leading-relaxed mb-6">
          The Super-Admin platform management console is strictly restricted to authorized web portals and cannot be accessed from installed desktop or mobile client applications.
        </p>

        <div className="w-full max-w-md bg-[#1C2624] border border-[#2D3B38] rounded-xl p-4 mb-6 flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-[#2DD4BF] shrink-0" />
            <span className="text-xs text-[#E6E8E6] font-mono truncate">{webConsoleUrl}</span>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2D3B38] hover:bg-[#3E4F4B] text-[#FFFFFF] transition-colors shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#2DD4BF]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F5B57] hover:bg-[#123B39] text-[#FFFFFF] text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Application Portals</span>
          </Link>
        </div>
      </div>
    )
  }

  if (state.status === 'checking') {
    return (
      <div className="min-h-screen bg-[#F8FAF7] flex items-center justify-center">
        <LoadingState message="Checking session..." />
      </div>
    )
  }
  if (state.status === 'out') return <AdminLoginPage onSignedIn={(username) => setState({ status: 'in', username })} />
  return (
    <AdminDashboardPage
      username={state.username}
      onSignedOut={() => setState({ status: 'out' })}
      onSessionExpired={() => setState({ status: 'out' })}
    />
  )
}

export { AdminApiError }
