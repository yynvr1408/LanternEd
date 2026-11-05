import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RegisterPage } from '../pages/auth/RegisterPage'
import { ApiError } from '../services/apiClient'

const register = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ register }) }))

const requestRegistrationOtp = vi.fn()
const verifyRegistrationOtp = vi.fn()
vi.mock('../services/authService', () => ({
  authService: {
    requestRegistrationOtp: (...a: unknown[]) => requestRegistrationOtp(...a),
    verifyRegistrationOtp: (...a: unknown[]) => verifyRegistrationOtp(...a),
  },
}))

const listColleges = vi.fn()
const listBranches = vi.fn()
const listSections = vi.fn()
vi.mock('../services/registrationApi', () => ({
  registrationApi: {
    listColleges: (...a: unknown[]) => listColleges(...a),
    listBranches: (...a: unknown[]) => listBranches(...a),
    listSections: (...a: unknown[]) => listSections(...a),
  },
}))

const COLLEGE = /^College\s*\*?$/
const BRANCH = /^Branch\s*\/?\s*Department\s*\*?$/

const COLLEGES = [
  { id: 'col-a', name: 'Alpha College', location: 'Pune' },
  { id: 'col-b', name: 'Beta Institute', location: null },
]
const BRANCHES: Record<string, { id: string; name: string; short_code: string | null }[]> = {
  'col-a': [{ id: 'br-cse', name: 'Computer Science', short_code: 'CSE' }, { id: 'br-ece', name: 'Electronics', short_code: null }],
  'col-b': [{ id: 'br-me', name: 'Mechanical', short_code: 'ME' }],
}

const renderPage = (portal: 'student' | 'teacher') =>
  render(
    <MemoryRouter>
      <RegisterPage portal={portal} />
    </MemoryRouter>,
  )

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const fillBasics = () => {
  type(/full name/i, 'Asha Rao')
  type(/email address/i, 'asha@example.com')
  type(/^password/i, 'password123')
  type(/confirm password/i, 'password123')
}
const optionTexts = (label: RegExp) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text)
const waitColleges = () => waitFor(() => expect(optionTexts(COLLEGE)).toContain('Beta Institute'))

async function pickStudent(college: string, branch: string) {
  fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: college } })
  await waitFor(() => expect(optionTexts(BRANCH).length).toBeGreaterThan(1))
  fireEvent.change(screen.getByLabelText(BRANCH), { target: { value: branch } })
}

beforeEach(() => {
  register.mockReset()
  requestRegistrationOtp.mockReset().mockResolvedValue({ message: 'sent', otp_ttl_minutes: 5, resend_cooldown_seconds: 60 })
  verifyRegistrationOtp.mockReset().mockResolvedValue({ verification_token: 'tok-abc', expires_in_minutes: 10 })
  listColleges.mockReset().mockResolvedValue(COLLEGES)
  listBranches.mockReset().mockImplementation(async (id: string) => BRANCHES[id] ?? [])
  listSections.mockReset().mockResolvedValue([])
})

/** Clicks "Send Verification Code", waits for the OTP step, enters a code and submits it */
async function submitAndVerify() {
  fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))
  const otpInput = await screen.findByLabelText(/verification code/i)
  fireEvent.change(otpInput, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify & create account/i }))
}

describe('registration: decoupled teacher branch/section & student branch allocation', () => {
  it('teacher form has the requested fields without branch or section options', async () => {
    renderPage('teacher')
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument()
    await waitFor(() => expect(optionTexts(COLLEGE)).toContain('Alpha College — Pune'))
    for (const l of [/full name/i, /email address/i, /^password/i, /confirm password/i, COLLEGE, /college code/i]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument()
    }
    // As requested: branch and section are removed from teacher registration
    expect(screen.queryByLabelText(BRANCH)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Section/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Department & Section Allocation:/i)).toBeInTheDocument()
  })

  it('student form asks for the branch but section is allocated by admin upon approval', async () => {
    renderPage('student')
    await waitColleges()
    expect(screen.getByLabelText(BRANCH)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Section/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Section Allocation:/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-a' } })
    await waitFor(() => expect(optionTexts(BRANCH)).toEqual(['Select your branch', 'Computer Science (CSE)', 'Electronics']))
  })

  it('changing college reloads branches for student', async () => {
    renderPage('student')
    await waitColleges()
    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-a' } })
    await waitFor(() => expect(optionTexts(BRANCH)).toEqual(['Select your branch', 'Computer Science (CSE)', 'Electronics']))
    fireEvent.change(screen.getByLabelText(BRANCH), { target: { value: 'br-cse' } })

    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-b' } })
    await waitFor(() => expect(optionTexts(BRANCH)).toEqual(['Select your branch', 'Mechanical (ME)']))
    expect((screen.getByLabelText(BRANCH) as HTMLSelectElement).value).toBe('')
    expect(listBranches).toHaveBeenLastCalledWith('col-b')
  })

  it('shows field-specific validation errors and does not call the server', async () => {
    renderPage('teacher')
    await waitColleges()
    type(/full name/i, 'Asha Rao')
    type(/email address/i, 'asha@example.com')
    type(/^password/i, 'password123')
    type(/confirm password/i, 'different123')
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(screen.getByText('Select your college.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('asks student for the branch if omitted', async () => {
    renderPage('student')
    await waitColleges()
    fillBasics()
    type(/college code/i, 'EV-AAAA-2222')
    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-a' } })
    await waitFor(() => expect(optionTexts(BRANCH).length).toBeGreaterThan(1))
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))
    expect(await screen.findByText('Select your branch.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('rejects a short password with the backend policy (8 characters)', async () => {
    renderPage('student')
    await waitColleges()
    type(/^password/i, 'short1')
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))
    expect(await screen.findByText('Password must be at least 8 characters long.')).toBeInTheDocument()
  })

  it('teacher submits with college and code and preserves values on error', async () => {
    let reject!: (e: unknown) => void
    register.mockImplementation(() => new Promise((_, rej) => { reject = rej }))
    renderPage('teacher')
    await waitColleges()
    fillBasics()
    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-a' } })
    type(/college code/i, 'EV-WRONG-CODE')
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))
    const otpInput = await screen.findByLabelText(/verification code/i)
    fireEvent.change(otpInput, { target: { value: '123456' } })
    const verify = screen.getByRole('button', { name: /verify & create account/i })
    fireEvent.click(verify)
    fireEvent.click(verify) // double click must not send twice
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1))
    expect(register).toHaveBeenCalledWith('asha@example.com', 'Asha Rao', 'password123', 'teacher', undefined, {
      collegeId: 'col-a', branchId: undefined, collegeCode: 'EV-WRONG-CODE',
    }, 'tok-abc')
    reject(new ApiError('The college code is incorrect for the selected college.', 422, false, 'INVALID_COLLEGE_CODE'))
    expect(await screen.findByText('The college code is incorrect for the selected college.')).toBeInTheDocument()
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Asha Rao')
    expect((screen.getByLabelText(/college code/i) as HTMLInputElement).value).toBe('EV-WRONG-CODE')
  })

  it('shows a duplicate email next to the email field and a network failure as a banner', async () => {
    register.mockRejectedValueOnce(new ApiError('An account with this email already exists.', 409, false, 'EMAIL_TAKEN'))
    renderPage('student')
    await waitColleges()
    fillBasics()
    await pickStudent('col-a', 'br-cse')
    type(/college code/i, 'EV-ALPHA-0001')
    await submitAndVerify()
    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument()
    register.mockRejectedValueOnce(new ApiError('Network', 0, true))
    await submitAndVerify()
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument()
  })

  it('a student sends the branch and college code', async () => {
    register.mockResolvedValue({ role: 'student' })
    renderPage('student')
    await waitColleges()
    expect(screen.getByLabelText(/college code/i)).toBeInTheDocument()
    fillBasics()
    await pickStudent('col-b', 'br-me')
    type(/college code/i, 'EV-BETA-0001')
    await submitAndVerify()
    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(register.mock.calls[0][5]).toEqual({
      collegeId: 'col-b', branchId: 'br-me', collegeCode: 'EV-BETA-0001',
    })
  })

  it('a student without a college code can submit and requests otp for registration', async () => {
    requestRegistrationOtp.mockResolvedValueOnce({ sent: true, expires_in: 300, is_mock: true, dev_otp: '123456' })
    renderPage('student')
    await waitColleges()
    fillBasics()
    await pickStudent('col-b', 'br-me')
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))
    await waitFor(() => expect(requestRegistrationOtp).toHaveBeenCalledWith('asha@example.com'))
    expect(await screen.findByText(/We sent a 6-digit code to/)).toBeInTheDocument()
  })

  it('shows empty and error states for colleges and branches', async () => {
    listColleges.mockResolvedValueOnce([])
    const { unmount } = renderPage('teacher')
    expect(await screen.findByText(/No colleges are open for registration yet/)).toBeInTheDocument()
    unmount()

    listColleges.mockRejectedValueOnce(new Error('down'))
    renderPage('student')
    expect(await screen.findByText(/Could not load colleges/)).toBeInTheDocument()
    listColleges.mockResolvedValueOnce(COLLEGES)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitColleges()

    listBranches.mockRejectedValueOnce(new Error('down'))
    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-a' } })
    expect(await screen.findByText(/Could not load branches/)).toBeInTheDocument()

    listBranches.mockResolvedValueOnce([])
    fireEvent.change(screen.getByLabelText(COLLEGE), { target: { value: 'col-b' } })
    expect(await screen.findByText(/This college has no branches yet/)).toBeInTheDocument()
  })

  it('re-fetches branches when the server says the branch is no longer open', async () => {
    register.mockRejectedValueOnce(new ApiError('This branch is not available.', 409, false, 'BRANCH_INACTIVE'))
    renderPage('student')
    await waitColleges()
    fillBasics()
    await pickStudent('col-a', 'br-cse')
    type(/college code/i, 'EV-ALPHA-0001')
    const callsBefore = listBranches.mock.calls.length
    listBranches.mockResolvedValueOnce([BRANCHES['col-a'][1]])
    await submitAndVerify()
    expect(await screen.findByText('This branch is not available.')).toBeInTheDocument()
    await waitFor(() => expect(listBranches.mock.calls.length).toBe(callsBefore + 1))
    await waitFor(() => expect(optionTexts(BRANCH)).not.toContain('Computer Science (CSE)'))
  })

  it('re-fetches colleges when the server says the college is no longer open', async () => {
    register.mockRejectedValueOnce(new ApiError('This college is not accepting registrations.', 409, false, 'COLLEGE_INACTIVE'))
    renderPage('student')
    await waitColleges()
    fillBasics()
    await pickStudent('col-a', 'br-cse')
    type(/college code/i, 'EV-ALPHA-0001')
    listColleges.mockResolvedValueOnce([COLLEGES[1]])
    await submitAndVerify()
    expect(await screen.findByText('This college is not accepting registrations.')).toBeInTheDocument()
    await waitFor(() => expect(optionTexts(COLLEGE)).not.toContain('Alpha College — Pune'))
  })
})
