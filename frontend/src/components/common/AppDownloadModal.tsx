import React, { useState } from 'react'
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
} from 'lucide-react'
import { platformAdapter, type OperatingSystem } from '../../services/platformAdapter'
import { releaseService, type PlatformReleaseDetails } from '../../services/releaseService'

interface AppDownloadModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AppDownloadModal: React.FC<AppDownloadModalProps> = ({ isOpen, onClose }) => {
  const currentOs = platformAdapter.getOperatingSystem()
  const defaultTab = currentOs === 'macos' ? 'macos' : currentOs === 'android' ? 'android' : currentOs === 'ios' ? 'ios' : 'windows'
  const [selectedPlatform, setSelectedPlatform] = useState<'windows' | 'macos' | 'android' | 'ios'>(defaultTab)

  if (!isOpen) return null

  const platforms: Record<
    'windows' | 'macos' | 'android' | 'ios',
    {
      title: string
      icon: React.ComponentType<{ className?: string }>
      badge: string
      fileName: string
      sizeMb: number
      minOs: string
      arch: string
      features: string[]
    }
  > = {
    windows: {
      title: 'Windows Desktop',
      icon: Monitor,
      badge: 'Installer (.exe / .msi)',
      fileName: 'LanternEd-Setup-0.1.1.exe',
      sizeMb: 14.8,
      minOs: 'Windows 10 / 11 (64-bit)',
      arch: 'x64 (DirectML Hardware Accelerated)',
      features: [
        'Local Whisper speech-to-text with DirectML / GPU acceleration',
        'Campus LAN server mode for zero-internet Wi-Fi classroom streaming',
        'Full offline sync of recordings, summaries, and coursework bundles',
        'Extremely lightweight (<50 MB RAM, native WebView2 runtime)',
      ],
    },
    macos: {
      title: 'macOS Desktop',
      icon: Apple,
      badge: 'Universal DMG (.dmg / .app)',
      fileName: 'LanternEd-0.1.1-universal.dmg',
      sizeMb: 16.2,
      minOs: 'macOS 10.15+ (Catalina through Sequoia)',
      arch: 'Universal Binary (Apple Silicon M1/M2/M3 & Intel)',
      features: [
        'Native Apple Silicon & Metal hardware acceleration',
        'Campus LAN zero-internet classroom streaming on school Wi-Fi',
        'Background offline sync of course resources and lecture recordings',
        'Secure App Sandbox with camera and microphone entitlements',
      ],
    },
    android: {
      title: 'Android Mobile',
      icon: Smartphone,
      badge: 'Package (.apk)',
      fileName: 'LanternEd-v0.1.1.apk',
      sizeMb: 18.5,
      minOs: 'Android 8.0+ (Oreo through Android 15)',
      arch: 'Universal ARM (arm64-v8a, armeabi-v7a)',
      features: [
        'Cellular data saving with automatic audio-only stream fallback',
        'Offline video and interactive lesson playback with zero buffering',
        'Local Wi-Fi peer discovery for connected classroom sessions',
        'Low battery drain with Android background sync integration',
      ],
    },
    ios: {
      title: 'iOS Mobile',
      icon: Smartphone,
      badge: 'Package (.ipa)',
      fileName: 'LanternEd-v0.1.1.ipa',
      sizeMb: 22.1,
      minOs: 'iOS 14.0+ (iPhone & iPad)',
      arch: '64-bit ARM (arm64)',
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#E1E8E4] flex items-center justify-between bg-[#F8FAF7]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DDF3EA] text-[#0F5B57] flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#202B2A]">
                Download LanternEd Native Applications
              </h2>
              <p className="text-xs text-[#687775]">
                Cross-platform client applications for Windows, Mac, Android & iOS
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
        <div className="flex border-b border-[#E1E8E4] bg-[#F1F5F2] text-xs font-semibold overflow-x-auto">
          {(['windows', 'macos', 'android', 'ios'] as const).map((p) => {
            const PIcon = platforms[p].icon
            const isSelected = selectedPlatform === p
            const isUserOs = currentOs === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPlatform(p)}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'border-[#0F5B57] text-[#0F5B57] bg-[#FFFFFF]'
                    : 'border-transparent text-[#687775] hover:text-[#0F5B57]'
                }`}
              >
                <PIcon className="w-4 h-4" />
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

        {/* Platform Details Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F8FAF7] border border-[#E1E8E4]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#0F5B57] text-white flex items-center justify-center shadow-xs">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-[#202B2A]">{active.title}</h3>
                  <span className="text-[10px] font-semibold bg-[#CBD7D1]/50 text-[#202B2A] px-2 py-0.5 rounded">
                    {active.badge}
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5">
                  Package: <strong className="font-mono text-[#202B2A]">{active.fileName}</strong> ({active.sizeMb} MB)
                </p>
              </div>
            </div>

            <a
              href={releaseService.getDownloadUrl(selectedPlatform)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F5B57] hover:bg-[#123B39] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download {active.badge.split(' ')[0]}</span>
            </a>
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

          {/* Key Capabilities */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#687775] mb-2.5">
              Native App Capabilities & Advantages
            </h4>
            <div className="space-y-2">
              {active.features.map((feat, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-[#202B2A]">
                  <CheckCircle2 className="w-4 h-4 text-[#247A4D] shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#E1E8E4] bg-[#F8FAF7] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#687775]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#247A4D]" />
            Official LanternEd release channel with verified SHA-256 integrity checksums.
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
