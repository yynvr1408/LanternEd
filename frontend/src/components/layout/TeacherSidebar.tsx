import React from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  BookOpen,
  Video,
  PlayCircle,
  FolderOpen,
  FileCheck,
  Sparkles,
  User,
  Building2,
  ExternalLink,
} from 'lucide-react'
import { useIsInstitutionAdmin } from '../../hooks/useIsInstitutionAdmin'

const navItems = [
  { to: '/teacher/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/teacher/courses', labelKey: 'nav.myCourses', icon: BookOpen },
  { to: '/teacher/classes', labelKey: 'nav.classes', icon: Video },
  { to: '/teacher/recorded-lessons', labelKey: 'nav.recordedLessons', icon: PlayCircle },
  { to: '/teacher/materials', labelKey: 'nav.teachingResources', icon: FolderOpen },
  { to: '/teacher/assignments', labelKey: 'nav.assignments', icon: FileCheck },
  { to: '/teacher/summaries', labelKey: 'nav.aiSummaries', icon: Sparkles },
  { to: '/teacher/profile', labelKey: 'nav.profile', icon: User },
] as const

export const TeacherSidebar: React.FC = () => {
  const { t } = useTranslation()
  const isInstitutionAdmin = useIsInstitutionAdmin()

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-[#F8FAF7] border-r border-[#E1E8E4] shrink-0 min-h-[calc(100vh-4rem)] p-4 justify-between">
      <div>
        <div className="text-xs font-bold text-[#687775] uppercase tracking-wider px-3 mb-2">
          Teacher Console
        </div>
        <nav className="flex flex-col gap-1.5" aria-label="Teacher Navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/teacher/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#0F5B57] focus-visible:outline-offset-1 ${
                    isActive
                      ? 'bg-[#0F5B57] text-[#FFFFFF] shadow-xs'
                      : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
                  }`
                }
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {isInstitutionAdmin && (
        <div className="pt-4 border-t border-[#E1E8E4]">
          <NavLink
            to="/institution/dashboard"
            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold text-[#0F5B57] bg-[#DDF3EA]/70 hover:bg-[#DDF3EA] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#0F5B57]" />
              Institution Admin Console
            </span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </NavLink>
        </div>
      )}
    </aside>
  )
}
