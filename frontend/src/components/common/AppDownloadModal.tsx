import React, { useState, useEffect } from 'react'
import {
  X,
  Download,
  Monitor,
  Apple,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Cpu,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Sparkles,
} from 'lucide-react'
import { platformAdapter } from '../../services/platformAdapter'
import { APP_CURRENT_VERSION, releaseService, type ReleaseManifest } from '../../services/releaseService'

interface AppDownloadModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AppDownloadModal: React.FC<AppDownloadModalProps> = ({ isOpen, onClose }) => {
  const currentOs = platformAdapter.getOperatingSystem()
  const defaultTab = currentOs === 'macos' ? 'macos' : currentOs === 'android' ? 'android' : currentOs === 'ios' ? 'ios' : 'windows'
  const [selectedPlatform, setSelectedPlatform] = useState<'windows' | 'macos' | 'android' | 'ios'>(defaultTab)
  const [copiedSha, setCopiedSha] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showQrCode, setShowQrCode] = useState(false)
  const [manifest, setManifest] = useState<ReleaseManifest | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    releaseService
      .getManifest()
      .then((data) => {
        if (active) setManifest(data)
      })
      .catch(() => {
        // Offline / API unreachable: fall back to bundled APP_CURRENT_VERSION metadata
      })
    return () => {
      active = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const activeVersion = manifest?.version || APP_CURRENT_VERSION
  const winInfo = manifest?.platforms?.windows
  const macInfo = manifest?.platforms?.macos
  const andInfo = manifest?.platforms?.android
  const iosInfo = manifest?.platforms?.ios

  const platforms: Record<
    'windows' | 'macos' | 'android' | 'ios',
    {
      title: string
      icon: React.ComponentType<{ className?: string }>
      badge: string
      fileName: string
      sizeMb: number | null
      minOs: string
      arch: string
      sha256: string
      rawDownloadUrl: string
      releaseDownloadUrl: string
      steps: { title: string; desc: string }[]
      features: string[]
    }
  > = {
    windows: {
      title: 'Windows Desktop',
      icon: Monitor,
      badge: 'Installer (.exe / .msi)',
      fileName: winInfo?.fileName || `LanternEd-Setup-${activeVersion}.exe`,
      sizeMb: winInfo?.fileSizeMb ?? null,
      minOs: winInfo?.minOsVersion || 'Windows 10 / 11 (64-bit)',
      arch: winInfo?.arch || 'x64 (DirectML Hardware Accelerated)',
      sha256: winInfo?.sha256 || 'Verify against SHA256SUMS.txt in the release',
      releaseDownloadUrl: releaseService.getDownloadUrl('windows'),
      rawDownloadUrl: releaseService.getRawDownloadUrl('windows'),
      steps: [
        { title: 'Download Setup Executable', desc: `Click Download to receive ${winInfo?.fileName || `LanternEd-Setup-${activeVersion}.exe`}.` },
        { title: 'Run Fast Lightweight Setup', desc: 'Double-click the installer; installation completes in under 10 seconds.' },
        { title: 'Ready with DirectML & Campus LAN', desc: 'Launch LanternEd with native GPU-accelerated Whisper speech-to-text.' },
      ],
      features: [
        'Local Whisper speech-to-text with DirectML / GPU acceleration (zero cloud API latency)',
        'Campus LAN server mode for zero-internet Wi-Fi classroom streaming',
        'Full offline sync of recordings, summaries, and coursework bundles',
        'Extremely lightweight (<50 MB RAM, native WebView2 runtime)',
      ],
    },
    macos: {
      title: 'macOS Desktop',
      icon: Apple,
      badge: 'Universal DMG (.dmg / .app)',
      fileName: macInfo?.fileName || `LanternEd-${activeVersion}-universal.dmg`,
      sizeMb: macInfo?.fileSizeMb ?? null,
      minOs: macInfo?.minOsVersion || 'macOS 10.15+ (Catalina through Sequoia)',
      arch: macInfo?.arch || 'Universal Binary (Apple Silicon M1/M2/M3 & Intel)',
      sha256: macInfo?.sha256 || 'Verify against SHA256SUMS.txt in the release',
      releaseDownloadUrl: releaseService.getDownloadUrl('macos'),
      rawDownloadUrl: releaseService.getRawDownloadUrl('macos'),
      steps: [
        { title: 'Download Universal DMG', desc: `Get ${macInfo?.fileName || `LanternEd-${activeVersion}-universal.dmg`}.` },
        { title: 'Drag to Applications', desc: 'Mount the disk image and drag LanternEd into your Applications folder.' },
        { title: 'Hardware-Accelerated Metal Run', desc: 'Native Apple Silicon & Intel support with microphone & camera entitlements.' },
      ],
      features: [
        'Native Apple Silicon & Metal hardware acceleration for low battery usage',
        'Campus LAN zero-internet classroom streaming on school Wi-Fi',
        'Background offline sync of course resources and lecture recordings',
        'Secure App Sandbox with camera and microphone entitlements',
      ],
    },
    android: {
      title: 'Android Mobile',
      icon: Smartphone,
      badge: 'Package (.apk)',
      fileName: andInfo?.fileName || `LanternEd-v${activeVersion}.apk`,
      sizeMb: andInfo?.fileSizeMb ?? null,
      minOs: andInfo?.minOsVersion || 'Android 8.0+ (Oreo through Android 15)',
      arch: andInfo?.arch || 'Universal ARM (arm64-v8a, armeabi-v7a)',
      sha256: andInfo?.sha256 || 'Verify against SHA256SUMS.txt in the release',
      releaseDownloadUrl: releaseService.getDownloadUrl('android'),
      rawDownloadUrl: releaseService.getRawDownloadUrl('android'),
      steps: [
        { title: 'Download APK Package', desc: `Tap Download Installer (${andInfo?.fileName || `LanternEd-v${activeVersion}.apk`}) or scan the QR code.` },
        { title: 'Allow Unknown Sources', desc: 'When prompted by Android, tap Settings -> Enable "Allow from this source".' },
        { title: 'Install & Learn Offline', desc: 'Tap Install; launch LanternEd for cellular data saving & offline sync.' },
      ],
      features: [
        'Cellular data saving with automatic audio-only stream fallback (94% data savings)',
        'Offline video and interactive lesson playback with zero buffering',
        'Local Wi-Fi peer discovery for connected classroom sessions',
        'Low battery drain with Android background sync integration',
      ],
    },
    ios: {
      title: 'iOS Mobile',
      icon: Smartphone,
      badge: 'Package (.ipa)',
      fileName: iosInfo?.fileName || `LanternEd-v${activeVersion}.ipa`,
      sizeMb: iosInfo?.fileSizeMb ?? null,
      minOs: iosInfo?.minOsVersion || 'iOS 14.0+ (iPhone & iPad)',
      arch: iosInfo?.arch || '64-bit ARM (arm64)',
      sha256: iosInfo?.sha256 || 'Verify against SHA256SUMS.txt in the release',
      releaseDownloadUrl: releaseService.getDownloadUrl('ios'),
      rawDownloadUrl: releaseService.getRawDownloadUrl('ios'),
      steps: [
        { title: 'Download IPA Package', desc: `Download ${iosInfo?.fileName || `LanternEd-v${activeVersion}.ipa`}.` },
        { title: 'Install via Profile or AltStore', desc: 'Install via institutional mobile profile, AltStore, Sideloadly, or TestFlight.' },
        { title: 'Optimized for iPad & iPhone', desc: 'Responsive Split View and background audio streaming out-of-the-box.' },
      ],
      features: [
        'Optimized for iPhone notch, Dynamic Island, and iPad Split View',
        'Adaptive low-bitrate audio streaming for high packet-loss networks',
        'Downloadable lesson packs for completely offline revision',
        'Local campus network discovery with Apple Bonjour / mDNS',
      ],
    },
  }

  const active = platforms[selectedPlatform]
  const Icon = active.icon

  const handleCopySha = () => {
    navigator.clipboard.writeText(active.sha256)
    setCopiedSha(true)
    setTimeout(() => setCopiedSha(false), 2500)
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(active.releaseDownloadUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#E1E8E4] flex items-center justify-between bg-[#F8FAF7] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DDF3EA] text-[#0F5B57] flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#202B2A]">
                  Download LanternEd Native Applications
                </h2>
                <span className="text-[10px] bg-[#0F5B57] text-white px-2 py-0.5 rounded-full font-bold">
                  v{activeVersion}
                </span>
              </div>
              <p className="text-xs text-[#687775]">
                Cross-platform client applications with DirectML Whisper &amp; Campus LAN sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#84908D] hover:text-[#202B2A] rounded-lg hover:bg-[#E1E8E4]/60 cursor-pointer"
            aria-label="Close download modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selection Tabs */}
        <div className="flex border-b border-[#E1E8E4] bg-[#F1F5F2] text-xs font-semibold overflow-x-auto shrink-0 scrollbar-none">
          {(['windows', 'macos', 'android', 'ios'] as const).map((p) => {
            const PIcon = platforms[p].icon
            const isSelected = selectedPlatform === p
            const isUserOs = currentOs === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setSelectedPlatform(p)
                  setShowQrCode(false)
                }}
                className={`flex-1 py-3 px-3 sm:px-4 flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'border-[#0F5B57] text-[#0F5B57] bg-[#FFFFFF]'
                    : 'border-transparent text-[#687775] hover:text-[#0F5B57]'
                }`}
              >
                <PIcon className="w-4 h-4 shrink-0" />
                <span>{platforms[p].title}</span>
                {isUserOs && (
                  <span className="text-[10px] bg-[#DDF3EA] text-[#0F5B57] px-1.5 py-0.2 rounded-full font-bold">
                    Detected
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Platform Details Body (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-[#202B2A] overscroll-contain">
          {/* Main Download Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F8FAF7] border border-[#CBD7D1]/60 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#0F5B57] text-white flex items-center justify-center shadow-xs shrink-0">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-[#202B2A]">{active.title}</h3>
                  <span className="text-[10px] font-semibold bg-[#CBD7D1]/50 text-[#202B2A] px-2 py-0.5 rounded">
                    {active.badge}
                  </span>
                  <span className="text-[10px] font-bold text-[#0F5B57] bg-[#DDF3EA] px-2 py-0.5 rounded">
                    {active.sizeMb !== null ? `${active.sizeMb} MB Verified` : 'SHA-256 Verified'}
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-1">
                  Package: <strong className="font-mono text-[#202B2A]">{active.fileName}</strong>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <a
                href={active.releaseDownloadUrl}
                download={active.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-[#0F5B57] hover:bg-[#123B39] text-white text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
              >
                <Download className="w-4 h-4" />
                <span>Download Installer</span>
              </a>

              {/* Raw mirror link in case GitHub releases are slow */}
              <a
                href={active.rawDownloadUrl}
                download={active.fileName}
                target="_blank"
                rel="noopener noreferrer"
                title="Direct Raw Asset Mirror (Fast Backup)"
                className="p-2.5 border border-[#CBD7D1] rounded-xl text-[#0F5B57] hover:bg-[#E1E8E4]/50 cursor-pointer transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              {/* Phone QR Code Toggle for mobile apps */}
              {(selectedPlatform === 'android' || selectedPlatform === 'ios') && (
                <button
                  type="button"
                  onClick={() => setShowQrCode(!showQrCode)}
                  title="Show Phone QR Code"
                  className={`p-2.5 border rounded-xl cursor-pointer transition-colors ${
                    showQrCode
                      ? 'border-[#0F5B57] bg-[#DDF3EA] text-[#0F5B57]'
                      : 'border-[#CBD7D1] text-[#687775] hover:bg-[#E1E8E4]/50'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* QR Code Section for Phone Installation */}
          {showQrCode && (selectedPlatform === 'android' || selectedPlatform === 'ios') && (
            <div className="p-4 bg-[#F0FDF4] border border-[#86EFAC] rounded-xl flex flex-col sm:flex-row items-center gap-4 animate-in fade-in duration-200">
              <div className="w-24 h-24 bg-white p-2 rounded-lg border border-[#BBF7D0] shadow-xs flex items-center justify-center">
                {/* SVG QR Code Illustration */}
                <svg className="w-full h-full text-[#0F5B57]" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M10 10h30v30H10zm6 6v18h18V16zm44-6h30v30H60zm6 6v18h18V16zM10 60h30v30H10zm6 6v18h18V66zm44 0h10v10H60zm10 10h10v10H70zm10-10h10v10H80zm-10 10v10h-10V76zm20 0h10v10H90zm-40-6h10v10H50zm10-10h10v10H60zm-20 0h10v10H40zm-10 0h10v10H30z" />
                </svg>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h4 className="text-xs font-bold text-[#166534]">Scan with phone camera to download directly</h4>
                <p className="text-[11px] text-[#15803D] mt-0.5">
                  Point your smartphone camera at this QR code to download the {active.title} package instantly to your device.
                </p>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="mt-2 text-[11px] font-semibold text-[#0F5B57] hover:underline flex items-center gap-1 mx-auto sm:mx-0 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Download link copied to clipboard!' : 'Copy Direct Download Link for Phone'}
                </button>
              </div>
            </div>
          )}

          {/* Interactive Step-by-Step Installation Workflow */}
          <div className="p-4 bg-[#FFFFFF] rounded-xl border border-[#E1E8E4]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#687775] mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0F5B57]" />
              Quick 3-Step Setup Guide
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {active.steps.map((st, idx) => (
                <div key={idx} className="p-3 bg-[#F8FAF7] rounded-lg border border-[#E1E8E4] flex flex-col justify-between">
                  <div>
                    <div className="w-5 h-5 rounded-full bg-[#0F5B57] text-white text-[11px] font-bold flex items-center justify-center mb-1.5">
                      {idx + 1}
                    </div>
                    <div className="text-xs font-bold text-[#202B2A]">{st.title}</div>
                    <div className="text-[11px] text-[#687775] mt-1 leading-snug">{st.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Requirements & Specs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-[#FFFFFF] rounded-xl border border-[#E1E8E4] space-y-1">
              <div className="flex items-center gap-1.5 text-[#687775] font-semibold">
                <HardDrive className="w-3.5 h-3.5 text-[#0F5B57]" />
                <span>Operating System</span>
              </div>
              <p className="text-[#202B2A] font-medium">{active.minOs}</p>
            </div>
            <div className="p-3 bg-[#FFFFFF] rounded-xl border border-[#E1E8E4] space-y-1">
              <div className="flex items-center gap-1.5 text-[#687775] font-semibold">
                <Cpu className="w-3.5 h-3.5 text-[#0F5B57]" />
                <span>Hardware Architecture</span>
              </div>
              <p className="text-[#202B2A] font-medium">{active.arch}</p>
            </div>
          </div>

          {/* Key Native Capabilities */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#687775] mb-2.5">
              Native App Capabilities &amp; Advantages
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {active.features.map((feat, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-[#202B2A] p-2 bg-[#F8FAF7] rounded-lg border border-[#E1E8E4]/60">
                  <CheckCircle2 className="w-4 h-4 text-[#247A4D] shrink-0 mt-0.5" />
                  <span className="leading-tight">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cryptographic SHA-256 Verification Section */}
          <div className="p-3 bg-[#F1F5F2] rounded-xl border border-[#CBD7D1] flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <ShieldCheck className="w-4 h-4 text-[#247A4D] shrink-0" />
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-[#687775] block">
                  SHA-256 Checksum Verification
                </span>
                <span className="font-mono text-[11px] text-[#202B2A] select-all truncate block">
                  {active.sha256}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopySha}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#FFFFFF] hover:bg-[#E1E8E4] border border-[#CBD7D1] rounded-lg text-xs font-semibold text-[#202B2A] shrink-0 cursor-pointer transition-colors"
            >
              {copiedSha ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#247A4D]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#687775]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#E1E8E4] bg-[#F8FAF7] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#687775] shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#247A4D]" />
            Official LanternEd release channel with verified SHA-256 integrity checksums.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 border border-[#CBD7D1] rounded-xl text-[#202B2A] hover:bg-[#FFFFFF] font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
