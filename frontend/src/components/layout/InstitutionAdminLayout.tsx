import React from 'react'
import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { InstitutionAdminSidebar } from './InstitutionAdminSidebar'
import { OfflineIndicator } from '../ui/OfflineIndicator'

export const InstitutionAdminLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAF7] text-[#202B2A]">
      <OfflineIndicator />
      <AppHeader />
      <div className="flex-1 flex">
        <InstitutionAdminSidebar />
        <main className="flex-1 min-w-0 bg-[#F8FAF7]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
