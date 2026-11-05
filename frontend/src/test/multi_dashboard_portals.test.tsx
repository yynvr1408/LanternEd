import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LoginChoicePage } from '../pages/auth/LoginChoicePage'
import { LoginPage } from '../pages/auth/LoginPage'
import { AdminApp } from '../pages/admin/AdminApp'
import { platformAdapter } from '../services/platformAdapter'
import { institutionAdminApi } from '../services/institutionAdminApi'

// Mock AuthContext
const login = vi.fn()
const verifyLoginOtp = vi.fn()
const logout = vi.fn(async () => {})
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login, verifyLoginOtp, logout, isSharedDevice: false, setSharedDevice: vi.fn() }),
}))

describe('Multi-Dashboard Portals & Native Super-Admin Access Restriction', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as any).__TAURI__
    delete (window as any).Capacitor
  })

  afterEach(() => {
    delete (window as any).__TAURI__
    delete (window as any).Capacitor
  })

  describe('LoginChoicePage Portal Visibility', () => {
    it('surfaces Student, Teacher, and College Admin portals for all users', () => {
      render(
        <MemoryRouter>
          <LoginChoicePage />
        </MemoryRouter>
      )

      expect(screen.getByText(/Student Portal/i)).toBeInTheDocument()
      expect(screen.getByText(/Teacher Portal/i)).toBeInTheDocument()
      expect(screen.getByText(/Institution Admin Portal|College Admin Portal/i)).toBeInTheDocument()
    })

    it('hides platform management link inside native client applications', () => {
      // Simulate native app (Tauri / Capacitor)
      ;(window as any).__TAURI__ = { invoke: vi.fn() }
      expect(platformAdapter.isNative()).toBe(true)

      render(
        <MemoryRouter>
          <LoginChoicePage />
        </MemoryRouter>
      )

      expect(screen.queryByText(/Platform Administration/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Platform Administration/i })).toBeNull()
    })

    it('hides platform management link from public UI on web browsers', () => {
      expect(platformAdapter.isNative()).toBe(false)

      render(
        <MemoryRouter>
          <LoginChoicePage />
        </MemoryRouter>
      )

      expect(screen.queryByText(/Platform Administration/i)).not.toBeInTheDocument()
    })
  })

  describe('College Admin Portal Authentication (/login/college-admin)', () => {
    it('allows delegated institution admin teacher and redirects to /institution/dashboard', async () => {
      const adminTeacher = { id: 't1', email: 'prof.sharma@college.edu', role: 'teacher', full_name: 'Prof. Sharma' }
      login.mockResolvedValue(adminTeacher)
      vi.spyOn(institutionAdminApi, 'myColleges').mockResolvedValue([{ id: 'c1', name: 'Rural College', code: 'COL-123' } as any])

      render(
        <MemoryRouter initialEntries={['/login/college-admin']}>
          <Routes>
            <Route path="/login/college-admin" element={<LoginPage portal="college-admin" />} />
            <Route path="/institution/dashboard" element={<div>College Admin Dashboard Loaded</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByRole('heading', { level: 1, name: /Institution Administrator Sign In|College Administrator Sign In/i })).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'prof.sharma@college.edu' } })
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'secretpass' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByText('College Admin Dashboard Loaded')).toBeInTheDocument()
    })

    it('rejects student attempting to log in via College Admin portal', async () => {
      const student = { id: 's1', email: 'student@college.edu', role: 'student', full_name: 'Ravi Kumar' }
      login.mockResolvedValue(student)

      render(
        <MemoryRouter initialEntries={['/login/college-admin']}>
          <Routes>
            <Route path="/login/college-admin" element={<LoginPage portal="college-admin" />} />
          </Routes>
        </MemoryRouter>
      )

      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'student@college.edu' } })
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'studentpass' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByText(/This portal is reserved for designated (Institution|College) Administrators/i)).toBeInTheDocument()
      expect(logout).toHaveBeenCalled()
    })

    it('rejects teacher who has not been delegated college administration', async () => {
      const regularTeacher = { id: 't2', email: 'regular@college.edu', role: 'teacher', full_name: 'Mr. Verma' }
      login.mockResolvedValue(regularTeacher)
      vi.spyOn(institutionAdminApi, 'myColleges').mockResolvedValue([])

      render(
        <MemoryRouter initialEntries={['/login/college-admin']}>
          <Routes>
            <Route path="/login/college-admin" element={<LoginPage portal="college-admin" />} />
          </Routes>
        </MemoryRouter>
      )

      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'regular@college.edu' } })
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'teacherpass' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByText(/does not have (Institution|College) Administrator delegation/i)).toBeInTheDocument()
      expect(logout).toHaveBeenCalled()
    })
  })

  describe('Super-Admin Native App Access Barrier (/super-admin)', () => {
    it('strictly blocks access inside native desktop/mobile apps and shows restricted notice', () => {
      // Simulate native app runtime (Tauri / Capacitor)
      ;(window as any).__TAURI__ = { invoke: vi.fn() }
      expect(platformAdapter.isNative()).toBe(true)

      render(
        <MemoryRouter initialEntries={['/super-admin']}>
          <AdminApp />
        </MemoryRouter>
      )

      expect(screen.getByText('Platform Administration Restricted')).toBeInTheDocument()
      expect(screen.getByText(/strictly restricted to authorized web portals and cannot be accessed from installed desktop or mobile client applications/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Return to Application Portals/i })).toBeInTheDocument()
    })
  })
})
