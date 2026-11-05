import React, { useState, useEffect } from 'react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { FormField } from '../ui/FormField'
import { Textarea } from '../ui/Textarea'
import type { Summary } from '../../types'
import { summaryService } from '../../services/summaryService'

export interface SummaryReviewModalProps {
  summary: Summary | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const SummaryReviewModal: React.FC<SummaryReviewModalProps> = ({
  summary,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [overview, setOverview] = useState(summary?.overview || '')
  const [teacherNotes, setTeacherNotes] = useState(summary?.teacher_notes || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (summary) {
      setOverview(summary.overview || '')
      setTeacherNotes(summary.teacher_notes || '')
    }
  }, [summary])

  if (!summary) return null

  const handleReview = async (action: 'APPROVE' | 'REVISE') => {
    setIsSubmitting(true)
    setError(null)
    try {
      await summaryService.reviewSummary(summary.id, {
        action,
        overview,
        teacher_notes: teacherNotes,
        key_concepts: summary.key_concepts,
        revision_questions: summary.revision_questions,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update review status')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Review AI Lecture Summary"
      description="Verify and edit the synthesized overview, formulas, and revision questions before publishing to students."
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4 text-xs">
        {error && (
          <div className="p-3 bg-[#FDE8E7] text-[#B42318] border border-[#B42318]/30 rounded-lg font-medium">
            {error}
          </div>
        )}

        {summary.audio_recap_url && (
          <div className="p-3 bg-[#F1F5F2] border border-[#CBD7D1] rounded-xl flex flex-col gap-2">
            <span className="font-semibold text-[#0F5B57] flex items-center gap-1.5">
              <span>🎧 ElevenLabs Audio Recap Preview (~2 Min)</span>
            </span>
            <audio
              controls
              src={summary.audio_recap_url}
              className="w-full h-8"
              preload="metadata"
            >
              Your browser does not support the audio element.
            </audio>
            <span className="text-[11px] text-[#687775]">
              Listen to the synthesized audio recap before approving it for student access.
            </span>
          </div>
        )}

        <FormField label="Lecture Overview & Core Themes">
          <Textarea
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
            rows={5}
            placeholder="Edit lecture summary overview..."
          />
        </FormField>

        <FormField label="Teacher Notes & Guidance">
          <Textarea
            value={teacherNotes}
            onChange={(e) => setTeacherNotes(e.target.value)}
            rows={3}
            placeholder="Add specific hints or instructions for students..."
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E1E8E4]">
          <Button
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleReview('REVISE')}
          >
            Request Revision
          </Button>

          <Button
            size="sm"
            variant="primary"
            isLoading={isSubmitting}
            onClick={() => handleReview('APPROVE')}
          >
            Approve & Publish
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
