import React from 'react'
import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { StudentSidebar } from './StudentSidebar'
import { MobileNavigation } from './MobileNavigation'
import { OfflineIndicator } from '../ui/OfflineIndicator'

export const StudentLayout: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-[#F8FAF7] text-[#202B2A] overflow-hidden">
      <OfflineIndicator />
      <AppHeader />
      <div className="flex-1 flex overflow-hidden">
        <StudentSidebar />
        <main className="flex-1 min-w-0 bg-[#F8FAF7] overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <MobileNavigation />
    </div>
  )
}
