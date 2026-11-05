/** Course reports for teachers: JSON for the screen, CSV for the spreadsheet a head of department asks for. */

import { apiRequest, apiUrl, ApiError } from './apiClient'

export interface AttendanceReport {
  course_id: string
  course_title: string
  classes: { id: string; title: string; date: string }[]
  students: {
    student_id: string
    full_name: string
    email: string
    classes_attended: number
    classes_held: number
    percent: number | null
    minutes: number
    per_class: boolean[]
  }[]
}

/** Downloads an authenticated file (the cookie session rides along) and hands it to the browser's save dialog. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), { credentials: 'include' })
  } catch {
    throw new ApiError('Unable to connect to LanternEd server. Try again when you are online.', 0, true)
  }
  if (!response.ok) throw new ApiError('Could not download the report.', response.status)
  const url = URL.createObjectURL(await response.blob())
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000) // revoking at once can cancel the download in some browsers
  }
}

export const reportsApi = {
  attendance: (courseId: string) => apiRequest<AttendanceReport>(`/courses/${courseId}/reports/attendance`),
  downloadAttendanceCsv: (courseId: string) => downloadFile(`/courses/${courseId}/reports/attendance.csv`, 'attendance.csv'),
  downloadGradebookCsv: (courseId: string) => downloadFile(`/courses/${courseId}/reports/gradebook.csv`, 'gradebook.csv'),
}
