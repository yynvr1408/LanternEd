/**
 * Native Application Release Distribution & In-App Update Service
 *
 * Coordinates cross-platform binary installer downloads and automated in-app
 * update checks across Windows, macOS, Android, and iOS runtimes.
 */

import { platformAdapter, type OperatingSystem } from './platformAdapter'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000'
const RAW_SOURCE_MANIFEST = 'https://raw.githubusercontent.com/yynvr1408/LanternEd/main/releases/manifest.json'
const RAW_MIRROR_MANIFEST = 'https://raw.githubusercontent.com/yynvr1408/LanternEd-App-Releases/main/manifest.json'

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

export const APP_CURRENT_VERSION = '0.1.7'

export function parseSemverTuple(raw: string): [number, number, number] {
  const cleaned = String(raw || '').replace(/^v/i, '').split('-')[0].trim()
  const parts = cleaned.split('.')
  const n0 = Number.parseInt(parts[0] || '0', 10)
  const n1 = Number.parseInt(parts[1] || '0', 10)
  const n2 = Number.parseInt(parts[2] || '0', 10)
  return [Number.isFinite(n0) ? n0 : 0, Number.isFinite(n1) ? n1 : 0, Number.isFinite(n2) ? n2 : 0]
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemverTuple(a)
  const pb = parseSemverTuple(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

export const releaseService = {
  getCurrentVersion(): string {
    return APP_CURRENT_VERSION
  },

  /** Fetches the multi-platform release catalog (API first, then raw GitHub fallback). */
  async getManifest(): Promise<ReleaseManifest> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/releases/manifest`)
      if (res.ok) {
        return res.json()
      }
    } catch {
      // fall back to static release mirrors below
    }

    for (const mirrorUrl of [RAW_MIRROR_MANIFEST, RAW_SOURCE_MANIFEST]) {
      try {
        const res = await fetch(mirrorUrl)
        if (res.ok) {
          return res.json()
        }
      } catch {
        // try next mirror
      }
    }

    throw new Error('Failed to fetch release manifest from server or release mirrors')
  },

  /** Checks whether a newer native version is available for the active platform (Windows, macOS, Android, iOS). */
  async checkForUpdates(
    currentVersion: string = APP_CURRENT_VERSION,
    targetPlatform?: OperatingSystem
  ): Promise<UpdateCheckResult> {
    const os = targetPlatform || platformAdapter.getOperatingSystem()
    const mappedPlatform = (['windows', 'macos', 'android', 'ios'].includes(os) ? os : 'windows') as
      | 'windows'
      | 'macos'
      | 'android'
      | 'ios'

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(`${API_BASE}/api/v1/releases/check-update`, origin)
      url.searchParams.set('current_version', currentVersion)
      url.searchParams.set('platform', mappedPlatform)

      const res = await fetch(url.toString())
      if (res.ok) {
        const apiResult: UpdateCheckResult = await res.json()
        if (apiResult.has_update) {
          return apiResult
        }
      }
    } catch {
      // API unreachable / offline standalone client: fall back to manifest mirrors
    }

    const manifest = await this.getManifest()
    const platformInfo = manifest.platforms?.[mappedPlatform]
    const latestVersion = platformInfo?.version || manifest.version || currentVersion
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0
    const curMajor = parseSemverTuple(currentVersion)[0]
    const latestMajor = parseSemverTuple(latestVersion)[0]

    return {
      has_update: hasUpdate,
      current_version: currentVersion,
      latest_version: latestVersion,
      platform: mappedPlatform,
      download_url: hasUpdate ? this.getDownloadUrlForVersion(mappedPlatform, latestVersion) : platformInfo?.downloadUrl,
      file_name: platformInfo?.fileName,
      file_size_mb: platformInfo?.fileSizeMb,
      sha256: platformInfo?.sha256,
      release_notes: manifest.releaseNotes,
      is_critical: latestMajor > curMajor,
    }
  },

  /** Resolves relative /api/... download paths into full reachable URLs on Tauri/Capacitor native shells. */
  resolveDownloadUrl(
    rawUrl: string | undefined,
    platform?: 'windows' | 'macos' | 'android' | 'ios',
    version?: string
  ): string {
    if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
      return rawUrl
    }
    if (rawUrl && rawUrl.startsWith('/')) {
      if (platformAdapter.isNative() && /^http:\/\/localhost[:/]/i.test(API_BASE) && platform && version) {
        return this.getDownloadUrlForVersion(platform, version)
      }
      return platformAdapter.isNative() ? `${API_BASE}${rawUrl}` : rawUrl
    }
    if (platform && version) {
      return this.getDownloadUrlForVersion(platform, version)
    }
    return this.getDownloadUrl(platform)
  },

  /** Returns the direct installer download URL for a specific version + platform. */
  getDownloadUrlForVersion(platform: 'windows' | 'macos' | 'android' | 'ios', version: string): string {
    const cleanVer = version.replace(/^v/i, '')
    const GITHUB_RELEASES_BASE = 'https://github.com/yynvr1408/LanternEd/releases'
    const files: Record<string, string> = {
      windows: `LanternEd-Setup-${cleanVer}.exe`,
      macos: `LanternEd-${cleanVer}-universal.dmg`,
      android: `LanternEd-v${cleanVer}.apk`,
      ios: `LanternEd-v${cleanVer}.ipa`,
    }
    return `${GITHUB_RELEASES_BASE}/download/v${cleanVer}/${files[platform]}`
  },

  /** Returns the direct installer download URL for a platform pointing dynamically to /releases/latest. */
  getDownloadUrl(platform?: 'windows' | 'macos' | 'android' | 'ios'): string {
    const GITHUB_RELEASES_BASE = 'https://github.com/yynvr1408/LanternEd-App-Releases/releases'
    const files: Record<string, string> = {
      windows: `LanternEd-Setup-${APP_CURRENT_VERSION}.exe`,
      macos: `LanternEd-${APP_CURRENT_VERSION}-universal.dmg`,
      android: `LanternEd-v${APP_CURRENT_VERSION}.apk`,
      ios: `LanternEd-v${APP_CURRENT_VERSION}.ipa`,
    }
    if (platform && files[platform]) {
      return `${GITHUB_RELEASES_BASE}/latest/download/${files[platform]}`
    }
    return `${GITHUB_RELEASES_BASE}/latest`
  },

  /** Returns direct raw asset mirror URL from the release repository. */
  getRawDownloadUrl(platform?: 'windows' | 'macos' | 'android' | 'ios'): string {
    const RAW_BASE = 'https://raw.githubusercontent.com/yynvr1408/LanternEd-App-Releases/main'
    const paths: Record<string, string> = {
      windows: `windows/LanternEd-Setup-${APP_CURRENT_VERSION}.exe`,
      macos: `macos/LanternEd-${APP_CURRENT_VERSION}-universal.dmg`,
      android: `android/LanternEd-v${APP_CURRENT_VERSION}.apk`,
      ios: `ios/LanternEd-v${APP_CURRENT_VERSION}.ipa`,
    }
    if (platform && paths[platform]) {
      return `${RAW_BASE}/${paths[platform]}`
    }
    return RAW_BASE
  },
}
