import { apiRequest } from './apiClient'

export interface QuestionOption {
  id: string
  text: string
}

export interface CodeHarnessSampleCase {
  name: string
  stdin: string
  expected_stdout: string
}

export interface QuestionItemStudentView {
  id: string
  question_type: string
  prompt: string
  options: QuestionOption[]
  default_marks: number
  code_harness?: {
    language?: string
    starter_code?: string
    sample_test_cases?: CodeHarnessSampleCase[]
  }
}

export interface CodeRunResponse {
  language: string
  compiler_available: boolean
  compiled: boolean
  timed_out: boolean
  exit_code?: number | null
  stdout: string
  stderr: string
  runtime_ms: number
  test_results: Array<{
    name: string
    passed: boolean
    stdin: string
    expected_stdout: string
    actual_stdout: string
    stderr: string
    timed_out: boolean
    runtime_ms: number
  }>
}

export interface ProctorAttemptMonitor {
  attempt_id: string
  student_id: string
  student_name: string
  status: string
  started_at: string
  submitted_at?: string | null
  tab_blur_count: number
  is_flagged_for_review: boolean
  snapshot_count: number
  latest_snapshot_url?: string | null
  latest_event_type?: string | null
  latest_event_at?: string | null
  lockdown_active: boolean
}

export interface ExamSection {
  id: string
  title: string
  position: number
  marks_per_question: number
  questions_to_pick?: number | null
  question_bank_id?: string | null
}

export interface Exam {
  id: string
  course_id: string
  title: string
  instructions?: string | null
  duration_minutes: number
  start_window: string
  end_window: string
  total_marks: number
  shuffle_questions: boolean
  shuffle_options: boolean
  enforce_fullscreen: boolean
  max_tab_switches: number
  require_webcam_proctoring?: boolean
  require_device_lockdown?: boolean
  status: string
  sections: ExamSection[]
  created_at: string
}

export interface ExamStartResponse {
  attempt_id: string
  exam_id: string
  started_at: string
  duration_seconds: number
  enforce_fullscreen: boolean
  max_tab_switches: number
  require_webcam_proctoring?: boolean
  require_device_lockdown?: boolean
  questions: QuestionItemStudentView[]
  existing_responses: Record<string, any>
}

export interface ExamHeartbeatResponse {
  status: string
  saved_at: string
  remaining_seconds: number
  tab_blur_count: number
  warning?: string | null
}

export interface ExamSubmitResponse {
  attempt_id: string
  status: string
  submitted_at: string
  auto_graded_score: number
  pending_manual_evaluation: boolean
  receipt_hash: string
}

export interface ExamAttempt {
  id: string
  exam_id: string
  student_id: string
  student_name?: string | null
  started_at: string
  submitted_at?: string | null
  auto_graded_score: number
  manual_graded_score: number
  final_score?: number | null
  status: string
  tab_blur_count: number
  is_flagged_for_review: boolean
}

export interface QuestionBank {
  id: string
  course_id: string
  title: string
  description?: string | null
  item_count: number
  created_at: string
}

export const examService = {
  async listCourseExams(courseId: string): Promise<Exam[]> {
    return apiRequest<Exam[]>(`/courses/${courseId}/exams`)
  },

  async createExam(courseId: string, input: {
    title: string
    instructions?: string
    duration_minutes: number
    start_window: string
    end_window: string
    total_marks: number
    shuffle_questions?: boolean
    shuffle_options?: boolean
    enforce_fullscreen?: boolean
    max_tab_switches?: number
    require_webcam_proctoring?: boolean
    require_device_lockdown?: boolean
    sections: {
      title: string
      marks_per_question: number
      questions_to_pick?: number
      question_bank_id?: string
    }[]
  }): Promise<Exam> {
    return apiRequest<Exam>(`/courses/${courseId}/exams`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async startExam(examId: string): Promise<ExamStartResponse> {
    return apiRequest<ExamStartResponse>(`/exams/${examId}/start`, {
      method: 'POST',
    })
  },

  async sendHeartbeat(examId: string, input: {
    attempt_id: string
    answers: Record<string, any>
    event?: { type: string; timestamp?: string; duration_ms?: number }
  }): Promise<ExamHeartbeatResponse> {
    return apiRequest<ExamHeartbeatResponse>(`/exams/${examId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async submitExam(examId: string, input: {
    attempt_id: string
    final_answers: Record<string, any>
  }): Promise<ExamSubmitResponse> {
    return apiRequest<ExamSubmitResponse>(`/exams/${examId}/submit`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async listAttempts(examId: string): Promise<ExamAttempt[]> {
    return apiRequest<ExamAttempt[]>(`/exams/${examId}/attempts`)
  },

  async listQuestionBanks(courseId: string): Promise<QuestionBank[]> {
    return apiRequest<QuestionBank[]>(`/courses/${courseId}/question-banks`)
  },

  async createQuestionBank(courseId: string, input: { title: string; description?: string }): Promise<QuestionBank> {
    return apiRequest<QuestionBank>(`/courses/${courseId}/question-banks`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async addQuestionItem(bankId: string, input: {
    question_type: string
    prompt: string
    options?: { id: string; text: string }[]
    correct_answer: any
    code_harness?: Record<string, any>
    default_marks?: number
    bloom_level?: string
    course_outcome_tag?: string
    explanation?: string
  }): Promise<any> {
    return apiRequest<any>(`/question-banks/${bankId}/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async runCode(examId: string, input: {
    attempt_id?: string
    question_id?: string
    language: string
    source_code: string
    stdin?: string
  }): Promise<CodeRunResponse> {
    return apiRequest<CodeRunResponse>(`/exams/${examId}/run-code`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async uploadProctorSnapshot(examId: string, input: {
    attempt_id: string
    image_data_url: string
    face_detected: boolean
    camera_status: string
  }): Promise<{ recorded: boolean; event_id: string; captured_at: string }> {
    return apiRequest(`/exams/${examId}/proctor-snapshot`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async getProctorMonitor(examId: string): Promise<ProctorAttemptMonitor[]> {
    return apiRequest<ProctorAttemptMonitor[]>(`/exams/${examId}/proctor-monitor`)
  },

  async flagAttempt(examId: string, attemptId: string, input: { is_flagged: boolean; reason?: string }): Promise<ProctorAttemptMonitor> {
    return apiRequest<ProctorAttemptMonitor>(`/exams/${examId}/attempts/${attemptId}/flag`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}
