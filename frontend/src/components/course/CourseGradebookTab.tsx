import React, { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  Filter,
  Search,
  Settings,
  Sliders,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  gradebookService,
  type CourseGradebookSummary,
  type GradebookConfig,
} from '../../services/gradebookService'
import { Badge, Button, Dialog, FormField, Input, LoadingState } from '../ui'

interface CourseGradebookTabProps {
  courseId: string
}

export const CourseGradebookTab: React.FC<CourseGradebookTabProps> = ({ courseId }) => {
  const [summary, setSummary] = useState<CourseGradebookSummary | null>(null)
  const [config, setConfig] = useState<GradebookConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Config modal
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [weights, setWeights] = useState<Record<string, number>>({
    assignments: 0.3,
    quizzes: 0.2,
    midterms: 0.2,
    finals: 0.2,
    attendance: 0.1,
  })
  const [passingGrade, setPassingGrade] = useState(40)
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [sumData, cfgData] = await Promise.all([
        gradebookService.getCourseGradebookSummary(courseId),
        gradebookService.getGradebookConfig(courseId),
      ])
      setSummary(sumData)
      setConfig(cfgData)
      setWeights(cfgData.weights)
      setPassingGrade(cfgData.passing_grade_pct)
    } catch (err: any) {
      setError(err.message || 'Failed to load gradebook.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [courseId])

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingConfig(true)
    try {
      await gradebookService.updateGradebookConfig(courseId, {
        weights,
        drop_lowest_quizzes: config?.drop_lowest_quizzes ?? 1,
        passing_grade_pct: passingGrade,
      })
      setIsConfigOpen(false)
      loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to update weighting rules.')
    } finally {
      setIsSavingConfig(false)
    }
  }

  const exportGradebookCsv = () => {
    if (!summary || !summary.students.length) return
    const headers = [
      'Student Name',
      'Student Email',
      'Attendance %',
      'Assignments Score (%)',
      'Quizzes Score (%)',
      'Midterms Score (%)',
      'Finals Score (%)',
      'Cumulative Score (%)',
      'Letter Grade',
      'At-Risk Status',
    ]

    const rows = summary.students.map((s) => [
      `"${s.student_name}"`,
      s.student_email,
      s.attendance_pct,
      s.assignments_score,
      s.quizzes_score,
      s.midterms_score,
      s.finals_score,
      s.cumulative_score,
      s.letter_grade,
      s.is_at_risk ? 'AT_RISK' : 'NORMAL',
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${summary.course_title.replace(/[^a-zA-Z0-9]/g, '_')}_Gradebook.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isLoading) {
    return <LoadingState message="Computing Continuous Internal Assessment scores and weighting..." />
  }

  if (error || !summary) {
    return (
      <div className="p-6 bg-[#FDE8E7] text-[#B42318] rounded-xl text-xs font-semibold">
        {error || 'Unable to load course gradebook.'}
      </div>
    )
  }

  const filteredStudents = summary.students.filter(
    (s) =>
      s.student_name.toLowerCase().includes(search.toLowerCase()) ||
      s.student_email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#687775]">Enrolled Roster</span>
            <p className="text-xl font-bold text-[#202B2A]">{summary.roster_size} Students</p>
          </div>
          <Users className="w-6 h-6 text-[#0F5B57] opacity-80" />
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#687775]">Class Internal Average</span>
            <p className="text-xl font-bold text-[#202B2A]">{summary.class_average_pct}%</p>
          </div>
          <TrendingUp className="w-6 h-6 text-[#0F5B57] opacity-80" />
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#687775]">At-Risk Students</span>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-[#B42318]">{summary.at_risk_count}</p>
              {summary.at_risk_count > 0 && (
                <Badge variant="error" size="sm">
                  Action Required
                </Badge>
              )}
            </div>
          </div>
          <AlertTriangle className="w-6 h-6 text-[#B42318] opacity-80" />
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E1E8E4] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#687775]">Passing Threshold</span>
            <p className="text-xl font-bold text-[#202B2A]">{config?.passing_grade_pct ?? 40}% Min</p>
          </div>
          <Award className="w-6 h-6 text-[#0F5B57] opacity-80" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#E1E8E4] rounded-xl">
        <div className="sm:w-72">
          <Input
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-[#687775]" />}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Settings className="w-3.5 h-3.5" />}
            onClick={() => setIsConfigOpen(true)}
          >
            Syllabus Weighting
          </Button>

          <Button
            size="sm"
            variant="outline"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={exportGradebookCsv}
          >
            Export Gradebook (.CSV)
          </Button>
        </div>
      </div>

      {/* Roster Table */}
      <div className="overflow-x-auto border border-[#E1E8E4] rounded-xl bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#F8FAF7] border-b border-[#E1E8E4] text-[#687775] font-semibold">
              <th className="py-3 px-4">Student</th>
              <th className="py-3 px-3">Attendance</th>
              <th className="py-3 px-3">Assignments</th>
              <th className="py-3 px-3">Quizzes & Exams</th>
              <th className="py-3 px-3">Cumulative</th>
              <th className="py-3 px-3">Grade</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E1E8E4]">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#687775]">
                  No enrolled students match your search filter.
                </td>
              </tr>
            ) : (
              filteredStudents.map((s) => (
                <tr key={s.student_id} className="hover:bg-[#F9FBFA] transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-bold text-[#202B2A] block">{s.student_name}</span>
                    <span className="text-[11px] text-[#687775]">{s.student_email}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`font-semibold ${s.attendance_pct < 75 ? 'text-[#B42318]' : 'text-[#202B2A]'}`}>
                      {s.attendance_pct}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[#202B2A] font-semibold">{s.assignments_score}%</td>
                  <td className="py-3 px-3 text-[#202B2A] font-semibold">{s.quizzes_score}%</td>
                  <td className="py-3 px-3 font-bold text-[#0F5B57] text-sm">{s.cumulative_score}%</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded font-bold bg-[#E5F5EB] text-[#247A4D]">
                      {s.letter_grade}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {s.is_at_risk ? (
                      <Badge variant="error">At Risk (&lt;40%)</Badge>
                    ) : (
                      <Badge variant="success">On Track</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Weighting Configuration Modal */}
      <Dialog
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        title="Configure Continuous Assessment Weighting Formula"
        description="Set syllabus percentages for continuous internal assessment (CIA). Weights must sum to 100%."
        maxWidth="md"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Assignments Weight (%)" htmlFor="w-asg">
              <Input
                id="w-asg"
                type="number"
                min={0}
                max={100}
                value={Math.round((weights.assignments || 0) * 100)}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, assignments: Number(e.target.value) / 100 }))
                }
              />
            </FormField>

            <FormField label="Quizzes Weight (%)" htmlFor="w-quiz">
              <Input
                id="w-quiz"
                type="number"
                min={0}
                max={100}
                value={Math.round((weights.quizzes || 0) * 100)}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, quizzes: Number(e.target.value) / 100 }))
                }
              />
            </FormField>

            <FormField label="Midterms Weight (%)" htmlFor="w-mid">
              <Input
                id="w-mid"
                type="number"
                min={0}
                max={100}
                value={Math.round((weights.midterms || 0) * 100)}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, midterms: Number(e.target.value) / 100 }))
                }
              />
            </FormField>

            <FormField label="Finals Weight (%)" htmlFor="w-fin">
              <Input
                id="w-fin"
                type="number"
                min={0}
                max={100}
                value={Math.round((weights.finals || 0) * 100)}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, finals: Number(e.target.value) / 100 }))
                }
              />
            </FormField>

            <FormField label="Attendance Weight (%)" htmlFor="w-att">
              <Input
                id="w-att"
                type="number"
                min={0}
                max={100}
                value={Math.round((weights.attendance || 0) * 100)}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, attendance: Number(e.target.value) / 100 }))
                }
              />
            </FormField>

            <FormField label="Passing Score Threshold (%)" htmlFor="w-pass">
              <Input
                id="w-pass"
                type="number"
                min={0}
                max={100}
                value={passingGrade}
                onChange={(e) => setPassingGrade(Number(e.target.value))}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E8E4]">
            <Button variant="outline" size="sm" onClick={() => setIsConfigOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" isLoading={isSavingConfig}>
              Save Weighting Rules
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
