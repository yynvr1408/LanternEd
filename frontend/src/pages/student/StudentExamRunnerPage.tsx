import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Maximize2,
  Minimize2,
  Save,
  Send,
  Shield,
  ShieldAlert,
} from 'lucide-react'
import { examService, type ExamStartResponse, type QuestionItemStudentView } from '../../services/examService'
import { Badge, Button, Dialog, LoadingState } from '../../components/ui'

export const StudentExamRunnerPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [examData, setExamData] = useState<ExamStartResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [currentIndex, setCurrentIndex] = useState(0)

  // Timer & Security
  const [secondsRemaining, setSecondsRemaining] = useState<number>(3600)
  const [tabBlurCount, setTabBlurCount] = useState<number>(0)
  const [securityWarning, setSecurityWarning] = useState<string | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string>('Just now')

  // Submission Modal
  const [isSubmitOpen, setIsSubmitOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedReceipt, setSubmittedReceipt] = useState<any | null>(null)

  const answersRef = useRef(answers)
  answersRef.current = answers

  // Initialize Exam
  useEffect(() => {
    if (!examId) return
    let mounted = true
    setIsLoading(true)

    examService
      .startExam(examId)
      .then((data) => {
        if (!mounted) return
        setExamData(data)
        setSecondsRemaining(data.duration_seconds)
        setAnswers(data.existing_responses || {})
        setIsLoading(false)

        // Request Fullscreen if enforced
        if (data.enforce_fullscreen && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {
            // User gesture required or blocked by browser settings
          })
        }
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.message || 'Failed to initialize examination.')
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [examId])

  // Countdown Timer
  useEffect(() => {
    if (isLoading || !examData || submittedReceipt) return
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          handleForceSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [isLoading, examData, submittedReceipt])

  // Periodic Auto-Save Heartbeat (every 20s)
  useEffect(() => {
    if (isLoading || !examData || !examId || submittedReceipt) return
    const heartbeat = setInterval(() => {
      saveProgress()
    }, 20000)
    return () => clearInterval(heartbeat)
  }, [isLoading, examData, examId, submittedReceipt])

  // Anti-Cheat: Visibility & Blur Detection
  useEffect(() => {
    if (isLoading || !examData || submittedReceipt) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logSecurityEvent('tab_hidden')
      }
    }

    const handleWindowBlur = () => {
      logSecurityEvent('window_blur')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [isLoading, examData, submittedReceipt])

  const saveProgress = async () => {
    if (!examId || !examData) return
    setIsAutoSaving(true)
    try {
      const res = await examService.sendHeartbeat(examId, {
        attempt_id: examData.attempt_id,
        answers: answersRef.current,
      })
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      if (res.warning) setSecurityWarning(res.warning)
    } catch {
      // offline silent queue
    } finally {
      setIsAutoSaving(false)
    }
  }

  const logSecurityEvent = async (type: string) => {
    if (!examId || !examData) return
    try {
      const res = await examService.sendHeartbeat(examId, {
        attempt_id: examData.attempt_id,
        answers: answersRef.current,
        event: { type, timestamp: new Date().toISOString() },
      })
      setTabBlurCount(res.tab_blur_count)
      if (res.warning) {
        setSecurityWarning(res.warning)
      } else {
        setSecurityWarning(`Security Notice: Tab navigation was logged. Fullscreen compliance is monitored.`)
      }
    } catch {
      setTabBlurCount((prev) => prev + 1)
    }
  }

  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }))
  }

  const toggleFlag = (questionId: string) => {
    setFlagged((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }))
  }

  const handleForceSubmit = () => {
    handleSubmitExam()
  }

  const handleSubmitExam = async () => {
    if (!examId || !examData) return
    setIsSubmitting(true)
    try {
      const res = await examService.submitExam(examId, {
        attempt_id: examData.attempt_id,
        final_answers: answersRef.current,
      })
      setSubmittedReceipt(res)
      setIsSubmitOpen(false)
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit examination.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F8F7] flex items-center justify-center p-4">
        <LoadingState message="Establishing secure proctored examination runner..." />
      </div>
    )
  }

  if (error || !examData) {
    return (
      <div className="min-h-screen bg-[#F5F8F7] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 bg-white border border-[#CBD7D1] rounded-2xl shadow-sm text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-[#B42318] mx-auto" />
          <h2 className="text-lg font-bold text-[#202B2A]">Examination Access Blocked</h2>
          <p className="text-xs text-[#687775]">{error || 'Unable to start examination attempt.'}</p>
          <Button onClick={() => navigate('/student/courses')}>Return to Courses</Button>
        </div>
      </div>
    )
  }

  // Post-submission confirmation receipt screen
  if (submittedReceipt) {
    return (
      <div className="min-h-screen bg-[#F5F8F7] flex items-center justify-center p-4">
        <div className="max-w-lg w-full p-8 bg-white border border-[#CBD7D1] rounded-2xl shadow-sm text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-[#E5F5EB] text-[#247A4D] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#202B2A]">Examination Submitted Successfully</h2>
            <p className="text-xs text-[#687775]">Your responses have been securely finalized and timestamped.</p>
          </div>

          <div className="p-4 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-[#687775]">Status:</span>
              <span className="font-semibold text-[#247A4D] uppercase">{submittedReceipt.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#687775]">Submission Time:</span>
              <span className="font-semibold text-[#202B2A]">
                {new Date(submittedReceipt.submitted_at).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#687775]">Objective Auto-Score:</span>
              <span className="font-bold text-[#0F5B57]">{submittedReceipt.auto_graded_score} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#687775]">Subjective Evaluation:</span>
              <span className="font-semibold text-[#202B2A]">
                {submittedReceipt.pending_manual_evaluation ? 'Pending Faculty Review' : 'Complete'}
              </span>
            </div>
            <div className="pt-2 border-t border-[#E1E8E4]">
              <span className="text-[11px] text-[#687775] block mb-0.5">Cryptographic Audit Hash:</span>
              <span className="font-mono text-[10px] break-all text-[#202B2A] bg-white p-1 rounded border border-[#E1E8E4] block">
                {submittedReceipt.receipt_hash}
              </span>
            </div>
          </div>

          <Button className="w-full" onClick={() => navigate('/student/courses')}>
            Return to Course Catalog
          </Button>
        </div>
      </div>
    )
  }

  const questions = examData.questions
  const currentQ: QuestionItemStudentView | undefined = questions[currentIndex]
  const totalQuestions = questions.length
  const answeredCount = Object.keys(answers).length
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="min-h-screen bg-[#F5F8F7] flex flex-col font-sans select-none">
      {/* Top Security & Timer Navigation Bar */}
      <header className="bg-white border-b border-[#E1E8E4] px-4 py-3 sticky top-0 z-30 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F5B57] text-white flex items-center justify-center font-bold text-sm">
            LX
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#202B2A] leading-tight">Proctored Examination Runner</h1>
            <div className="flex items-center gap-2 text-[11px] text-[#687775]">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-[#0F5B57]" /> Fullscreen Mode
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Save className={`w-3.5 h-3.5 ${isAutoSaving ? 'animate-spin text-[#0F5B57]' : 'text-[#687775]'}`} />
                {isAutoSaving ? 'Saving...' : `Auto-saved at ${lastSavedAt}`}
              </span>
            </div>
          </div>
        </div>

        {/* Center Timer */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono text-sm font-bold shadow-xs ${
              secondsRemaining < 300
                ? 'bg-[#FDE8E7] text-[#B42318] border-[#B42318]/30 animate-pulse'
                : 'bg-[#F8FAF7] text-[#202B2A] border-[#CBD7D1]'
            }`}
          >
            <Clock className="w-4 h-4 text-[#0F5B57]" />
            <span>{formatTime(secondsRemaining)}</span>
          </div>
        </div>

        {/* Right Action */}
        <div className="flex items-center gap-2">
          {tabBlurCount > 0 && (
            <Badge variant="warning" className="hidden sm:inline-flex">
              {tabBlurCount}/{examData.max_tab_switches} Blur Alerts
            </Badge>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsSubmitOpen(true)}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            Submit Exam
          </Button>
        </div>
      </header>

      {/* Security alert toast */}
      {securityWarning && (
        <div className="bg-[#FEF6EE] border-b border-[#FDB022] px-4 py-2 text-xs text-[#B54708] flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{securityWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setSecurityWarning(null)}
            className="text-[11px] font-bold underline hover:opacity-75"
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* Main Runner Body */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-6">
        {/* Left: Active Question Canvas */}
        <main className="bg-white border border-[#E1E8E4] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          {currentQ ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-[#E1E8E4]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[#0F5B57]">Question {currentIndex + 1} of {totalQuestions}</span>
                  <Badge variant="outline" size="sm">
                    {currentQ.default_marks} Point{currentQ.default_marks === 1 ? '' : 's'}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFlag(currentQ.id)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    flagged[currentQ.id]
                      ? 'bg-[#FEF6EE] text-[#B54708] border-[#FDB022]'
                      : 'bg-white text-[#687775] border-[#E1E8E4] hover:bg-[#F8FAF7]'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{flagged[currentQ.id] ? 'Flagged' : 'Flag for Review'}</span>
                </button>
              </div>

              {/* Prompt */}
              <div className="text-base text-[#202B2A] font-medium leading-relaxed">
                {currentQ.prompt}
              </div>

              {/* Options */}
              <div className="space-y-2.5 pt-2">
                {currentQ.options.map((opt) => {
                  const isSelected = answers[currentQ.id] === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectOption(currentQ.id, opt.id)}
                      className={`w-full p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#0F5B57] bg-[#F4FBF7] text-[#0F5B57] font-semibold ring-1 ring-[#0F5B57]'
                          : 'border-[#E1E8E4] bg-white text-[#202B2A] hover:bg-[#F9FBFA]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-[#0F5B57] bg-[#0F5B57]' : 'border-[#CBD7D1] bg-white'
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm">{opt.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-center py-12 text-[#687775]">No questions loaded.</p>
          )}

          {/* Navigation Footer */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-[#E1E8E4]">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            >
              Previous Question
            </Button>
            <div className="text-xs text-[#687775]">
              Answered <strong className="text-[#202B2A]">{answeredCount}</strong> of {totalQuestions}
            </div>
            {currentIndex < totalQuestions - 1 ? (
              <Button
                size="sm"
                onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              >
                Next Question
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsSubmitOpen(true)}
              >
                Review & Submit
              </Button>
            )}
          </div>
        </main>

        {/* Right: Question Navigation Palette */}
        <aside className="bg-white border border-[#E1E8E4] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-[#202B2A]">Question Palette</h3>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex
                const isAnswered = Boolean(answers[q.id])
                const isFlagged = Boolean(flagged[q.id])

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-lg text-xs font-bold transition-all relative flex items-center justify-center cursor-pointer ${
                      isCurrent
                        ? 'ring-2 ring-[#0F5B57] bg-[#0F5B57] text-white shadow-xs'
                        : isAnswered
                        ? 'bg-[#E5F5EB] text-[#247A4D] border border-[#A7E2C7]'
                        : 'bg-[#F8FAF7] text-[#687775] border border-[#E1E8E4] hover:bg-[#E1E8E4]'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#FDB022] border-2 border-white" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="pt-4 border-t border-[#E1E8E4] space-y-2 text-xs text-[#687775]">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-[#E5F5EB] border border-[#A7E2C7]" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-[#F8FAF7] border border-[#E1E8E4]" />
                <span>Unanswered ({totalQuestions - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-white border border-[#FDB022] relative flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FDB022]" />
                </div>
                <span>Flagged ({Object.values(flagged).filter(Boolean).length})</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#E1E8E4]">
            <Button
              className="w-full"
              variant="outline"
              size="sm"
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={() => setIsSubmitOpen(true)}
            >
              Finish Attempt
            </Button>
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Dialog */}
      <Dialog
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        title="Finalize & Submit Examination?"
        description="Once submitted, your answers cannot be modified."
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#687775]">Total Questions:</span>
              <span className="font-bold text-[#202B2A]">{totalQuestions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#687775]">Answered:</span>
              <span className="font-bold text-[#247A4D]">{answeredCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#687775]">Unanswered:</span>
              <span className="font-bold text-[#B42318]">{totalQuestions - answeredCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#687775]">Flagged for review:</span>
              <span className="font-bold text-[#B54708]">{Object.values(flagged).filter(Boolean).length}</span>
            </div>
          </div>

          <p className="text-[#687775]">
            Are you sure you want to finalize your attempt now?
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsSubmitOpen(false)}>
              Keep Working
            </Button>
            <Button
              size="sm"
              variant="primary"
              isLoading={isSubmitting}
              onClick={handleSubmitExam}
            >
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
