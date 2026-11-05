import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  GitBranch,
  BookOpen,
  GraduationCap,
  Users,
  ShieldCheck,
  Sliders,
  ExternalLink,
  Shield,
  BookMarked,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export const institutionNavItems = [
  { to: '/institution/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/institution/branches', label: 'Branches & Depts', icon: GitBranch },
  { to: '/institution/courses', label: 'Course Catalog', icon: BookOpen },
  { to: '/institution/teachers', label: 'Teachers Directory', icon: GraduationCap },
  { to: '/institution/students', label: 'Students Directory', icon: Users },
  { to: '/institution/approvals', label: 'Pending Approvals', icon: ShieldCheck },
  { to: '/institution/settings', label: 'College Settings', icon: Sliders },
] as const

export const InstitutionAdminSidebar: React.FC = () => {
  const { user } = useAuth()
  const isTeacher = user?.role === 'teacher'
  const isSuperAdmin = user?.role === 'admin'

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-[#F8FAF7] border-r border-[#E1E8E4] shrink-0 min-h-[calc(100vh-4rem)] p-4 justify-between">
      <div>
        <div className="flex items-center gap-2 px-3 mb-2">
          <Building2 className="w-4 h-4 text-[#0F5B57]" />
          <span className="text-xs font-bold text-[#0F5B57] uppercase tracking-wider">
            Institution Console
          </span>
        </div>
        <p className="text-[11px] text-[#687775] px-3 mb-4">
          Administrative control center for department hierarchy, courses, and member rosters.
        </p>

        <nav className="flex flex-col gap-1.5" aria-label="Institution Admin Navigation">
          {institutionNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#0F5B57] focus-visible:outline-offset-1 ${
                    isActive
                      ? 'bg-[#0F5B57] text-[#FFFFFF] shadow-xs'
                      : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
                  }`
                }
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-[#E1E8E4] flex flex-col gap-2">
        {isTeacher && (
          <NavLink
            to="/teacher/dashboard"
            className="flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-semibold text-[#0F5B57] bg-[#DDF3EA]/60 hover:bg-[#DDF3EA] transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookMarked className="w-4 h-4" />
              Teacher Console
            </span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </NavLink>
        )}
        {isSuperAdmin && (
          <NavLink
            to="/platform-console"
            className="flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-semibold text-[#7A3E00] bg-[#FFF8E7] hover:bg-[#FFEEC2] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Super Admin Console
            </span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </NavLink>
        )}
      </div>
    </aside>
  )
}
