/**
 * Interoperability Service (SCORM 1.2 / 2004, H5P, xAPI / LRS, LTI 1.3).
 */

import { apiRequest } from './apiClient'
import { syncManager } from './syncManager'

export interface InteropPackage {
  id: string
  course_id: string
  standard: 'scorm_1_2' | 'scorm_2004' | 'h5p' | 'lti_1_3' | string
  title: string
  description?: string | null
  entry_point?: string | null
  launch_url?: string | null
  manifest_json: Record<string, any>
  checksum_sha256?: string | null
  created_at: string
}

export interface XapiStatementInput {
  course_id?: string
  verb: { id: string; display: Record<string, string> }
  object: { id: string; objectType?: string; definition?: { name: Record<string, string> } }
  result?: Record<string, any>
  context?: Record<string, any>
  timestamp?: string
}

export const interopService = {
  async listCoursePackages(courseId: string): Promise<InteropPackage[]> {
    return apiRequest<InteropPackage[]>(`/interop/courses/${courseId}/packages`)
  },

  async importPackageFile(courseId: string, file: File, title?: string): Promise<InteropPackage> {
    const form = new FormData()
    form.append('file', file)
    if (title?.trim()) {
      form.append('title', title.trim())
    }
    return apiRequest<InteropPackage>(`/interop/courses/${courseId}/import-package`, {
      method: 'POST',
      body: form,
    })
  },

  async registerLtiTool(input: {
    course_id: string
    title: string
    launch_url: string
    description?: string
  }): Promise<InteropPackage> {
    return apiRequest<InteropPackage>('/interop/lti/tools', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async requestLtiLaunch(packageId: string): Promise<{
    package_id: string
    title: string
    launch_url: string
    id_token: string
    expires_at: string
  }> {
    return apiRequest(`/interop/lti/launch/${packageId}`, {
      method: 'POST',
    })
  },

  /** Emits an xAPI statement to the LRS, queueing seamlessly in IndexedDB if offline. */
  async emitXapiStatement(statement: XapiStatementInput): Promise<{ queuedOffline: boolean }> {
    const stamped = { ...statement, timestamp: statement.timestamp || new Date().toISOString() }
    try {
      await apiRequest('/interop/xapi/statements', {
        method: 'POST',
        body: JSON.stringify({ statements: [stamped] }),
      })
      return { queuedOffline: false }
    } catch {
      await syncManager.enqueueXapiStatement(statement.course_id || 'global', stamped)
      return { queuedOffline: true }
    }
  },
}
