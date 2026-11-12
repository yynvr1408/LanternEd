import React, { useState } from 'react'
import { CheckCircle2, Code2, Play, Terminal, XCircle } from 'lucide-react'
import { Badge, Button, Textarea } from '../ui'
import { examService, type CodeRunResponse, type QuestionItemStudentView } from '../../services/examService'

interface CodingSandboxPanelProps {
  examId: string
  attemptId: string
  question: QuestionItemStudentView
  value: { language?: string; code?: string } | string | undefined
  onChange: (next: { language: string; code: string }) => void
}

const LANGUAGES = [
  { value: 'python', label: 'Python 3' },
  { value: 'javascript', label: 'JavaScript (Node / Local)' },
  { value: 'c', label: 'C (GCC)' },
  { value: 'cpp', label: 'C++ (G++)' },
]

export const CodingSandboxPanel: React.FC<CodingSandboxPanelProps> = ({
  examId,
  attemptId,
  question,
  value,
  onChange,
}) => {
  const defaultLang = question.code_harness?.language || 'python'
  const starter = question.code_harness?.starter_code || ''
  const currentLang = typeof value === 'object' && value?.language ? value.language : defaultLang
  const currentCode =
    typeof value === 'object' ? value.code ?? starter : typeof value === 'string' && value ? value : starter

  const [customStdin, setCustomStdin] = useState(
    question.code_harness?.sample_test_cases?.[0]?.stdin || ''
  )
  const [isRunning, setIsRunning] = useState(false)
  const [runResult, setRunResult] = useState<CodeRunResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const handleRunCode = async () => {
    setIsRunning(true)
    setRunError(null)
    try {
      const res = await examService.runCode(examId, {
        attempt_id: attemptId,
        question_id: question.id,
        language: currentLang,
        source_code: currentCode,
        stdin: customStdin,
      })
      setRunResult(res)
    } catch (err: any) {
      // Offline JS safe fallback evaluation when network drops during lab exam
      if (currentLang === 'javascript') {
        const logs: string[] = []
        const start = performance.now()
        try {
          const fakeConsole = { log: (...args: any[]) => logs.push(args.map(String).join(' ')) }
          const fn = new Function('console', 'stdin', currentCode)
          fn(fakeConsole, customStdin)
          setRunResult({
            language: 'javascript',
            compiler_available: true,
            compiled: true,
            timed_out: false,
            exit_code: 0,
            stdout: logs.join('\n'),
            stderr: '',
            runtime_ms: Math.max(1, Math.round(performance.now() - start)),
            test_results: [],
          })
        } catch (jsErr: any) {
          setRunResult({
            language: 'javascript',
            compiler_available: true,
            compiled: true,
            timed_out: false,
            exit_code: 1,
            stdout: logs.join('\n'),
            stderr: String(jsErr?.message || jsErr),
            runtime_ms: Math.max(1, Math.round(performance.now() - start)),
            test_results: [],
          })
        }
      } else {
        setRunError(
          err?.message || 'Code runner server offline. Your code draft is auto-saved locally and will be auto-graded when submitted.'
        )
      }
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-[#0F5B57]" />
          <label htmlFor={`lang-${question.id}`} className="text-xs font-bold text-[#202B2A]">
            Compiler / Runtime:
          </label>
          <select
            id={`lang-${question.id}`}
            value={currentLang}
            onChange={(e) => onChange({ language: e.target.value, code: currentCode })}
            className="text-xs border border-[#CBD7D1] rounded-lg px-2 py-1 bg-white font-semibold text-[#202B2A]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="primary" onClick={handleRunCode} isLoading={isRunning}>
          <Play className="w-3.5 h-3.5 mr-1.5" /> Run Code & Sample Tests
        </Button>
      </div>

      <Textarea
        aria-label="Solution Code Editor"
        rows={11}
        value={currentCode}
        onChange={(e) => onChange({ language: currentLang, code: e.target.value })}
        spellCheck={false}
        className="font-mono text-xs bg-[#121A19] text-[#E6F4F1] border-[#263836] leading-relaxed"
        placeholder="Write your solution here..."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#687775] block">Custom Stdin Input</label>
          <Textarea
            rows={3}
            value={customStdin}
            onChange={(e) => setCustomStdin(e.target.value)}
            className="font-mono text-xs"
            placeholder="e.g. 2 3"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#687775]">
            <Terminal className="w-3.5 h-3.5 text-[#0F5B57]" />
            <span>Execution Output</span>
            {runResult && (
              <Badge variant={runResult.exit_code === 0 && !runResult.timed_out ? 'success' : 'error'} size="sm">
                {runResult.timed_out ? 'TIMEOUT' : `exit ${runResult.exit_code ?? '?'} · ${runResult.runtime_ms}ms`}
              </Badge>
            )}
          </div>
          <pre className="p-3 rounded-xl border border-[#E1E8E4] bg-[#F8FAF7] font-mono text-[11px] min-h-[76px] max-h-40 overflow-y-auto whitespace-pre-wrap text-[#202B2A]">
            {runError
              ? runError
              : runResult
              ? [runResult.stdout, runResult.stderr ? `STDERR:\n${runResult.stderr}` : ''].filter(Boolean).join('\n') || '(no output)'
              : 'Click "Run Code & Sample Tests" to test your program inside the sandbox.'}
          </pre>
        </div>
      </div>

      {(question.code_harness?.sample_test_cases?.length ?? 0) > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-bold text-[#202B2A]">Sample Test Cases</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.code_harness?.sample_test_cases?.map((tc, i) => {
              const resMatch = runResult?.test_results?.find((r) => r.name === tc.name)
              return (
                <div key={i} className="p-2.5 rounded-xl border border-[#E1E8E4] bg-[#F8FAF7] text-[11px] space-y-1">
                  <div className="flex items-center justify-between font-bold text-[#202B2A]">
                    <span>{tc.name}</span>
                    {resMatch &&
                      (resMatch.passed ? (
                        <span className="inline-flex items-center gap-1 text-[#247A4D]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#B42318]">
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      ))}
                  </div>
                  <div className="font-mono text-[#687775]">stdin: {tc.stdin || '(empty)'}</div>
                  <div className="font-mono text-[#202B2A]">expected: {tc.expected_stdout}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
