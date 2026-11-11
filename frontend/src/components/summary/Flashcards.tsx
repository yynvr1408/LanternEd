import React, { useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, RotateCw, Shuffle, XCircle } from 'lucide-react'
import type { SummaryDefinition, SummaryQuizQuestion } from '../../types'
import { Button } from '../ui/Button'

export interface FlashcardsProps {
  /** Term/definition pairs already extracted by the summary pipeline - no new AI call needed. */
  cards: SummaryDefinition[]
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const Flashcards: React.FC<FlashcardsProps> = ({ cards: initialCards }) => {
  const [cards, setCards] = useState(initialCards)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const card = cards[index]

  const goTo = (next: number) => {
    setIndex(((next % cards.length) + cards.length) % cards.length)
    setFlipped(false)
  }

  const handleShuffle = () => {
    setCards(shuffleArray(cards))
    setIndex(0)
    setFlipped(false)
  }

  if (!card) return null

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs font-semibold text-[#687775]">
        {index + 1} / {cards.length}
      </p>

      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        className="w-full min-h-[180px] flex items-center justify-center text-center p-6 rounded-2xl border-2 border-[#CBD7D1] bg-[#F8FAF7] hover:border-[#0F5B57] cursor-pointer transition-colors"
        aria-label={flipped ? 'Showing definition. Click to show the term.' : 'Showing term. Click to show the definition.'}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-[#0F5B57] mb-2">
            {flipped ? 'Definition' : 'Term'}
          </p>
          <p className="text-lg font-bold text-[#202B2A]">{flipped ? card.definition : card.term}</p>
        </div>
      </button>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        <Button variant="outline" size="sm" onClick={() => goTo(index - 1)} icon={<ChevronLeft className="w-4 h-4" />}>
          Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFlipped((v) => !v)} icon={<RotateCw className="w-4 h-4" />}>
          Flip
        </Button>
        <Button variant="outline" size="sm" onClick={handleShuffle} icon={<Shuffle className="w-4 h-4" />}>
          Shuffle
        </Button>
        <Button variant="primary" size="sm" onClick={() => goTo(index + 1)} icon={<ChevronRight className="w-4 h-4" />}>
          Next
        </Button>
      </div>
    </div>
  )
}

export interface OfflineQuizProps {
  /** Self-check MCQs bundled with the summary; works 100% offline with immediate explanation feedback. */
  questions: SummaryQuizQuestion[]
}

export const OfflineQuiz: React.FC<OfflineQuizProps> = ({ questions }) => {
  const [selectedByIdx, setSelectedByIdx] = useState<Record<number, number>>({})
  const [index, setIndex] = useState(0)

  const q = questions[index]
  if (!q) return null

  const picked = selectedByIdx[index]
  const answered = typeof picked === 'number'
  const correctCount = questions.reduce(
    (acc, item, idx) => (selectedByIdx[idx] === item.answer_index ? acc + 1 : acc),
    0,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-[#687775]">
        <span className="font-semibold">
          Question {index + 1} / {questions.length}
        </span>
        <span className="font-semibold text-[#0F5B57]">
          Score: {correctCount} / {questions.length}
        </span>
      </div>

      <p className="text-sm font-semibold text-[#202B2A] leading-relaxed">{q.question}</p>

      <div className="flex flex-col gap-2">
        {q.options.map((opt, optIdx) => {
          const isPicked = picked === optIdx
          const isRight = optIdx === q.answer_index
          let cls = 'border-[#CBD7D1] bg-[#F8FAF7] text-[#202B2A] hover:border-[#0F5B57]'
          if (answered) {
            if (isRight) cls = 'border-[#247A4D] bg-[#E5F5EB] text-[#166534] font-semibold'
            else if (isPicked) cls = 'border-[#B42318] bg-[#FDE8E7] text-[#911C13]'
          }
          return (
            <button
              key={optIdx}
              type="button"
              onClick={() => setSelectedByIdx((prev) => ({ ...prev, [index]: optIdx }))}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer ${cls}`}
            >
              <span>{opt}</span>
              {answered && isRight && <CheckCircle2 className="w-4 h-4 text-[#247A4D] shrink-0" />}
              {answered && isPicked && !isRight && <XCircle className="w-4 h-4 text-[#B42318] shrink-0" />}
            </button>
          )
        })}
      </div>

      {answered && q.explanation && (
        <div className="p-3 rounded-lg bg-[#F1F5F2] border border-[#CBD7D1] text-xs text-[#202B2A] leading-relaxed">
          <strong className="text-[#0F5B57]">Explanation:</strong> {q.explanation}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          icon={<ChevronLeft className="w-4 h-4" />}
        >
          Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSelectedByIdx({})}>
          Reset Quiz
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={index >= questions.length - 1}
          onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          icon={<ChevronRight className="w-4 h-4" />}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
