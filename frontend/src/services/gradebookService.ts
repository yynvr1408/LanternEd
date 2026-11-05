import { apiRequest } from './apiClient'

export interface GradebookConfig {
  id: string
  course_id: string
  weights: Record<string, number>
  drop_lowest_quizzes: number
  passing_grade_pct: number
  updated_at: string
}

export interface StudentGradeSummary {
  student_id: string
  student_name: string
  student_email: string
  attendance_pct: number
  assignments_score: number
  quizzes_score: number
  midterms_score: number
  finals_score: number
  cumulative_score: number
  letter_grade: string
  is_at_risk: boolean
}

export interface CourseGradebookSummary {
  course_id: string
  course_title: string
  weights: Record<string, number>
  roster_size: number
  at_risk_count: number
  class_average_pct: number
  students: StudentGradeSummary[]
}

export interface RubricLevel {
  points: number
  label: string
  description?: string
}

export interface RubricCriterion {
  id?: string
  criterion_name: string
  max_score: number
  position: number
  levels: RubricLevel[]
}

export interface Rubric {
  id: string
  course_id: string
  title: string
  total_points: number
  criteria: RubricCriterion[]
  created_at: string
}

export interface EvaluationFeedback {
  id: string
  submission_id: string
  evaluator_id: string
  criterion_scores: Record<string, number>
  total_score: number
  annotated_pdf_url?: string
  audio_note_url?: string
  private_staff_notes?: string
  published_to_student: boolean
  evaluated_at: string
}

export const gradebookService = {
  async getGradebookConfig(courseId: string): Promise<GradebookConfig> {
    return apiRequest<GradebookConfig>(`/courses/${courseId}/gradebook/config`)
  },

  async updateGradebookConfig(courseId: string, input: { weights: Record<string, number>; drop_lowest_quizzes: number; passing_grade_pct: number }): Promise<GradebookConfig> {
    return apiRequest<GradebookConfig>(`/courses/${courseId}/gradebook/config`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },

  async getCourseGradebookSummary(courseId: string): Promise<CourseGradebookSummary> {
    return apiRequest<CourseGradebookSummary>(`/courses/${courseId}/gradebook/summary`)
  },

  async getMyGrade(courseId: string): Promise<StudentGradeSummary> {
    return apiRequest<StudentGradeSummary>(`/courses/${courseId}/gradebook/my-grade`)
  },

  async listRubrics(courseId: string): Promise<Rubric[]> {
    return apiRequest<Rubric[]>(`/courses/${courseId}/rubrics`)
  },

  async createRubric(courseId: string, input: { title: string; total_points: number; criteria: Omit<RubricCriterion, 'id'>[] }): Promise<Rubric> {
    return apiRequest<Rubric>(`/courses/${courseId}/rubrics`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async recordEvaluation(submissionId: string, input: {
    criterion_scores: Record<string, number>
    total_score: number
    annotated_pdf_url?: string
    audio_note_url?: string
    private_staff_notes?: string
    published_to_student?: boolean
  }): Promise<EvaluationFeedback> {
    return apiRequest<EvaluationFeedback>(`/submissions/${submissionId}/evaluation`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}
