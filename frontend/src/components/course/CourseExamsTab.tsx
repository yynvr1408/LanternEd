import React, { useState, useEffect } from 'react'
import {
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Code2,
  Eye,
  FileQuestion,
  Lock,
  Plus,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react'
import {
  examService,
  type Exam,
  type ExamAttempt,
  type ProctorAttemptMonitor,
  type QuestionBank,
} from '../../services/examService'
import { Badge, Button, Dialog, FormField, Input, LoadingState, Textarea } from '../ui'

interface CourseExamsTabProps {
  courseId: string
}

export const CourseExamsTab: React.FC<CourseExamsTabProps> = ({ courseId }) => {
  const [exams, setExams] = useState<Exam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create exam modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [durationMins, setDurationMins] = useState(60)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [totalMarks, setTotalMarks] = useState(100)
  const [enforceFullscreen, setEnforceFullscreen] = useState(true)
  const [requireWebcam, setRequireWebcam] = useState(false)
  const [requireLockdown, setRequireLockdown] = useState(false)
  const [maxTabSwitches, setMaxTabSwitches] = useState(3)
  const [selectedBankId, setSelectedBankId] = useState('')
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Question bank coding / MCQ modal
  const [isBankOpen, setIsBankOpen] = useState(false)
  const [qType, setQType] = useState<'coding' | 'mcq_single'>('coding')
  const [qPrompt, setQPrompt] = useState('')
  const [qLang, setQLang] = useState('python')
  const [qStarter, setQStarter] = useState('print(input())')
  const [qStdin, setQStdin] = useState('2 3')
  const [qExpectedOut, setQExpectedOut] = useState('5')
  const [qMarks, setQMarks] = useState(10)
  const [isSavingQ, setIsSavingQ] = useState(false)

  // Attempts + Live Proctor Monitor modals
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [proctorExam, setProctorExam] = useState<Exam | null>(null)
  const [proctorRows, setProctorRows] = useState<ProctorAttemptMonitor[]>([])
  const [loadingProctor, setLoadingProctor] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [data, bankList] = await Promise.all([
        examService.listCourseExams(courseId),
        examService.listQuestionBanks(courseId).catch(() => []),
      ])
      setExams(data)
      setBanks(bankList)
      if (!selectedBankId && bankList.length > 0) {
        setSelectedBankId(bankList[0].id)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load examinations.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // Defaults: start today, end 7 days later
    const now = new Date()
    setStartDate(now.toISOString().slice(0, 16))
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    setEndDate(nextWeek.toISOString().slice(0, 16))
  }, [courseId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !startDate || !endDate) return

    setIsSubmitting(true)
    try {
      await examService.createExam(courseId, {
        title,
        instructions: instructions.trim() || undefined,
        duration_minutes: durationMins,
        start_window: new Date(startDate).toISOString(),
        end_window: new Date(endDate).toISOString(),
        total_marks: totalMarks,
        enforce_fullscreen: enforceFullscreen,
        max_tab_switches: maxTabSwitches,
        require_webcam_proctoring: requireWebcam,
        require_device_lockdown: requireLockdown,
        sections: [
          {
            title: 'General Assessment',
            marks_per_question: 2.0,
            question_bank_id: selectedBankId || undefined,
          },
        ],
      })
      setIsCreateOpen(false)
      setTitle('')
      setInstructions('')
      loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to create exam.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleViewAttempts = async (exam: Exam) => {
    setSelectedExam(exam)
    setLoadingAttempts(true)
    try {
      const data = await examService.listAttempts(exam.id)
      setAttempts(data)
    } catch {
      setAttempts([])
    } finally {
      setLoadingAttempts(false)
    }
  }

  const handleOpenProctorMonitor = async (exam: Exam) => {
    setProctorExam(exam)
    setLoadingProctor(true)
    try {
      setProctorRows(await examService.getProctorMonitor(exam.id))
    } catch {
      setProctorRows([])
    } finally {
      setLoadingProctor(false)
    }
  }

  const handleToggleFlag = async (attemptId: string, currentFlag: boolean) => {
    if (!proctorExam) return
    const updated = await examService.flagAttempt(proctorExam.id, attemptId, {
      is_flagged: !currentFlag,
      reason: !currentFlag ? 'Flagged by live proctor monitor' : 'Cleared by instructor',
    })
    setProctorRows((prev) => prev.map((r) => (r.attempt_id === attemptId ? updated : r)))
  }

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!qPrompt.trim()) return
    setIsSavingQ(true)
    try {
      let bankId = selectedBankId
      if (!bankId) {
        const created = await examService.createQuestionBank(courseId, { title: 'Course Question Pool' })
        bankId = created.id
        setSelectedBankId(bankId)
      }
      if (qType === 'coding') {
        await examService.addQuestionItem(bankId, {
          question_type: 'coding',
          prompt: qPrompt.trim(),
          default_marks: qMarks,
          correct_answer: {},
          code_harness: {
            language: qLang,
            starter_code: qStarter,
            test_cases: [
              { name: 'Sample Case', stdin: qStdin, expected_stdout: qExpectedOut, hidden: false },
            ],
          },
        })
      } else {
        await examService.addQuestionItem(bankId, {
          question_type: 'mcq_single',
          prompt: qPrompt.trim(),
          default_marks: qMarks,
          options: [
            { id: 'opt_a', text: 'True / Valid' },
            { id: 'opt_b', text: 'False / Invalid' },
          ],
          correct_answer: ['opt_a'],
        })
      }
      setQPrompt('')
      setIsBankOpen(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to save question item.')
    } finally {
      setIsSavingQ(false)
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading course examinations and testing pools..." />
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 border border-[#E1E8E4] rounded-xl shadow-xs">
        <div>
          <h3 className="font-bold text-sm text-[#202B2A]">Proctored Course Examinations</h3>
          <p className="text-xs text-[#687775]">
            Configure timed tests, fullscreen lockdown mode, and question pools.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Code2 className="w-3.5 h-3.5" />}
            onClick={() => setIsBankOpen(true)}
          >
            Add Coding / Bank Question
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setIsCreateOpen(true)}
          >
            Author Examination
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#FDE8E7] text-[#B42318] rounded-xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Exam Cards */}
      {exams.length === 0 ? (
        <div className="p-8 text-center bg-white border border-dashed border-[#CBD7D1] rounded-2xl">
          <FileQuestion className="w-10 h-10 text-[#687775] mx-auto mb-2 opacity-50" />
          <p className="font-bold text-sm text-[#202B2A]">No Examinations Published Yet</p>
          <p className="text-xs text-[#687775] mt-1 max-w-sm mx-auto">
            Click "Author Examination" above to schedule a timed test with anti-cheat protection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="p-5 bg-white border border-[#E1E8E4] rounded-2xl shadow-xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-sm text-[#202B2A]">{exam.title}</h4>
                  <Badge variant="success" size="sm">
                    {exam.status.toUpperCase()}
                  </Badge>
                </div>

                {exam.instructions && (
                  <p className="text-xs text-[#687775] line-clamp-2">{exam.instructions}</p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-[#687775]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#0F5B57]" />
                    <span>{exam.duration_minutes} Mins Duration</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#0F5B57]" />
                    <span>{exam.enforce_fullscreen ? 'Fullscreen Lockdown' : 'Standard'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Calendar className="w-3.5 h-3.5 text-[#0F5B57]" />
                    <span>
                      Window: {new Date(exam.start_window).toLocaleDateString()} -{' '}
                      {new Date(exam.end_window).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E1E8E4]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F5B57]">{exam.total_marks} Points</span>
                  {exam.require_webcam_proctoring && <Badge variant="info" size="sm">Cam</Badge>}
                  {exam.require_device_lockdown && <Badge variant="warning" size="sm">Lockdown</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Camera className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenProctorMonitor(exam)}
                  >
                    Live Proctor
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() => handleViewAttempts(exam)}
                  >
                    Sittings
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Exam Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Schedule & Author Proctored Examination"
        description="Configure timing, anti-cheat limits, and question parameters."
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <FormField label="Exam Title" htmlFor="ex-title" required>
            <Input
              id="ex-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midterm 1: Microcontroller Architectures & Embedded C"
              required
            />
          </FormField>

          <FormField label="Instructions for Students" htmlFor="ex-inst">
            <Textarea
              id="ex-inst"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Scientific calculators allowed. Tab switching will terminate the sitting."
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Duration (Minutes)" htmlFor="ex-dur" required>
              <Input
                id="ex-dur"
                type="number"
                min={5}
                max={360}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                required
              />
            </FormField>

            <FormField label="Total Points" htmlFor="ex-marks" required>
              <Input
                id="ex-marks"
                type="number"
                min={1}
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                required
              />
            </FormField>

            <FormField label="Max Allowed Tab Blurs" htmlFor="ex-blurs" required>
              <Input
                id="ex-blurs"
                type="number"
                min={1}
                max={10}
                value={maxTabSwitches}
                onChange={(e) => setMaxTabSwitches(Number(e.target.value))}
                required
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Start Window" htmlFor="ex-start" required>
              <Input
                id="ex-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </FormField>

            <FormField label="End Window" htmlFor="ex-end" required>
              <Input
                id="ex-end"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </FormField>
          </div>

          <div className="p-3 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-[#202B2A] block">Enforce Fullscreen Lockdown</span>
              <span className="text-[11px] text-[#687775]">Forces browser into fullscreen mode during testing.</span>
            </div>
            <input
              type="checkbox"
              checked={enforceFullscreen}
              onChange={(e) => setEnforceFullscreen(e.target.checked)}
              className="w-4 h-4 text-[#0F5B57] rounded cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="p-3 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-bold text-[#202B2A] flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5 text-[#0F5B57]" /> Webcam Checks
                </span>
                <span className="text-[11px] text-[#687775]">Low-bandwidth periodic thumbnails</span>
              </div>
              <input
                type="checkbox"
                checked={requireWebcam}
                onChange={(e) => setRequireWebcam(e.target.checked)}
                className="w-4 h-4 text-[#0F5B57] rounded"
              />
            </label>
            <label className="p-3 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-bold text-[#202B2A] flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-[#0F5B57]" /> Native OS Lockdown
                </span>
                <span className="text-[11px] text-[#687775]">Desktop Always-on-Top / Android FLAG_SECURE</span>
              </div>
              <input
                type="checkbox"
                checked={requireLockdown}
                onChange={(e) => setRequireLockdown(e.target.checked)}
                className="w-4 h-4 text-[#0F5B57] rounded"
              />
            </label>
          </div>

          {banks.length > 0 && (
            <FormField label="Linked Question Pool" htmlFor="ex-bank">
              <select
                id="ex-bank"
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="w-full text-xs border border-[#CBD7D1] rounded-lg px-2.5 py-2 bg-white text-[#202B2A]"
              >
                <option value="">None (blank exam)</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.item_count} items)
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E8E4]">
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" isLoading={isSubmitting}>
              Publish Examination
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Attempts List Dialog */}
      <Dialog
        isOpen={!!selectedExam}
        onClose={() => setSelectedExam(null)}
        title={selectedExam ? `Candidate Sittings · ${selectedExam.title}` : 'Sittings'}
        description="Review student exam attempts, scores, and proctoring audit flags."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {loadingAttempts ? (
            <LoadingState message="Loading attempt telemetry..." />
          ) : attempts.length === 0 ? (
            <p className="text-center py-8 text-[#687775]">
              No students have taken this examination yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[#E1E8E4] rounded-xl bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAF7] border-b border-[#E1E8E4] text-[#687775] font-semibold">
                    <th className="py-2.5 px-3">Student ID</th>
                    <th className="py-2.5 px-3">Started</th>
                    <th className="py-2.5 px-3">Submitted</th>
                    <th className="py-2.5 px-3">Auto-Score</th>
                    <th className="py-2.5 px-3">Security Blurs</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1E8E4]">
                  {attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-[#F9FBFA]">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#202B2A]">
                        {att.student_id.slice(0, 8)}...
                      </td>
                      <td className="py-2.5 px-3 text-[#687775]">
                        {new Date(att.started_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-[#687775]">
                        {att.submitted_at ? new Date(att.submitted_at).toLocaleTimeString() : 'In Progress'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#0F5B57]">
                        {att.auto_graded_score} pts
                      </td>
                      <td className="py-2.5 px-3">
                        {att.tab_blur_count > 0 ? (
                          <span className="font-semibold text-[#B42318] flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" /> {att.tab_blur_count} Blurs
                          </span>
                        ) : (
                          <span className="text-[#247A4D] font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Clean
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge variant={att.status === 'evaluated' || att.status === 'submitted' ? 'success' : 'warning'}>
                          {att.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedExam(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Coding / Question Bank Authoring Modal */}
      <Dialog
        isOpen={isBankOpen}
        onClose={() => setIsBankOpen(false)}
        title="Add Question to Course Pool"
        description="Author auto-graded coding sandbox exercises (Python/JS/C/C++) or objective checks."
        maxWidth="lg"
      >
        <form onSubmit={handleAddQuestion} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Question Type" htmlFor="qb-type">
              <select
                id="qb-type"
                value={qType}
                onChange={(e) => setQType(e.target.value as 'coding' | 'mcq_single')}
                className="w-full border border-[#CBD7D1] rounded-lg px-2.5 py-2 bg-white text-[#202B2A]"
              >
                <option value="coding">Coding Sandbox (Auto-Graded)</option>
                <option value="mcq_single">Quick True/False MCQ</option>
              </select>
            </FormField>
            <FormField label="Marks" htmlFor="qb-marks">
              <Input
                id="qb-marks"
                type="number"
                min={1}
                value={qMarks}
                onChange={(e) => setQMarks(Number(e.target.value))}
              />
            </FormField>
          </div>

          <FormField label="Question Prompt" htmlFor="qb-prompt" required>
            <Textarea
              id="qb-prompt"
              rows={3}
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              placeholder="e.g. Read two integers from stdin and print their sum."
              required
            />
          </FormField>

          {qType === 'coding' && (
            <div className="space-y-3 p-3 rounded-xl bg-[#F8FAF7] border border-[#E1E8E4]">
              <FormField label="Default Language" htmlFor="qb-lang">
                <select
                  id="qb-lang"
                  value={qLang}
                  onChange={(e) => setQLang(e.target.value)}
                  className="w-full border border-[#CBD7D1] rounded-lg px-2.5 py-1.5 bg-white text-[#202B2A]"
                >
                  <option value="python">Python 3</option>
                  <option value="javascript">JavaScript</option>
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                </select>
              </FormField>
              <FormField label="Starter Code" htmlFor="qb-starter">
                <Textarea
                  id="qb-starter"
                  rows={3}
                  value={qStarter}
                  onChange={(e) => setQStarter(e.target.value)}
                  className="font-mono text-xs"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Sample Stdin" htmlFor="qb-stdin">
                  <Input id="qb-stdin" value={qStdin} onChange={(e) => setQStdin(e.target.value)} className="font-mono" />
                </FormField>
                <FormField label="Expected Stdout" htmlFor="qb-out">
                  <Input id="qb-out" value={qExpectedOut} onChange={(e) => setQExpectedOut(e.target.value)} className="font-mono" />
                </FormField>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E1E8E4]">
            <Button size="sm" variant="outline" onClick={() => setIsBankOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" isLoading={isSavingQ}>
              Save Question
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Live Proctor Monitor Dialog */}
      <Dialog
        isOpen={!!proctorExam}
        onClose={() => setProctorExam(null)}
        title={proctorExam ? `Live Proctor Monitor · ${proctorExam.title}` : 'Live Proctor Monitor'}
        description="Real-time candidate integrity overview, webcam snapshot thumbnails, and blur alerts."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {loadingProctor ? (
            <LoadingState message="Polling live proctoring feed..." />
          ) : proctorRows.length === 0 ? (
            <p className="text-center py-8 text-[#687775]">No candidates have entered this sitting yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {proctorRows.map((row) => (
                <div
                  key={row.attempt_id}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                    row.is_flagged_for_review ? 'border-[#F04438] bg-[#FEF3F2]' : 'border-[#E1E8E4] bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-[#202B2A]">{row.student_name}</div>
                      <div className="text-[11px] text-[#687775] font-mono">
                        Blur Count: {row.tab_blur_count} · Snapshots: {row.snapshot_count}
                      </div>
                    </div>
                    <Badge variant={row.is_flagged_for_review ? 'error' : 'success'}>
                      {row.is_flagged_for_review ? 'FLAGGED' : row.status.toUpperCase()}
                    </Badge>
                  </div>

                  {row.latest_snapshot_url && (
                    <img
                      src={row.latest_snapshot_url}
                      alt={`Proctor snapshot for ${row.student_name}`}
                      className="w-full h-28 object-cover rounded-lg border border-[#E1E8E4]"
                    />
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[#687775]">
                      {row.lockdown_active ? 'OS Lockdown Active' : 'Browser Runner'}
                    </span>
                    <Button
                      size="sm"
                      variant={row.is_flagged_for_review ? 'outline' : 'destructive'}
                      onClick={() => handleToggleFlag(row.attempt_id, row.is_flagged_for_review)}
                    >
                      {row.is_flagged_for_review ? 'Clear Flag' : 'Flag Attempt'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
