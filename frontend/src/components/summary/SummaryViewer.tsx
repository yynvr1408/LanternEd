import React from 'react'
import {
  Sparkles,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  BookMarked,
  Lightbulb,
  FileText,
  Layers,
  Volume2,
  StopCircle,
  Share2,
} from 'lucide-react'
import type { Summary } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { Flashcards, OfflineQuiz } from './Flashcards'
import { useReadAloud } from '../../hooks/useReadAloud'
import { exportSummary, buildSummaryBlocks } from '../../utils/summaryExport'
import { downloadManager } from '../../services/downloadManager'
import { platformAdapter } from '../../services/platformAdapter'
import type { SummaryQuizQuestion } from '../../types'

export interface SummaryViewerProps {
  summary: Summary
  isCompact?: boolean
  onReview?: () => void
  isTeacher?: boolean
}

export const SummaryViewer: React.FC<SummaryViewerProps> = ({
  summary,
  isCompact = false,
  onReview,
  isTeacher = false,
}) => {
  const isApproved = summary.review_status === 'APPROVED'
  const isPendingReview = summary.review_status === 'PENDING'
  const isRevisionRequested = summary.review_status === 'REVISION_REQUESTED'

  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)
  const [flashcardsOpen, setFlashcardsOpen] = React.useState(false)
  const [quizOpen, setQuizOpen] = React.useState(false)
  const [isAudioDownloaded, setIsAudioDownloaded] = React.useState(false)
  const [isDownloadingAudio, setIsDownloadingAudio] = React.useState(false)

  React.useEffect(() => {
    if (!summary?.class_id) return
    downloadManager.getDownloadedSummaryForClass(summary.class_id).then((saved) => {
      if (saved) setIsAudioDownloaded(true)
    }).catch(() => {})
  }, [summary?.class_id])

  const handleDownloadAudioRecap = async () => {
    try {
      setIsDownloadingAudio(true)
      await downloadManager.downloadSummary(summary, `Lecture Summary - ${summary.class_id}`)
      setIsAudioDownloaded(true)
    } catch (err) {
      console.error('Failed to download recap for offline:', err)
    } finally {
      setIsDownloadingAudio(false)
    }
  }
  const hasFlashcards = Boolean(summary.definitions && summary.definitions.length > 0)
  const quizQuestions: SummaryQuizQuestion[] = React.useMemo(() => {
    if (summary.quiz_questions && summary.quiz_questions.length > 0) {
      return summary.quiz_questions
    }
    if (!summary.definitions || summary.definitions.length === 0) return []
    const terms = summary.definitions.map((d) => d.term).filter(Boolean)
    return summary.definitions
      .filter((d) => d.term && d.definition)
      .slice(0, 4)
      .map((d, idx) => {
        const distractors = terms.filter((t) => t !== d.term).slice(0, 3)
        while (distractors.length < 3) {
          distractors.push(`Concept ${distractors.length + 1}`)
        }
        const options = [d.term, ...distractors]
        const shift = idx % options.length
        const rotated = [...options.slice(shift), ...options.slice(0, shift)]
        return {
          question: `Which key term matches: "${d.definition}"?`,
          options: rotated,
          answer_index: rotated.indexOf(d.term),
          explanation: `${d.term}: ${d.definition}`,
        }
      })
  }, [summary.quiz_questions, summary.definitions])
  const hasQuiz = quizQuestions.length > 0
  const reader = useReadAloud()
  const handleToggleReadAloud = () => {
    if (reader.isReading) {
      reader.stop()
    } else {
      reader.read(buildSummaryBlocks(summary).map((b) => b.text).join('. '))
    }
  }

  const handleDownload = async () => {
    setExporting(true)
    setExportError(null)
    const result = await exportSummary(summary)
    if (!result.ok) {
      setExportError('Could not create the file. Please try again.')
    }
    setExporting(false)
  }

  const handleNativeShare = async () => {
    const blocks = buildSummaryBlocks(summary)
    const text = blocks.map((b) => (b.kind === 'bullet' ? `- ${b.text}` : b.text)).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    await platformAdapter.shareArtifact({
      title: 'LanternED Lecture Summary',
      text: summary.overview || text.slice(0, 300),
      fileName: `lanterned-summary-${summary.class_id}.txt`,
      contentType: 'text/plain',
      blob,
    })
  }

  return (
    <div className={`flex flex-col gap-4 ${isCompact ? 'text-xs' : 'text-sm'}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-[#F1F5F2] border border-[#E1E8E4] rounded-xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#DDF3EA] border border-[#CBD7D1] flex items-center justify-center text-[#0F5B57]">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-semibold text-[#202B2A]">
            {isCompact ? 'Live Lecture Notes' : 'AI-Assisted Lecture Summary'}
          </span>
          <Badge
            variant={
              isApproved ? 'success' : isRevisionRequested ? 'warning' : 'secondary'
            }
            size="sm"
          >
            {isApproved ? 'Teacher Approved' : isRevisionRequested ? 'Revision Requested' : 'Pending Review'}
          </Badge>
          {summary.status === 'PROCESSING' && (
            <Badge variant="warning" size="sm" className="flex items-center gap-1">
              <Clock className="w-3 h-3 animate-spin" />
              Synthesizing...
            </Badge>
          )}
          {summary.status === 'FAILED' && (
            <Badge variant="error" size="sm" className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              AI Error
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {reader.supported && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleReadAloud}
              icon={reader.isReading ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            >
              {reader.isReading ? 'Stop Reading' : 'Read Aloud'}
            </Button>
          )}
          {hasFlashcards && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFlashcardsOpen(true)}
              icon={<Layers className="w-3.5 h-3.5" />}
            >
              Study Flashcards
            </Button>
          )}
          {hasQuiz && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuizOpen(true)}
              icon={<HelpCircle className="w-3.5 h-3.5" />}
            >
              Practice Quiz
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            isLoading={exporting}
            disabled={exporting}
            onClick={handleDownload}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Download Notes
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleNativeShare()}
            icon={<Share2 className="w-3.5 h-3.5" />}
          >
            Share Note
          </Button>

          {isTeacher && onReview && (
            <Button size="sm" variant="primary" onClick={onReview}>
              Review & Edit
            </Button>
          )}
        </div>
      </div>

      {summary.status === 'PROCESSING' && (
        <div className="p-3 bg-[#E8F3FC] text-[#2364AA] border border-[#2364AA]/30 rounded-xl flex items-center gap-2.5 text-xs" role="status">
          <Clock className="w-4 h-4 animate-spin shrink-0" />
          <span>AI Lecture Summary is currently being synthesized. Audio transcription is processing in background...</span>
        </div>
      )}

      {summary.status === 'FAILED' && (
        <div className="p-3 bg-[#FDE8E7] text-[#B42318] border border-[#B42318]/30 rounded-xl flex items-center gap-2.5 text-xs" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Automated transcription/summary incomplete (AI provider offline or credentials missing). Notes remain editable.</span>
        </div>
      )}

      {exportError && (
        <div className="p-3 bg-[#FDE8E7] border border-[#B42318]/30 rounded-lg text-xs text-[#B42318]" role="alert">
          {exportError}
        </div>
      )}

      {/* Teacher notice banner */}
      {!isApproved && (
        <div className="p-3 bg-[#FFF0CB] border border-[#CBD7D1] rounded-lg text-xs text-[#8A5700] flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0 text-[#8A5700]" />
          <span>
            {isPendingReview
              ? 'This summary was synthesized from the lecture audio and is pending teacher validation.'
              : 'The teacher has requested revisions for this lecture recap.'}
          </span>
        </div>
      )}

      {/* ElevenLabs Low-Data Audio Recap */}
      {summary.audio_recap_url && (isApproved || summary.is_approved || isTeacher) && (
        <div className="p-3.5 bg-[#F1F5F2] border border-[#0F5B57]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="text-xs font-semibold text-[#0F5B57] flex items-center gap-1.5">
              <span>🎧 2-Min Audio Recap (ElevenLabs) • Low-Data (~1.2 MB)</span>
            </span>
            <audio
              controls
              src={summary.audio_recap_url}
              className="h-8 w-full max-w-md"
              preload="metadata"
            >
              Your browser does not support the audio element.
            </audio>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadAudioRecap}
              isLoading={isDownloadingAudio}
              disabled={isAudioDownloaded || isDownloadingAudio}
              icon={<Download className="w-3.5 h-3.5" />}
              className="text-xs whitespace-nowrap"
            >
              {isAudioDownloaded ? 'Saved for Offline' : 'Download for Offline'}
            </Button>
          </div>
        </div>
      )}

      {/* Overview */}
      {summary.overview && (
        <Card>
          <CardHeader className="py-2.5 px-4 font-semibold text-xs text-[#687775] flex items-center gap-2 border-b border-[#E1E8E4]">
            <FileText className="w-4 h-4 text-[#0F5B57]" />
            Overview
          </CardHeader>
          <CardContent className="py-3 px-4 text-[#202B2A] leading-relaxed">
            {summary.overview}
          </CardContent>
        </Card>
      )}

      {/* Key Concepts */}
      {summary.key_concepts && summary.key_concepts.length > 0 && (
        <Card>
          <CardHeader className="py-2.5 px-4 font-semibold text-xs text-[#687775] flex items-center gap-2 border-b border-[#E1E8E4]">
            <Lightbulb className="w-4 h-4 text-[#0F5B57]" />
            Key Concepts
          </CardHeader>
          <CardContent className="py-3 px-4">
            <ul className="list-disc pl-5 flex flex-col gap-1.5 text-[#202B2A]">
              {summary.key_concepts.map((concept, idx) => (
                <li key={idx} className="leading-relaxed">
                  {concept}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Definitions */}
      {summary.definitions && summary.definitions.length > 0 && (
        <Card>
          <CardHeader className="py-2.5 px-4 font-semibold text-xs text-[#687775] flex items-center gap-2 border-b border-[#E1E8E4]">
            <BookMarked className="w-4 h-4 text-[#0F5B57]" />
            Key Definitions & Terms
          </CardHeader>
          <CardContent className="py-3 px-4 flex flex-col gap-2.5">
            {summary.definitions.map((item, idx) => (
              <div key={idx} className="border-b border-[#E1E8E4] pb-2 last:border-0 last:pb-0">
                <span className="font-semibold text-[#202B2A] block mb-0.5">{item.term}</span>
                <p className="text-xs text-[#687775] leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Revision Questions */}
      {summary.revision_questions && summary.revision_questions.length > 0 && (
        <Card>
          <CardHeader className="py-2.5 px-4 font-semibold text-xs text-[#687775] flex items-center gap-2 border-b border-[#E1E8E4]">
            <HelpCircle className="w-4 h-4 text-[#2364AA]" />
            Revision & Self-Assessment Questions
          </CardHeader>
          <CardContent className="py-3 px-4">
            <ol className="list-decimal pl-5 flex flex-col gap-2 text-[#202B2A]">
              {summary.revision_questions.map((q, idx) => (
                <li key={idx} className="leading-relaxed pl-1">
                  {q}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {hasFlashcards && (
        <Dialog isOpen={flashcardsOpen} onClose={() => setFlashcardsOpen(false)} title="Study Flashcards" maxWidth="md">
          <Flashcards cards={summary.definitions!} />
        </Dialog>
      )}
      {hasQuiz && (
        <Dialog isOpen={quizOpen} onClose={() => setQuizOpen(false)} title="Offline Practice Quiz" maxWidth="md">
          <OfflineQuiz questions={quizQuestions} />
        </Dialog>
      )}
    </div>
  )
}
