import React, { useState, useEffect } from 'react'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileQuestion,
  Plus,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { examService, type Exam, type ExamAttempt } from '../../services/examService'
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
  const [maxTabSwitches, setMaxTabSwitches] = useState(3)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Attempts modal
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [loadingAttempts, setLoadingAttempts] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await examService.listCourseExams(courseId)
      setExams(data)
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
        sections: [
          {
            title: 'General Assessment',
            marks_per_question: 2.0,
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

        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setIsCreateOpen(true)}
        >
          Author Examination
        </Button>
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

              <div className="flex items-center justify-between pt-3 border-t border-[#E1E8E4]">
                <span className="text-xs font-bold text-[#0F5B57]">{exam.total_marks} Points</span>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Eye className="w-3.5 h-3.5" />}
                  onClick={() => handleViewAttempts(exam)}
                >
                  View Sittings & Scores
                </Button>
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
    </div>
  )
}
