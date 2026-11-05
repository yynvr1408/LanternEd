import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TeacherInstitutionAdminPage } from '../pages/teacher/TeacherInstitutionAdminPage'

const renderComponent = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

const myColleges = vi.fn()
const updateCollege = vi.fn()
const regenerateCode = vi.fn()
const listBranches = vi.fn()
const listCourses = vi.fn()
const listMembers = vi.fn()
const listPendingRegistrations = vi.fn()
const getDeletionRequest = vi.fn()

vi.mock('../services/institutionAdminApi', () => ({
  institutionAdminApi: {
    myColleges: (...a: unknown[]) => myColleges(...a),
    updateCollege: (...a: unknown[]) => updateCollege(...a),
    regenerateCode: (...a: unknown[]) => regenerateCode(...a),
    listBranches: (...a: unknown[]) => listBranches(...a),
    listCourses: (...a: unknown[]) => listCourses(...a),
    listMembers: (...a: unknown[]) => listMembers(...a),
    listPendingRegistrations: (...a: unknown[]) => listPendingRegistrations(...a),
    getDeletionRequest: (...a: unknown[]) => getDeletionRequest(...a),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
    setBranchStatus: vi.fn(),
    listSections: vi.fn().mockResolvedValue([]),
    createSection: vi.fn(),
    updateSection: vi.fn(),
    setSectionStatus: vi.fn(),
  },
}))

const COLLEGE = {
  id: 'col-1',
  name: 'Rural College A',
  location: 'Pune',
  contact_email: null,
  contact_phone: null,
  code: 'EV-ABCD-1234',
  code_generated_at: new Date().toISOString(),
  status: 'active' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('TeacherInstitutionAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listBranches.mockResolvedValue([])
    listCourses.mockResolvedValue([])
    listMembers.mockResolvedValue([])
    listPendingRegistrations.mockResolvedValue([])
    getDeletionRequest.mockResolvedValue(null)
  })

  it('shows an empty state when the teacher administers no institution', async () => {
    myColleges.mockResolvedValue([])
    renderComponent(<TeacherInstitutionAdminPage />)
    expect(await screen.findByText(/No Institution Delegated/i)).toBeInTheDocument()
  })

  it('lists a delegated college with its code, location and status', async () => {
    myColleges.mockResolvedValue([COLLEGE])
    renderComponent(<TeacherInstitutionAdminPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Rural College A' })).toBeInTheDocument()
    expect(screen.getByText(/EV-ABCD-1234/)).toBeInTheDocument()
    expect(screen.getByText('Pune')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE', { selector: 'span' })).toBeInTheDocument()
  })

  it('regenerates the registration code after confirmation', async () => {
    myColleges.mockResolvedValue([COLLEGE])
    regenerateCode.mockResolvedValue({ ...COLLEGE, code: 'EV-NEWX-9999' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderComponent(<TeacherInstitutionAdminPage />)
    await screen.findByRole('heading', { level: 1, name: 'Rural College A' })

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Code/i }))
    await waitFor(() => expect(regenerateCode).toHaveBeenCalledWith('col-1'))
  })

  it('does not regenerate the code if the teacher cancels the confirmation', async () => {
    myColleges.mockResolvedValue([COLLEGE])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderComponent(<TeacherInstitutionAdminPage />)
    await screen.findByRole('heading', { level: 1, name: 'Rural College A' })

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Code/i }))
    expect(regenerateCode).not.toHaveBeenCalled()
  })

  it('loads branches when navigating to branches tab', async () => {
    myColleges.mockResolvedValue([COLLEGE])
    renderComponent(<TeacherInstitutionAdminPage activeTab="branches" />)
    await screen.findByRole('heading', { level: 1, name: 'Rural College A' })

    await waitFor(() => expect(listBranches).toHaveBeenCalledWith('col-1'))
  })

  it('surfaces a load error with a retry option', async () => {
    myColleges.mockRejectedValueOnce(new Error('Could not reach the server.'))
    myColleges.mockResolvedValueOnce([COLLEGE])
    renderComponent(<TeacherInstitutionAdminPage />)

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Rural College A' })).toBeInTheDocument()
  })
})
