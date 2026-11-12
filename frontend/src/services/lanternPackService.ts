/**
 * Portable `.lanternpack.zip` Exporter & Verifying Importer for Zero-Router
 * "Sneakernet" propagation (USB drive, SD card, AirDrop, Nearby Share, Files app).
 *
 * Implemented with pure standard Web APIs (TypedArrays, CRC32, SubtleCrypto SHA-256)
 * so zero npm zip dependencies are required and both STORE (method 0) and
 * browser `DecompressionStream('deflate-raw')` (method 8) work out of the box.
 */

import { db, type OerPackRecord } from '../db/db'
import { apiBlobRequest, apiRequest } from './apiClient'

export interface OerCatalogItem {
  id: string
  title: string
  provider: string
  format: string
  subject: string
  grade_level: string
  estimated_kb: number
  language: string
  description: string
  lesson_count: number
}

export interface LanternPackManifest {
  format: 'lanternpack-v1'
  bundle_id: string
  kind?: string
  title: string
  subject?: string
  provider?: string
  course_id?: string
  generated_at?: string
  files?: Array<{ path: string; sha256: string; bytes: number }>
}

const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    tbl[n] = c >>> 0
  }
  return tbl
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Build a valid ZIP archive using STORE (method 0) so any OS/app can open it offline. */
export function buildStoredZip(files: Record<string, Uint8Array>): Uint8Array {
  const enc = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const [rawName, data] of Object.entries(files)) {
    const nameBytes = enc.encode(rawName)
    const crc = crc32(data)
    const size = data.length

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 filename flag
    lv.setUint16(8, 0, true) // STORE
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0x5421, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    localParts.push(localHeader, data)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x5421, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)

    offset += localHeader.length + data.length
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  const count = Object.keys(files).length
  ev.setUint16(8, count, true)
  ev.setUint16(10, count, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const totalLen = offset + centralSize + eocd.length
  const out = new Uint8Array(totalLen)
  let pos = 0
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Deflate decompression is not supported in this runtime; use stored ZIP.')
  }
  const copy = new Uint8Array(compressed.byteLength)
  copy.set(compressed)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/** Parse central directory of a ZIP buffer (supports STORE method 0 and DEFLATE method 8). */
export async function parseZipArchive(zipBytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
  let eocdOffset = -1
  for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP archive: End of Central Directory record not found.')
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true)
  let cdOffset = view.getUint32(eocdOffset + 16, true)
  const dec = new TextDecoder()
  const out: Record<string, Uint8Array> = {}

  for (let idx = 0; idx < totalEntries; idx++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) {
      throw new Error('Corrupted ZIP central directory entry.')
    }
    const method = view.getUint16(cdOffset + 10, true)
    const compSize = view.getUint32(cdOffset + 20, true)
    const nameLen = view.getUint16(cdOffset + 28, true)
    const extraLen = view.getUint16(cdOffset + 30, true)
    const commentLen = view.getUint16(cdOffset + 32, true)
    const localOffset = view.getUint32(cdOffset + 42, true)
    const filename = dec.decode(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen))

    if (!filename.endsWith('/')) {
      const lNameLen = view.getUint16(localOffset + 26, true)
      const lExtraLen = view.getUint16(localOffset + 28, true)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const slice = zipBytes.subarray(dataStart, dataStart + compSize)
      if (method === 0) {
        out[filename] = new Uint8Array(slice)
      } else if (method === 8) {
        out[filename] = await inflateRawBytes(slice)
      } else {
        throw new Error(`Unsupported ZIP compression method ${method} for ${filename}`)
      }
    }

    cdOffset += 46 + nameLen + extraLen + commentLen
  }

  return out
}

export async function exportLocalLibraryToLanternPack(): Promise<{ filename: string; bytes: Uint8Array; manifest: LanternPackManifest }> {
  const [lessons, savedSums, cachedSums, oerPacks] = await Promise.all([
    db.cachedLessonMetadata.toArray(),
    db.downloadedSummaries.toArray(),
    db.cachedSummaries.toArray(),
    db.oerPacks.toArray(),
  ])

  const enc = new TextEncoder()
  const lessonsJson = enc.encode(
    JSON.stringify([
      ...lessons.map((l) => ({ id: l.id, course_id: l.courseId, title: l.title, content: l.payload.content || '' })),
      ...oerPacks.flatMap((p) => p.lessons.map((l) => ({ id: l.id, course_id: p.id, title: l.title, content: l.content }))),
    ])
  )
  const summariesJson = enc.encode(
    JSON.stringify(
      [...savedSums, ...cachedSums].map((s) => ({
        title: 'title' in s ? s.title : `Summary ${s.classId}`,
        class_id: s.classId,
        course_id: s.courseId,
        content_json: {
          overview: s.payload.overview,
          key_concepts: s.payload.key_concepts,
          definitions: s.payload.definitions,
          examples: s.payload.examples,
        },
      }))
    )
  )

  const manifest: LanternPackManifest = {
    format: 'lanternpack-v1',
    bundle_id: `local-${Date.now()}`,
    kind: 'device_export',
    title: 'LanternED Portable Offline Bundle',
    subject: 'Multi-Course Offline Export',
    provider: 'LanternED Device Export',
    generated_at: new Date().toISOString(),
    files: [
      { path: 'lessons.json', sha256: await sha256Hex(lessonsJson), bytes: lessonsJson.length },
      { path: 'summaries.json', sha256: await sha256Hex(summariesJson), bytes: summariesJson.length },
    ],
  }

  const bytes = buildStoredZip({
    'manifest.json': enc.encode(JSON.stringify(manifest, null, 2)),
    'lessons.json': lessonsJson,
    'summaries.json': summariesJson,
  })
  return { filename: 'lanterned-offline-bundle.lanternpack.zip', bytes, manifest }
}

export async function importLanternPackBytes(zipBytes: Uint8Array): Promise<OerPackRecord> {
  const entries = await parseZipArchive(zipBytes)
  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) {
    throw new Error('Missing manifest.json inside .lanternpack.zip archive.')
  }
  const dec = new TextDecoder()
  const manifest = JSON.parse(dec.decode(manifestRaw)) as LanternPackManifest
  if (manifest.format !== 'lanternpack-v1') {
    throw new Error('Unsupported bundle format (expected lanternpack-v1).')
  }

  // Verify per-file SHA-256 integrity digests before installing
  for (const spec of manifest.files || []) {
    const fileBytes = entries[spec.path]
    if (!fileBytes) {
      throw new Error(`Missing integrity-tracked file: ${spec.path}`)
    }
    const digest = await sha256Hex(fileBytes)
    if (digest !== spec.sha256) {
      throw new Error(`Integrity verification failed for ${spec.path} (SHA-256 mismatch).`)
    }
  }

  const lessons: Array<{ id: string; title: string; content: string }> = entries['lessons.json']
    ? JSON.parse(dec.decode(entries['lessons.json']))
    : []

  const pack: OerPackRecord = {
    id: manifest.bundle_id || `pack-${Date.now()}`,
    title: manifest.title || 'Imported LanternPack',
    provider: manifest.provider || 'USB / Peer Transfer',
    subject: manifest.subject || 'General',
    lessons: lessons.map((l, idx) => ({
      id: String(l.id || `lesson-${idx}`),
      title: String(l.title || `Module ${idx + 1}`),
      content: String(l.content || ''),
    })),
    installedAt: new Date().toISOString(),
  }

  await db.oerPacks.put(pack)
  return pack
}

export const lanternPackService = {
  async listOerCatalog(): Promise<OerCatalogItem[]> {
    const res = await apiRequest<{ packs: OerCatalogItem[] }>('/oer/catalog')
    return res.packs || []
  },

  async installCatalogOerPack(packId: string): Promise<OerPackRecord> {
    const blob = await apiBlobRequest(`/oer/catalog/${packId}/export-pack`)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return importLanternPackBytes(bytes)
  },

  async downloadCoursePack(courseId: string): Promise<{ filename: string; blob: Blob }> {
    const blob = await apiBlobRequest(`/oer/courses/${courseId}/export-pack`)
    return { filename: `course-${courseId}.lanternpack.zip`, blob }
  },
}
