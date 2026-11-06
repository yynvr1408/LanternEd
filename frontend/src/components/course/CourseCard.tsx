import React from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, User, ArrowRight, CheckCircle2, Layers } from 'lucide-react'
import type { Course } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export interface CourseCardProps {
  course: Course
  isTeacher?: boolean
  /** Student catalog: while not enrolled, the footer button reads Enroll; after enrolling it becomes View Course. */
  enroll?: { enrolled: boolean; isEnrolling: boolean; onEnroll: () => void }
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, isTeacher = false, enroll }) => {
  const detailLink = isTeacher
    ? `/teacher/courses/${course.id}/manage`
    : `/student/courses/${course.id}`

  const lessonCount = course.lessons_count ?? course.lessons?.length ?? 0

  return (
    <div className="bg-[#FFFFFF] border border-[#E1E8E4] rounded-xl p-4 sm:p-4.5 flex flex-col justify-between h-full hover:border-[#CBD7D1] hover:shadow-[0_4px_12px_rgba(32,43,42,0.06)] transition-all shadow-[0_1px_3px_rgba(32,43,42,0.03)] group">
      <div>
        {/* Top Meta Bar */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <Badge variant="outline" size="sm" className="font-mono text-[11px] font-semibold text-[#0F5B57] bg-[#DDF3EA]/60 border-[#0F5B57]/20">
            {course.code || 'CRS'}
          </Badge>
          <span className="text-[11px] text-[#687775] flex items-center gap-1 font-medium bg-[#F8FAF7] border border-[#E1E8E4] px-2 py-0.5 rounded-md">
            <BookOpen className="w-3 h-3 text-[#0F5B57]" />
            {lessonCount} {lessonCount === 1 ? 'Lesson' : 'Lessons'}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-bold text-sm sm:text-[15px] text-[#202B2A] line-clamp-1 leading-snug group-hover:text-[#0F5B57] transition-colors">
          {course.title}
        </h3>

        {/* Faculty / Instructor */}
        {course.teacher_name && (
          <p className="text-xs text-[#687775] flex items-center gap-1.5 mt-1.5 mb-2 font-medium">
            <User className="w-3.5 h-3.5 shrink-0 text-[#84908D]" />
            <span className="truncate">{course.teacher_name}</span>
          </p>
        )}

        {/* Description - Compact 2 lines */}
        <p className="text-xs text-[#687775] line-clamp-2 leading-relaxed mt-1">
          {course.description || 'Comprehensive curriculum engineered for low-bandwidth rural learning.'}
        </p>
      </div>

      {/* Compact Action Footer */}
      <div className="pt-3 mt-3 border-t border-[#E1E8E4] flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#84908D] font-medium flex items-center gap-1">
          {isTeacher ? (
            <>
              <Layers className="w-3 h-3 text-[#0F5B57]" />
              <span>Curriculum</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 text-[#247A4D]" />
              <span>Offline Ready</span>
            </>
          )}
        </span>

        {enroll && !enroll.enrolled ? (
          <Button size="sm" variant="primary" isLoading={enroll.isEnrolling} onClick={enroll.onEnroll} className="h-8 text-xs px-3">
            Enroll
          </Button>
        ) : (
          <Link to={detailLink}>
            <Button size="sm" variant={isTeacher ? 'outline' : 'primary'} icon={<ArrowRight className="w-3 h-3" />} className="h-8 text-xs px-3">
              {isTeacher ? 'Manage' : 'View Course'}
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
