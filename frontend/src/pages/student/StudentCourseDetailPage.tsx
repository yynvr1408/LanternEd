import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  BookOpen,
  User,
  ArrowLeft,
  FileText,
  Video,
  Download,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
} from 'lucide-react'
import { api } from '../../services/apiClient'
import { courseService } from '../../services/courseService'
import { classService } from '../../services/classService'
import { assignmentService } from '../../services/assignmentService'
import { gradebookService, type StudentGradeSummary } from '../../services/gradebookService'
import { examService, type Exam } from '../../services/examService'
import { Award, Clock, Shield } from 'lucide-react'
import { downloadManager } from '../../services/downloadManager'
import { formatDueDate } from '../../utils/dates'
import type { Course, Lesson, ClassRoom, Assignment, Material } from '../../types'
import { PageContainer } from '../../components/layout/PageContainer'
import { Card, CardHeader, CardContent, Badge, Button, LoadingState, ErrorState } from '../../components/ui'
import { DownloadItem } from '../../components/download/DownloadItem'

export const StudentCourseDetailPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>()

  const [course, setCourse] = useState<Course | null>(null)
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [myGrade, setMyGrade] = useState<StudentGradeSummary | null>(null)
  const [courseExams, setCourseExams] = useState<Exam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      if (!courseId) return
      setIsLoading(true)
      setError(null)
      try {
        const [c, allCls, allAsg] = await Promise.all([
          courseService.getCourseById(courseId),
          classService.getClasses(),
          assignmentService.getAssignments(courseId),
        ])

        if (!isMounted) return
        setCourse(c)
        setClasses(allCls.filter((cl) => cl.course_id === courseId))
        setAssignments(allAsg)

        // Load CIA Grade & Exams
        gradebookService.getMyGrade(courseId).then((g) => isMounted && setMyGrade(g)).catch(() => {})
        examService.listCourseExams(courseId).then((exs) => isMounted && setCourseExams(exs)).catch(() => {})

        // Real materials uploaded by the course's teachers (empty until they publish some).
        const realMaterials = await api.getMaterials(courseId).catch(() => [] as Material[])
        if (isMounted) setMaterials(realMaterials)
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load course details')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadData()
    return () => {
      isMounted = false
    }
  }, [courseId])

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState message="Loading course curriculum and offline resources..." />
      </PageContainer>
    )
  }

  if (error || !course) {
    return (
      <PageContainer>
        <ErrorState
          title="Course Not Found"
          message={error || 'Unable to retrieve course details.'}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {/* Back button */}
      <div className="mb-4">
        <Link
          to="/student/courses"
          className="text-xs font-semibold text-[#687775] hover:text-[#0F5B57] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Courses
        </Link>
      </div>

      {/* Course Overview Card */}
      <div className="p-6 bg-[#FFFFFF] border border-[#E1E8E4] rounded-2xl mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className="font-mono">
            {course.code}
          </Badge>
          <Badge variant="secondary" size="sm">
            {course.lessons?.length || 0} Lessons
          </Badge>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202B2A] mb-2">
          {course.title}
        </h1>
        {course.teacher_name && (
          <p className="text-xs text-[#687775] flex items-center gap-1.5 mb-4">
            <User className="w-4 h-4 text-[#0F5B57]" /> Instructor: <strong className="text-[#202B2A]">{course.teacher_name}</strong>
          </p>
        )}
        <p className="text-sm text-[#687775] leading-relaxed max-w-3xl">
          {course.description || 'Comprehensive curriculum optimized for offline and low-bandwidth learning.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Lessons list */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <section>
            <h2 className="text-lg font-bold text-[#202B2A] mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#0F5B57]" /> Course Curriculum & Lessons
            </h2>

            {(!course.lessons || course.lessons.length === 0) ? (
              <div className="p-6 border border-dashed border-[#CBD7D1] bg-[#F8FAF7] rounded-xl text-center text-xs text-[#687775]">
                Lessons are being uploaded by the instructor.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {course.lessons.map((lesson) => (
                  <Link
                    key={lesson.id}
                    to={`/student/lessons/${lesson.id}`}
                    className="p-4 bg-[#FFFFFF] border border-[#E1E8E4] hover:border-[#CBD7D1] hover:bg-[#F8FAF7] rounded-xl flex items-center justify-between transition-colors group"
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#202B2A] group-hover:text-[#0F5B57] truncate">
                          {lesson.title}
                        </span>
                        {lesson.offline_ready && (
                          <Badge variant="secondary" size="sm" className="text-xs">
                            Offline Ready
                          </Badge>
                        )}
                      </div>
                      {lesson.description && (
                        <p className="text-xs text-[#687775] line-clamp-1">
                          {lesson.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#84908D] group-hover:text-[#0F5B57] shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Downloadable Course Materials */}
          <section>
            <h2 className="text-lg font-bold text-[#202B2A] mb-3 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#0F5B57]" /> Downloadable Course Materials
            </h2>
            <p className="text-xs text-[#687775] mb-4">
              Save study resources to your device's IndexedDB storage for offline reading and playback.
            </p>

            <div className="flex flex-col gap-2.5">
              {materials.map((m) => (
                <DownloadItem key={m.id} material={m} courseTitle={course.title} />
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Related Classes & Assignments */}
        <div className="flex flex-col gap-6">
          {/* Related Live / Scheduled Classes */}
          <Card>
            <CardHeader className="py-3 px-4 font-bold text-sm text-[#202B2A] flex items-center gap-2">
              <Video className="w-4 h-4 text-[#0F5B57]" /> Class Sessions
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-3">
              {classes.length === 0 ? (
                <p className="text-xs text-[#687775]">No class sessions currently scheduled.</p>
              ) : (
                classes.map((c) => (
                  <div key={c.id} className="p-3 bg-[#F1F5F2] border border-[#E1E8E4] rounded-lg flex flex-col gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant={c.status === 'LIVE' ? 'live' : 'secondary'} size="sm">
                        {c.status}
                      </Badge>
                      <span className="text-xs text-[#687775]">
                        {new Date(c.scheduled_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="font-semibold text-[#202B2A] line-clamp-1">{c.title}</p>
                    {c.status === 'LIVE' ? (
                      <Link to={`/classroom/${c.id}`} className="mt-1">
                        <Button size="sm" variant="primary" fullWidth>
                          Join Live Room
                        </Button>
                      </Link>
                    ) : c.status === 'ENDED' ? (
                      <Link to={`/student/classes/${c.id}/summary`} className="mt-1">
                        <Button size="sm" variant="outline" fullWidth>
                          View Summary
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Related Assignments */}
          <Card>
            <CardHeader className="py-3 px-4 font-bold text-sm text-[#202B2A] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0F5B57]" /> Course Tasks
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-3">
              {assignments.length === 0 ? (
                <p className="text-xs text-[#687775]">No assignments assigned yet.</p>
              ) : (
                assignments.map((a) => (
                  <div key={a.id} className="p-3 border border-[#E1E8E4] bg-[#FFFFFF] rounded-lg flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#202B2A] line-clamp-1">{a.title}</span>
                      {a.my_submission ? (
                        <Badge variant="success" size="sm">Submitted</Badge>
                      ) : (
                        <Badge variant="outline" size="sm">{a.due_date ? `Due ${formatDueDate(a.due_date)}` : 'No due date'}</Badge>
                      )}
                    </div>
                    <Link to={`/student/assignments/${a.id}`} className="mt-1">
                      <Button size="sm" variant={a.my_submission ? 'secondary' : 'outline'} fullWidth>
                        {a.my_submission ? 'Review Answer' : 'Open Draft'}
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Continuous Internal Assessment (CIA) Grade Summary */}
          {myGrade && (
            <Card>
              <CardHeader className="py-3 px-4 font-bold text-sm text-[#202B2A] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#0F5B57]" /> Internal Grade
                </span>
                <span className="px-2 py-0.5 rounded font-bold text-xs bg-[#E5F5EB] text-[#247A4D]">
                  Grade: {myGrade.letter_grade}
                </span>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-[#687775]">Cumulative Score:</span>
                  <span className="font-bold text-sm text-[#0F5B57]">{myGrade.cumulative_score}%</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#687775]">Attendance:</span>
                  <span className={`font-semibold ${myGrade.attendance_pct < 75 ? 'text-[#B42318]' : 'text-[#202B2A]'}`}>
                    {myGrade.attendance_pct}%
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[#687775]">Tasks & Quizzes:</span>
                  <span className="font-semibold text-[#202B2A]">
                    {myGrade.assignments_score}% avg
                  </span>
                </div>
                {myGrade.is_at_risk && (
                  <div className="p-2 bg-[#FDE8E7] text-[#B42318] rounded font-medium text-[11px] mt-1">
                    Academic Alert: Your cumulative score or attendance is below threshold. Contact faculty mentor.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Proctored Examinations & Quizzes */}
          <Card>
            <CardHeader className="py-3 px-4 font-bold text-sm text-[#202B2A] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0F5B57]" /> Examinations
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-3">
              {courseExams.length === 0 ? (
                <p className="text-xs text-[#687775]">No examinations published for this course.</p>
              ) : (
                courseExams.map((ex) => (
                  <div key={ex.id} className="p-3 border border-[#E1E8E4] bg-[#FFFFFF] rounded-lg flex flex-col gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#202B2A] line-clamp-1">{ex.title}</span>
                      <Badge variant="outline" size="sm">{ex.duration_minutes}m</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[#687775] text-[11px]">
                      <Shield className="w-3.5 h-3.5 text-[#0F5B57]" />
                      <span>{ex.enforce_fullscreen ? 'Fullscreen Protected' : 'Standard'}</span>
                      <span>•</span>
                      <span>{ex.total_marks} Pts</span>
                    </div>
                    <Link to={`/student/exams/${ex.id}/take`} className="mt-1">
                      <Button size="sm" variant="primary" fullWidth>
                        Take Examination
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
