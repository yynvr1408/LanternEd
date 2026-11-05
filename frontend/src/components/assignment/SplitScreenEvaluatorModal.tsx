import React, { useState, useEffect } from 'react'
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Mic,
  Paperclip,
  Save,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react'
import { gradebookService, type Rubric } from '../../services/gradebookService'
import { assignmentService } from '../../services/assignmentService'
import { Badge, Button, Dialog, FormField, Input, Textarea } from '../ui'
import type { Submission } from '../../types'

interface SplitScreenEvaluatorModalProps {
  isOpen: boolean
  onClose: () => void
  submission: Submission | null
  courseId: string
  maxScore: number
  onGraded: () => void
}

export const SplitScreenEvaluatorModal: React.FC<SplitScreenEvaluatorModalProps> = ({
  isOpen,
  onClose,
  submission,
  courseId,
  maxScore,
  onGraded,
}) => {
  const [rubrics, setRubrics] = useState<Rubric[]>([])
  const [selectedRubric, setSelectedRubric] = useState<Rubric | null>(null)
  const [criterionScores, setCriterionScores] = useState<Record<string, number>>({})
  const [privateNotes, setPrivateNotes] = useState('')
  const [audioNoteUrl, setAudioNoteUrl] = useState('')
  const [isBlindGrading, setIsBlindGrading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !courseId) return
    gradebookService.listRubrics(courseId).then((rList) => {
      setRubrics(rList)
      if (rList.length > 0) {
        setSelectedRubric(rList[0])
      }
    }).catch(() => {})
  }, [isOpen, courseId])

  useEffect(() => {
    if (submission && selectedRubric) {
      // Default to initial criterion scores if previously graded
      const initial: Record<string, number> = {}
      selectedRubric.criteria.forEach((c, idx) => {
        initial[c.id || `crit_${idx}`] = c.max_score
      })
      setCriterionScores(initial)
    }
  }, [submission, selectedRubric])

  if (!submission) return null

  const calculatedTotal = Object.values(criterionScores).reduce((a, b) => a + b, 0)

  const handleScoreChange = (critId: string, pts: number) => {
    setCriterionScores((prev) => ({
      ...prev,
      [critId]: pts,
    }))
  }

  const handlePublish = async () => {
    setIsSaving(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await gradebookService.recordEvaluation(submission.id, {
        criterion_scores: criterionScores,
        total_score: calculatedTotal,
        audio_note_url: audioNoteUrl.trim() || undefined,
        private_staff_notes: privateNotes.trim() || undefined,
        published_to_student: true,
      })
      setSuccessMsg('Evaluation and rubric score saved successfully.')
      onGraded()
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      setError(err.message || 'Failed to save evaluation.')
    } finally {
      setIsSaving(false)
    }
  }

  const anonymizedStudentId = `STUDENT-HASH-${submission.student_id ? submission.student_id.slice(0, 8).toUpperCase() : 'ANON'}`

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Split-Screen Submission & Rubric Evaluation"
      description="Side-by-side grading workspace with interactive rubrics, blind scoring, and inline notes."
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[#202B2A]">
              {isBlindGrading ? anonymizedStudentId : submission.student_name || 'Student'}
            </span>
            <Badge variant="outline" size="sm">
              Submitted {new Date(submission.submitted_at).toLocaleDateString()}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBlindGrading((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A] hover:bg-[#F0F4F2] font-semibold transition-colors cursor-pointer"
            >
              {isBlindGrading ? <Eye className="w-3.5 h-3.5 text-[#0F5B57]" /> : <EyeOff className="w-3.5 h-3.5 text-[#687775]" />}
              <span>{isBlindGrading ? 'Blind Grading: ON' : 'Blind Grading: OFF'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[#FDE8E7] text-[#B42318] text-xs font-semibold">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-lg bg-[#E5F5EB] text-[#247A4D] text-xs font-semibold">
            {successMsg}
          </div>
        )}

        {/* 2-Column Split Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[600px]">
          {/* Left Panel: Submission Content & Files */}
          <div className="p-4 bg-white border border-[#E1E8E4] rounded-xl flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="border-b border-[#E1E8E4] pb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[#687775] uppercase tracking-wider">
                  Student Script / Answer
                </span>
                <span className="text-[11px] text-[#84908D]">Raw Submission Preview</span>
              </div>

              {/* Text answer */}
              <div className="p-3.5 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4] text-xs text-[#202B2A] whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
                {submission.content || <span className="text-[#84908D] italic">No inline text provided.</span>}
              </div>

              {/* Attached Artifacts */}
              {submission.attachments && submission.attachments.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#202B2A] block">Attached Submission Files:</span>
                  <ul className="space-y-1.5">
                    {submission.attachments.map((file) => (
                      <li
                        key={file.id}
                        className="p-2.5 rounded-lg border border-[#E1E8E4] bg-white flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Paperclip className="w-4 h-4 text-[#0F5B57] shrink-0" />
                          <span className="truncate font-semibold text-[#202B2A]">{file.filename}</span>
                        </div>
                        <a
                          href={assignmentService.attachmentDownloadUrl(submission.assignment_id, file.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 rounded bg-[#0F5B57] text-white text-[11px] font-semibold hover:bg-[#123B39]"
                        >
                          View File
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Private Notes */}
            <div className="pt-3 border-t border-[#E1E8E4] space-y-1">
              <label htmlFor="staff-notes" className="text-xs font-semibold text-[#687775]">Private Staff / Moderator Notes:</label>
              <textarea
                id="staff-notes"
                rows={2}
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
                placeholder="Notes visible only to instructors..."
                className="w-full text-xs p-2 rounded-lg border border-[#CBD7D1] focus:ring-1 focus:ring-[#0F5B57] outline-none"
              />
            </div>
          </div>

          {/* Right Panel: Interactive Rubrics & Scoring */}
          <div className="p-4 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="border-b border-[#E1E8E4] pb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[#687775] uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#0F5B57]" /> Rubric Criteria Scoring
                </span>
                <span className="text-sm font-bold text-[#0F5B57]">
                  Total: {calculatedTotal} / {maxScore} pts
                </span>
              </div>

              {selectedRubric ? (
                <div className="space-y-4">
                  {selectedRubric.criteria.map((c, idx) => {
                    const critKey = c.id || `crit_${idx}`
                    const currentScore = criterionScores[critKey] ?? c.max_score

                    return (
                      <div key={critKey} className="p-3 bg-white border border-[#E1E8E4] rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#202B2A]">{c.criterion_name}</span>
                          <span className="text-xs font-semibold text-[#0F5B57]">
                            {currentScore} / {c.max_score} pts
                          </span>
                        </div>

                        {/* Point level buttons */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {(c.levels.length > 0
                            ? c.levels
                            : [
                                { points: c.max_score, label: 'Exemplary' },
                                { points: Math.round(c.max_score * 0.75), label: 'Proficient' },
                                { points: Math.round(c.max_score * 0.5), label: 'Developing' },
                                { points: 0, label: 'Inadequate' },
                              ]
                          ).map((lvl, lIdx) => {
                            const isSelected = currentScore === lvl.points
                            return (
                              <button
                                key={lIdx}
                                type="button"
                                onClick={() => handleScoreChange(critKey, lvl.points)}
                                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#0F5B57] text-white border-[#0F5B57] shadow-xs'
                                    : 'bg-[#F8FAF7] text-[#202B2A] border-[#E1E8E4] hover:bg-[#E5F5EB]'
                                }`}
                              >
                                <span className="block text-[11px] font-bold">{lvl.points} pts</span>
                                <span className="block text-[9px] truncate opacity-90">{lvl.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-6 bg-white border border-dashed border-[#CBD7D1] rounded-xl text-center text-xs text-[#687775]">
                  <p>No rubric configured for this course yet.</p>
                  <p className="mt-1 text-[11px]">Using standard point scale ({maxScore} pts).</p>
                  <div className="mt-3">
                    <Input
                      type="number"
                      min={0}
                      max={maxScore}
                      value={criterionScores['default'] ?? calculatedTotal}
                      onChange={(e) => handleScoreChange('default', Number(e.target.value))}
                      className="text-center font-bold text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div className="pt-3 border-t border-[#E1E8E4] flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                isLoading={isSaving}
                onClick={handlePublish}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Publish Grade ({calculatedTotal} pts)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
