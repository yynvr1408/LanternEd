import React, { useState } from 'react'
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldCheck,
  Sparkles,
  Cpu,
} from 'lucide-react'
import { platformAdapter } from '../../services/platformAdapter'
import { releaseService, type UpdateCheckResult } from '../../services/releaseService'

interface AppUpdateModalProps {
  isOpen: boolean
  onClose: () => void
}

const AUTO_UPDATE_KEY = 'lanterned_auto_update_check'

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({ isOpen, onClose }) => {
  const currentVersion = releaseService.getCurrentVersion()
  const os = platformAdapter.getOperatingSystem()
  const uxProfile = platformAdapter.getPlatformUxProfile(os)
  const isNative = platformAdapter.isNative()
  const targetPlat = (['windows', 'macos', 'android', 'ios'].includes(os) ? os : 'windows') as
    | 'windows'
    | 'macos'
    | 'android'
    | 'ios'

  const [isChecking, setIsChecking] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [autoCheck, setAutoCheck] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_UPDATE_KEY) !== 'false'
    } catch {
      return true
    }
  })

  if (!isOpen) return null

  const handleCheckUpdates = async () => {
    setIsChecking(true)
    setCheckError(null)
    try {
      const res = await releaseService.checkForUpdates(currentVersion, os)
      setUpdateResult(res)
    } catch (err: any) {
      setCheckError(err.message || 'Failed to check for updates. Check network connectivity.')
    } finally {
      setIsChecking(false)
    }
  }

  const handleToggleAutoCheck = (enabled: boolean) => {
    setAutoCheck(enabled)
    try {
      localStorage.setItem(AUTO_UPDATE_KEY, String(enabled))
    } catch {
      // storage quota
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E1E8E4] flex items-center justify-between bg-[#F8FAF7]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F5B57] text-white flex items-center justify-center shadow-xs">
              <RefreshCw className={`w-5 h-5 ${isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#202B2A]">LanternEd Application Updates</h2>
              <p className="text-xs text-[#687775]">Release channels and client update management</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#84908D] hover:text-[#202B2A] rounded-lg hover:bg-[#E1E8E4]/60 cursor-pointer"
            aria-label="Close update modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Version & Environment Card */}
          <div className="p-4 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#202B2A]">Current App Version:</span>
                <span className="font-mono font-bold text-[#0F5B57] bg-[#DDF3EA] px-2 py-0.5 rounded">
                  v{currentVersion}
                </span>
              </div>
              <p className="text-[#687775]">
                Target App: <strong className="text-[#202B2A]">{uxProfile.label}</strong> (
                {isNative ? 'Native Client Shell' : 'Progressive Web App'})
              </p>
            </div>
            <button
              type="button"
              onClick={handleCheckUpdates}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F5B57] hover:bg-[#123B39] text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking...' : 'Check Now'}</span>
            </button>
          </div>

          {/* Results Display */}
          {checkError && (
            <div className="p-3 bg-[#FDE8E7] border border-[#B42318]/30 rounded-xl text-[#B42318] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{checkError}</span>
            </div>
          )}

          {updateResult && !updateResult.has_update && (
            <div className="p-4 bg-[#E5F5EB] border border-[#247A4D]/30 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#247A4D] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-[#247A4D]">You're Up to Date!</h4>
                <p className="text-[#687775] leading-relaxed">
                  LanternEd v{currentVersion} is the latest available release for {os}. All security patches and
                  features are active.
                </p>
              </div>
            </div>
          )}

          {updateResult && updateResult.has_update && (
            <div className="p-4 bg-[#FFF0CB] border border-[#8A5700]/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#8A5700]" />
                  <h4 className="font-bold text-sm text-[#8A5700]">
                    New Update Available: v{updateResult.latest_version}
                  </h4>
                </div>
                {updateResult.is_critical && (
                  <span className="text-[10px] font-bold uppercase bg-[#B42318] text-white px-2 py-0.5 rounded">
                    Critical
                  </span>
                )}
              </div>

              {updateResult.release_notes && (
                <div className="p-3 bg-white/80 rounded-lg border border-[#8A5700]/20 text-[#202B2A] leading-relaxed">
                  <p className="font-semibold text-[11px] text-[#8A5700] mb-1">Release Notes:</p>
                  <p>{updateResult.release_notes}</p>
                </div>
              )}

              <p className="text-[11px] text-[#687775] leading-relaxed">
                {uxProfile.updateChannelNote}
              </p>

              {updateResult.sha256 && (
                <p className="text-[10px] font-mono text-[#687775] break-all">
                  SHA-256: {updateResult.sha256}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[#687775]">
                  Size: {updateResult.file_size_mb ? `${updateResult.file_size_mb} MB` : 'Latest installer package'}
                </span>
                <a
                  href={releaseService.resolveDownloadUrl(
                    updateResult.download_url,
                    targetPlat,
                    updateResult.latest_version
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F5B57] hover:bg-[#123B39] text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download & Install Update</span>
                </a>
              </div>
            </div>
          )}

          {/* Preferences */}
          <div className="pt-2 border-t border-[#E1E8E4] space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCheck}
                onChange={(e) => handleToggleAutoCheck(e.target.checked)}
                className="rounded border-[#CBD7D1] text-[#0F5B57] focus:ring-[#0F5B57]"
              />
              <span className="text-[#202B2A] font-medium">Check for updates automatically on application startup</span>
            </label>
            <p className="text-[11px] text-[#687775] pl-5 leading-normal">
              Ensures high-priority offline sync stability and campus LAN network compatibility.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E1E8E4] bg-[#F8FAF7] flex items-center justify-between text-xs text-[#687775]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#247A4D]" />
            Official LanternEd Signed Binary Channel
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-[#CBD7D1] rounded-lg text-[#202B2A] hover:bg-[#FFFFFF] font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
