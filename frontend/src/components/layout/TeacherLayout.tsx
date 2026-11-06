import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { TeacherSidebar } from './TeacherSidebar'
import { MobileNavigation } from './MobileNavigation'
import { OfflineIndicator } from '../ui/OfflineIndicator'

export const TeacherLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="h-full flex flex-col bg-[#F8FAF7] text-[#202B2A] overflow-hidden">
      <OfflineIndicator />
      <AppHeader onToggleMobileMenu={() => setIsMobileMenuOpen(true)} />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <TeacherSidebar />
        <main className="flex-1 min-w-0 min-h-0 bg-[#F8FAF7] overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <MobileNavigation
        isTeacherMenuOpen={isMobileMenuOpen}
        onCloseTeacherMenu={() => setIsMobileMenuOpen(false)}
      />
    </div>
  )
}
