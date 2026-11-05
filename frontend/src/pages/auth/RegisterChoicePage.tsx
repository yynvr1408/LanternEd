import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GraduationCap, BookOpen, Building2, ArrowRight } from 'lucide-react'
import { Logo } from '../../components/ui/Logo'
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher'

/**
 * Landing step before either role's registration form. Keeps /register/student and
 * /register/teacher as genuinely separate pages (no role dropdown, role fixed by the route)
 * rather than a single generic form with a role picker.
 */
export const RegisterChoicePage: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F2F7F4] via-[#F8FAF7] to-[#F1F6F3] flex flex-col">
      {/* Top Header */}
      <header className="w-full border-b border-[#E1E8E4]/80 bg-white/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3 flex items-center justify-between">
        <Link to="/login" className="flex items-center gap-2.5 group">
          <Logo size={32} />
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-[#202B2A] tracking-tight leading-tight group-hover:text-[#0F5B57] transition-colors">
              LanternED
            </span>
            <span className="text-[10px] text-[#687775] font-medium hidden sm:inline leading-tight">
              Offline-First Learning
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-lg">
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
          </div>

          <p className="text-center text-xs font-bold uppercase tracking-wider text-[#687775] mb-4">
            {t('auth.whatAccount')}
          </p>

          <div className="flex flex-col gap-3">
            <Link
              to="/register/student"
              className="group relative bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] group-hover:bg-[#0F5B57] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#202B2A] group-hover:text-[#0F5B57] transition-colors">
                    {t('auth.studentAccount')}
                  </h2>
                  <span className="text-[10px] font-medium text-[#0F5B57] bg-[#EAF6F0] px-2 py-0.5 rounded-full border border-[#CDE5DA]">
                    Learner
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5">{t('auth.studentAccountDesc')}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#F5F8F6] group-hover:bg-[#EAF6F0] flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>

            <Link
              to="/register/teacher"
              className="group relative bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] group-hover:bg-[#0F5B57] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#202B2A] group-hover:text-[#0F5B57] transition-colors">
                    {t('auth.teacherAccount')}
                  </h2>
                  <span className="text-[10px] font-medium text-[#0F5B57] bg-[#EAF6F0] px-2 py-0.5 rounded-full border border-[#CDE5DA]">
                    Educator
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5">{t('auth.teacherAccountDesc')}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#F5F8F6] group-hover:bg-[#EAF6F0] flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>

            <Link
              to="/register/college"
              className="group relative bg-white hover:bg-[#FAFDFB] border border-[#E1E8E4] hover:border-[#0F5B57] rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-[#EAF6F0] text-[#0F5B57] group-hover:bg-[#0F5B57] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#202B2A] group-hover:text-[#0F5B57] transition-colors">
                    {t('auth.institutionAccount')}
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0F5B57] text-white px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-[#687775] mt-0.5">{t('auth.institutionAccountDesc')}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#F5F8F6] group-hover:bg-[#EAF6F0] flex items-center justify-center shrink-0 transition-colors">
                <ArrowRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </div>

          <p className="text-center text-xs text-[#687775] mt-6">
            {t('auth.alreadyRegistered')}{' '}
            <Link to="/login" className="font-semibold text-[#0F5B57] hover:underline">
              {t('auth.signInHere')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
