import React, { useEffect, useState } from 'react'
import { DownloadCloud, ExternalLink, FileArchive, Layers, Play, Plus } from 'lucide-react'
import { Badge, Button, Dialog, FormField, Input } from '../ui'
import { interopService, type InteropPackage } from '../../services/interopService'
import { lanternPackService } from '../../services/lanternPackService'
import { platformAdapter } from '../../services/platformAdapter'
import { ScormH5pPlayerModal } from './ScormH5pPlayerModal'

interface CourseInteropPanelProps {
  courseId: string
  canManage: boolean
}

export const CourseInteropPanel: React.FC<CourseInteropPanelProps> = ({ courseId, canManage }) => {
  const [packages, setPackages] = useState<InteropPackage[]>([])
  const [activePkg, setActivePkg] = useState<InteropPackage | null>(null)
  const [isLtiOpen, setIsLtiOpen] = useState(false)
  const [ltiTitle, setLtiTitle] = useState('')
  const [ltiUrl, setLtiUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const loadPackages = async () => {
    try {
      setPackages(await interopService.listCoursePackages(courseId))
    } catch {
      setPackages([])
    }
  }

  useEffect(() => {
    void loadPackages()
  }, [courseId])

  const handleUploadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setNotice(null)
    try {
      const pkg = await interopService.importPackageFile(courseId, file)
      setPackages((prev) => [pkg, ...prev])
      setNotice(`Imported ${pkg.standard.toUpperCase()} package "${pkg.title}".`)
    } catch (err: any) {
      setNotice(err?.message || 'Failed to import SCORM/H5P package.')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleAddLti = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ltiTitle.trim() || !ltiUrl.trim()) return
    const created = await interopService.registerLtiTool({
      course_id: courseId,
      title: ltiTitle.trim(),
      launch_url: ltiUrl.trim(),
    })
    setPackages((prev) => [created, ...prev])
    setLtiTitle('')
    setLtiUrl('')
    setIsLtiOpen(false)
  }

  const handleExportLanternPack = async () => {
    setIsExporting(true)
    setNotice(null)
    try {
      const { filename, blob } = await lanternPackService.downloadCoursePack(courseId)
      await platformAdapter.shareArtifact({
        title: filename,
        text: 'Offline LanternPack course bundle (.lanternpack.zip)',
        fileName: filename,
        contentType: 'application/zip',
        blob,
      })
      setNotice(`Exported portable bundle ${filename} for USB / AirDrop / Nearby Share.`)
    } catch (err: any) {
      setNotice(err?.message || 'Unable to export course bundle right now.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="bg-white border border-[#E1E8E4] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-sm text-[#202B2A]">
            <Layers className="w-4 h-4 text-[#0F5B57]" />
            <span>SCORM / H5P / LTI 1.3 & Portable Offline Packs</span>
          </div>
          <p className="text-xs text-[#687775] mt-0.5">
            Launch interactive SCORM/H5P modules with offline xAPI telemetry, or export `.lanternpack.zip` for zero-router sharing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<DownloadCloud className="w-3.5 h-3.5" />}
            onClick={handleExportLanternPack}
            isLoading={isExporting}
          >
            Export .lanternpack
          </Button>
          {canManage && (
            <>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD7D1] bg-[#F8FAF7] hover:bg-[#DDF3EA] text-xs font-semibold text-[#202B2A] cursor-pointer">
                <FileArchive className="w-3.5 h-3.5 text-[#0F5B57]" />
                <span>{isUploading ? 'Importing...' : 'Import SCORM / H5P'}</span>
                <input type="file" accept=".zip,.h5p" onChange={handleUploadZip} className="hidden" />
              </label>
              <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setIsLtiOpen(true)}>
                Add LTI Tool
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-2.5 rounded-lg bg-[#F4FBF7] border border-[#A7E2C7] text-xs text-[#247A4D] font-medium">
          {notice}
        </div>
      )}

      {packages.length === 0 ? (
        <p className="text-xs text-[#687775]">
          No SCORM, H5P, or LTI 1.3 packages attached to this course yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="p-3 rounded-xl border border-[#E1E8E4] bg-[#F8FAF7] flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-bold text-xs text-[#202B2A] truncate">{pkg.title}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="info" size="sm">
                    {pkg.standard.toUpperCase()}
                  </Badge>
                  {pkg.checksum_sha256 && (
                    <span className="text-[10px] font-mono text-[#687775]">
                      sha256:{pkg.checksum_sha256.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={pkg.standard === 'lti_1_3' ? <ExternalLink className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                onClick={() => setActivePkg(pkg)}
              >
                Launch
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog isOpen={isLtiOpen} onClose={() => setIsLtiOpen(false)} title="Register External LTI 1.3 Tool">
        <form onSubmit={handleAddLti} className="space-y-3 text-xs">
          <FormField label="Tool Title" htmlFor="lti-title" required>
            <Input
              id="lti-title"
              value={ltiTitle}
              onChange={(e) => setLtiTitle(e.target.value)}
              placeholder="e.g. PhET Circuit Construction Kit"
              required
            />
          </FormField>
          <FormField label="Target Launch URL" htmlFor="lti-url" required>
            <Input
              id="lti-url"
              value={ltiUrl}
              onChange={(e) => setLtiUrl(e.target.value)}
              placeholder="https://phet.colorado.edu/..."
              required
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setIsLtiOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Register Tool
            </Button>
          </div>
        </form>
      </Dialog>

      <ScormH5pPlayerModal pkg={activePkg} onClose={() => setActivePkg(null)} />
    </div>
  )
}
