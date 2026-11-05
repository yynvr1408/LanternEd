import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GraduationCap, BookOpen, Building2, ArrowRight, Download, Sparkles } from 'lucide-react'
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
    <div className="min-h-screen bg-gradient-to-b from-[#F2F7F4] via-[#F8FAF7] to-[#F1F6F3] flex flex-col">
      {/* Top Navigation Header */}
      <header className="w-full border-b border-[#E1E8E4]/80 bg-white/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-[#202B2A] tracking-tight leading-tight">LanternED</span>
            <span className="text-[10px] text-[#687775] font-medium hidden sm:inline leading-tight">
              Offline-First Educational Platform
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-lg">
          {/* Hero Branding */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-3">
              <div className="absolute inset-0 bg-[#0F5B57]/15 rounded-3xl blur-xl scale-125 pointer-events-none" />
              <div className="relative p-3.5 bg-white rounded-2xl shadow-xs border border-[#E1E8E4]">
                <Logo size={48} />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#202B2A]">
              LanternED
            </h1>
            <p className="text-xs sm:text-sm text-[#687775] mt-1.5 max-w-sm leading-relaxed">
              {t('auth.tagline')}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF6F0] text-[#0F5B57] text-[11px] font-semibold border border-[#CDE5DA]">
              <Sparkles className="w-3 h-3 text-[#0F5B57]" />
              <span>Optimized for Low-Bandwidth & Offline Learning</span>
            </div>
          </div>

          {/* Section Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs font-bold uppercase tracking-wider text-[#687775]">
              {t('auth.howSigningIn')}
            </p>
            <Link to="/register" className="text-xs font-semibold text-[#0F5B57] hover:underline">
              Create account →
            </Link>
          </div>

          {/* Portal Selection Cards */}
          <div className="flex flex-col gap-3">
            {/* 1. Student Portal */}
            <Link
              to="/login/student"
              className="group relative bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] group-hover:bg-[#0F5B57] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#202B2A] group-hover:text-[#0F5B57] transition-colors">
                    {t('auth.studentPortal')}
                  </h2>
                  <span className="text-[10px] font-medium text-[#0F5B57] bg-[#EAF6F0] px-2 py-0.5 rounded-full border border-[#CDE5DA]">
                    Learner
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5 truncate sm:whitespace-normal">
                  {t('auth.studentPortalDesc')}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#F5F8F6] group-hover:bg-[#EAF6F0] flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>

            {/* 2. Teacher Portal */}
            <Link
              to="/login/teacher"
              className="group relative bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] group-hover:bg-[#0F5B57] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#202B2A] group-hover:text-[#0F5B57] transition-colors">
                    {t('auth.teacherPortal')}
                  </h2>
                  <span className="text-[10px] font-medium text-[#0F5B57] bg-[#EAF6F0] px-2 py-0.5 rounded-full border border-[#CDE5DA]">
                    Educator
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5 truncate sm:whitespace-normal">
                  {t('auth.teacherPortalDesc')}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#F5F8F6] group-hover:bg-[#EAF6F0] flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>

            {/* 3. College Admin Portal */}
            <Link
              to="/login/college-admin"
              className="group relative bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] group-hover:bg-[#0F5B57] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#202B2A] group-hover:text-[#0F5B57] transition-colors">
                    {t('auth.collegeAdminPortal')}
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0F5B57] text-white px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5 truncate sm:whitespace-normal">
                  {t('auth.collegeAdminPortalDesc')}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#F5F8F6] group-hover:bg-[#EAF6F0] flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </div>

          {/* Native App Downloads Card */}
          <div className="mt-2 bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs transition-all duration-200 text-left">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] flex items-center justify-center shadow-xs">
                <Download className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-[#202B2A] whitespace-nowrap">
                    LanternEd Native Apps
                  </h3>
                  <span className="text-[10px] font-semibold bg-[#EAF6F0] text-[#0F5B57] px-2.5 py-0.5 rounded-full border border-[#CDE5DA] whitespace-nowrap shrink-0">
                    Desktop &amp; Mobile
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5">
                  Offline campus study for Windows, macOS, Android &amp; iOS
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDownloadOpen(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#0F5B57] hover:bg-[#123B39] text-white text-xs font-bold transition-all cursor-pointer text-center shrink-0 shadow-xs hover:shadow-sm whitespace-nowrap"
            >
              Download App
            </button>
          </div>



          <AppDownloadModal isOpen={isDownloadOpen} onClose={() => setIsDownloadOpen(false)} />
        </div>
      </main>
    </div>
  )
}
