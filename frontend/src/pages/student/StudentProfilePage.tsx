import React, { useState } from 'react'
import { User, Mail, Shield, Wifi, HardDrive, LogOut, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNetworkStatus } from '../../context/NetworkContext'
import { useSync } from '../../context/SyncContext'
import { PageContainer } from '../../components/layout/PageContainer'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { StorageMeter } from '../../components/download/StorageMeter'
import { Download, RefreshCw } from 'lucide-react'
import { platformAdapter } from '../../services/platformAdapter'
import { AppDownloadModal } from '../../components/common/AppDownloadModal'
import { AppUpdateModal } from '../../components/common/AppUpdateModal'
import { PrivacyControls } from '../../components/profile/PrivacyControls'
import { WhatsAppSettings } from '../../components/profile/WhatsAppSettings'

export const StudentProfilePage: React.FC = () => {
  const { user, logout } = useAuth()
  const { isOnline, quality, latencyMs } = useNetworkStatus()
  const { pendingCount } = useSync()

  const [audioOnlyPref, setAudioOnlyPref] = useState(false)
  const [isDownloadOpen, setIsDownloadOpen] = useState(false)
  const [isUpdateOpen, setIsUpdateOpen] = useState(false)
  const isNative = platformAdapter.isNative()

  return (
    <PageContainer
      title="Student Profile & Settings"
      subtitle="Manage your identity, connectivity preferences, and local storage state."
      maxWidth="md"
    >
      <div className="flex flex-col gap-6">
        {/* User Card */}
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#0F5B57] text-[#FFFFFF] flex items-center justify-center font-bold text-lg shrink-0">
              {user?.full_name?.charAt(0) || 'S'}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-[#202B2A]">{user?.full_name}</h2>
                <Badge variant="secondary" size="sm" className="uppercase text-xs">
                  {user?.role}
                </Badge>
              </div>
              <p className="text-xs text-[#687775] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#0F5B57]" /> {user?.email}
              </p>
              <p className="text-xs text-[#84908D] mt-1">
                Registered: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Network & Low-Bandwidth Preferences */}
        <Card>
          <CardHeader className="py-3 px-5 font-bold text-sm text-[#202B2A] flex items-center gap-2">
            <Wifi className="w-4 h-4 text-[#0F5B57]" /> Low-Bandwidth Optimization Settings
          </CardHeader>
          <CardContent className="p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E1E8E4]">
              <div>
                <p className="font-semibold text-[#202B2A]">Always Start Live Classes in Audio-Only Mode</p>
                <p className="text-xs text-[#687775]">
                  Saves ~85% mobile data by muting presenter video streams unless explicitly toggled.
                </p>
              </div>
              <input
                type="checkbox"
                checked={audioOnlyPref}
                onChange={(e) => setAudioOnlyPref(e.target.checked)}
                className="w-4 h-4 rounded border-[#CBD7D1] text-[#0F5B57] focus:ring-[#0F5B57]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#202B2A]">Current Network Diagnostic</p>
                <p className="text-xs text-[#687775]">
                  Status: {isOnline ? `Online (${quality})` : 'Offline'} • Latency: {latencyMs}ms
                </p>
              </div>
              <Badge variant={isOnline ? 'success' : 'default'} size="sm">
                {isOnline ? 'Connected' : 'Offline'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Local Storage Meter */}
        <StorageMeter />

        <WhatsAppSettings />

        <PrivacyControls />

        {/* Application Updates & Native Shell Section */}
        <Card>
          <CardHeader className="py-3 px-5 font-bold text-sm text-[#202B2A] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#0F5B57]" />
              <span>LanternEd Application & Updates</span>
            </div>
            <Badge variant="secondary" size="sm">
              v0.1.0
            </Badge>
          </CardHeader>
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div>
              <p className="font-semibold text-[#202B2A]">
                {isNative ? 'Native Application Installed' : 'Browser Web Application'}
              </p>
              <p className="text-xs text-[#687775] mt-0.5">
                {isNative
                  ? 'Running on hardware-accelerated desktop/mobile shell with offline campus LAN mode.'
                  : 'Install the native app for offline lesson revision and low-bandwidth live classes.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isNative ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => setIsUpdateOpen(true)}
                >
                  Check for Updates
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => setIsDownloadOpen(true)}
                >
                  Download App
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Logout Button */}
        <div className="pt-2">
          <Button
            variant="outline"
            fullWidth
            onClick={() => logout()}
            icon={<LogOut className="w-4 h-4 text-[#687775]" />}
          >
            Sign Out of LanternED
          </Button>
          <p className="text-xs text-[#687775] text-center mt-2">
            Signing out wipes draft tokens and pending queue records from this device for privacy.
          </p>
        </div>
      </div>
      <AppDownloadModal isOpen={isDownloadOpen} onClose={() => setIsDownloadOpen(false)} />
      <AppUpdateModal isOpen={isUpdateOpen} onClose={() => setIsUpdateOpen(false)} />
    </PageContainer>
  )
}
