import React from 'react'
import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { InstitutionAdminSidebar } from './InstitutionAdminSidebar'
import { OfflineIndicator } from '../ui/OfflineIndicator'

export const InstitutionAdminLayout: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-[#F8FAF7] text-[#202B2A] overflow-hidden">
      <OfflineIndicator />
      <AppHeader />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <InstitutionAdminSidebar />
        <main className="flex-1 min-w-0 min-h-0 bg-[#F8FAF7] overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
