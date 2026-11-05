/**
 * Native Application Release Distribution & In-App Update Service
 *
 * Coordinates cross-platform binary installer downloads and automated in-app
 * update checks across Windows, macOS, Android, and iOS runtimes.
 */

import { platformAdapter, type OperatingSystem } from './platformAdapter'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || ''

export interface PlatformReleaseDetails {
  version: string
  fileName: string
  installerType: 'exe' | 'msi' | 'dmg' | 'apk' | 'ipa'
  downloadUrl: string
  fileSizeMb: number
  sha256: string
  minOsVersion: string
  arch: string
}

export interface ReleaseManifest {
  version: string
  releaseDate: string
  releaseNotes: string
  platforms: {
    windows?: PlatformReleaseDetails
    macos?: PlatformReleaseDetails
    android?: PlatformReleaseDetails
    ios?: PlatformReleaseDetails
  }
}

export interface UpdateCheckResult {
  has_update: boolean
  current_version: string
  latest_version: string
  platform: string
  download_url?: string
  file_name?: string
  file_size_mb?: number
  sha256?: string
  release_notes?: string
  is_critical?: boolean
}

export const APP_CURRENT_VERSION = '0.1.0'

export const releaseService = {
  getCurrentVersion(): string {
    return APP_CURRENT_VERSION
  },

  /** Fetches the full multi-platform release catalog. */
  async getManifest(): Promise<ReleaseManifest> {
    const res = await fetch(`${API_BASE}/api/v1/releases/manifest`)
    if (!res.ok) {
      throw new Error(`Failed to fetch release manifest: ${res.statusText}`)
    }
    return res.json()
  },

  /** Checks whether a newer native version is available for the active platform. */
  async checkForUpdates(
    currentVersion: string = APP_CURRENT_VERSION,
    targetPlatform?: OperatingSystem
  ): Promise<UpdateCheckResult> {
    const os = targetPlatform || platformAdapter.getOperatingSystem()
    const mappedPlatform = os === 'unknown' ? 'windows' : os

    const url = new URL(`${API_BASE}/api/v1/releases/check-update`, window.location.origin)
    url.searchParams.set('current_version', currentVersion)
    url.searchParams.set('platform', mappedPlatform)

    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new Error(`Update check failed: ${res.statusText}`)
    }
    return res.json()
  },

  /** Returns the direct installer download URL for a platform. */
  getDownloadUrl(platform: 'windows' | 'macos' | 'android' | 'ios'): string {
    return `${API_BASE}/api/v1/releases/download/${platform}`
  },
}
