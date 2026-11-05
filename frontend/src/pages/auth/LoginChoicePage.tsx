import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GraduationCap, BookOpen, Building2, ArrowRight, ShieldCheck, Download } from 'lucide-react'
import { Logo } from '../../components/ui/Logo'
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher'
import { platformAdapter } from '../../services/platformAdapter'
import { AppDownloadModal } from '../../components/common/AppDownloadModal'

/**
 * Landing portal selection before role-specific login forms.
 * Surfaces the 3 accessible application portals:
 * 1. Student Portal (/login/student) -> Student Dashboard
 * 2. Teacher Portal (/login/teacher) -> Teacher Console
 * 3. College Admin Portal (/login/college-admin) -> College Admin Dashboard
 *
 * Super-Admin (Platform Console) is restricted to secure web management portals
 * and is not accessible or reflected from installed applications.
 */
export const LoginChoicePage: React.FC = () => {
  const { t } = useTranslation()
  const isNative = platformAdapter.isNative()
  const [isDownloadOpen, setIsDownloadOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#F8FAF7] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <div className="flex flex-col items-center text-center mb-8">
          <Logo size={48} className="mb-3" />
          <h1 className="text-2xl font-bold tracking-tight text-[#202B2A]">LanternEd</h1>
          <p className="text-xs sm:text-sm text-[#687775] mt-1 max-w-xs leading-relaxed">{t('auth.tagline')}</p>
        </div>

        <p className="text-center text-sm font-semibold text-[#202B2A] mb-4">{t('auth.howSigningIn')}</p>

        <div className="flex flex-col gap-3">
          {/* 1. Student Portal */}
          <Link
            to="/login/student"
            className="group bg-[#FFFFFF] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-5 flex items-center gap-4 shadow-xs transition-colors"
          >
            <div className="w-11 h-11 shrink-0 rounded-xl bg-[#DDF3EA] text-[#0F5B57] flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <h2 className="text-sm font-bold text-[#202B2A]">{t('auth.studentPortal')}</h2>
              <p className="text-xs text-[#687775]">{t('auth.studentPortalDesc')}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD7D1] group-hover:text-[#0F5B57] transition-colors shrink-0" />
          </Link>

          {/* 2. Teacher Portal */}
          <Link
            to="/login/teacher"
            className="group bg-[#FFFFFF] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-5 flex items-center gap-4 shadow-xs transition-colors"
          >
            <div className="w-11 h-11 shrink-0 rounded-xl bg-[#DDF3EA] text-[#0F5B57] flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <h2 className="text-sm font-bold text-[#202B2A]">{t('auth.teacherPortal')}</h2>
              <p className="text-xs text-[#687775]">{t('auth.teacherPortalDesc')}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD7D1] group-hover:text-[#0F5B57] transition-colors shrink-0" />
          </Link>

          {/* 3. College Admin Portal */}
          <Link
            to="/login/college-admin"
            className="group bg-[#FFFFFF] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-5 flex items-center gap-4 shadow-xs transition-colors"
          >
            <div className="w-11 h-11 shrink-0 rounded-xl bg-[#DDF3EA] text-[#0F5B57] flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#202B2A]">{t('auth.collegeAdminPortal')}</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#DDF3EA] text-[#0F5B57] px-2 py-0.5 rounded-full">
                  Admin
                </span>
              </div>
              <p className="text-xs text-[#687775]">{t('auth.collegeAdminPortalDesc')}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD7D1] group-hover:text-[#0F5B57] transition-colors shrink-0" />
          </Link>
        </div>

        {/* Native App Downloads Banner */}
        <div className="mt-5 p-4 rounded-2xl bg-[#FFFFFF] border border-[#E1E8E4] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#DDF3EA] text-[#0F5B57] flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#202B2A]">LanternEd Native Apps</h3>
              <p className="text-[11px] text-[#687775]">Offline campus study for Windows, Mac, Android & iOS</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDownloadOpen(true)}
            className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-[#0F5B57] hover:bg-[#123B39] text-white text-xs font-semibold transition-colors cursor-pointer text-center shrink-0 shadow-xs"
          >
            Download App
          </button>
        </div>

        {/* Web-Only Platform Management Link (Hidden on native apps) */}
        {!isNative && (
          <div className="mt-8 text-center border-t border-[#E1E8E4] pt-4">
            <Link
              to="/platform-console"
              className="text-xs text-[#84908D] hover:text-[#0F5B57] transition-colors inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Platform Administration (Web Portal)</span>
            </Link>
          </div>
        )}

        <AppDownloadModal isOpen={isDownloadOpen} onClose={() => setIsDownloadOpen(false)} />
      </div>
    </div>
  )
}
