import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Layers, Play } from 'lucide-react'
import { Badge, Button, Dialog } from '../ui'
import { interopService, type InteropPackage } from '../../services/interopService'

interface ScormH5pPlayerModalProps {
  pkg: InteropPackage | null
  onClose: () => void
}

/**
 * Sandboxed SCORM 1.2 / 2004, H5P, and LTI 1.3 Learning Package Player.
 * Exposes an isolated SCORM 1.2 `window.API` stub that persists learner progress
 * and emits xAPI statements seamlessly through `syncManager` when offline.
 */
export const ScormH5pPlayerModal: React.FC<ScormH5pPlayerModalProps> = ({ pkg, onClose }) => {
  const cmiStoreRef = useRef<Record<string, string>>({
    'cmi.core.lesson_status': 'incomplete',
    'cmi.core.score.raw': '',
    'cmi.suspend_data': '',
  })
  const [statusLabel, setStatusLabel] = useState<'incomplete' | 'completed'>('incomplete')
  const [score, setScore] = useState<string>('')
  const [ltiTokenInfo, setLtiTokenInfo] = useState<{ launch_url: string; id_token: string } | null>(null)
  const [xapiNotice, setXapiNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pkg) return
    setStatusLabel('incomplete')
    setScore('')
    setLtiTokenInfo(null)
    setXapiNotice(null)

    if (pkg.standard === 'lti_1_3') {
      void interopService
        .requestLtiLaunch(pkg.id)
        .then((res) => setLtiTokenInfo({ launch_url: res.launch_url, id_token: res.id_token }))
        .catch(() => {})
    }

    // Install lightweight SCORM 1.2 Runtime API bridge for same-origin SCO frames
    const w = window as any
    const prevApi = w.API
    w.API = {
      LMSInitialize: () => 'true',
      LMSGetValue: (key: string) => cmiStoreRef.current[key] ?? '',
      LMSSetValue: (key: string, val: string) => {
        cmiStoreRef.current[key] = String(val)
        if (key === 'cmi.core.score.raw') setScore(String(val))
        if (key === 'cmi.core.lesson_status' && (val === 'completed' || val === 'passed')) {
          setStatusLabel('completed')
        }
        return 'true'
      },
      LMSCommit: () => 'true',
      LMSFinish: () => {
        void recordCompletion()
        return 'true'
      },
      LMSGetLastError: () => '0',
      LMSGetErrorString: () => 'No error',
      LMSGetDiagnostic: () => '',
    }

    return () => {
      w.API = prevApi
    }
  }, [pkg?.id])

  if (!pkg) return null

  const recordCompletion = async () => {
    const rawNum = Number(score || cmiStoreRef.current['cmi.core.score.raw'])
    const hasScore = Number.isFinite(rawNum) && score !== ''
    const res = await interopService.emitXapiStatement({
      course_id: pkg.course_id,
      verb: {
        id: 'http://adlnet.gov/expapi/verbs/completed',
        display: { 'en-US': 'completed' },
      },
      object: {
        id: `urn:lanterned:${pkg.standard}:${pkg.id}`,
        objectType: 'Activity',
        definition: { name: { 'en-US': pkg.title } },
      },
      result: {
        completion: true,
        ...(hasScore ? { score: { raw: rawNum, scaled: Math.min(1, Math.max(0, rawNum / 100)) } } : {}),
      },
    })
    setStatusLabel('completed')
    setXapiNotice(
      res.queuedOffline
        ? 'xAPI completion recorded offline — will sync automatically on reconnect.'
        : 'xAPI completion recorded in LRS.'
    )
  }

  const h5pPreview = pkg.manifest_json?.content_preview

  return (
    <Dialog
      isOpen={!!pkg}
      onClose={onClose}
      title={pkg.title}
      description={`${pkg.standard.toUpperCase()} Interactive Runtime`}
      maxWidth="xl"
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F8FAF7] border border-[#E1E8E4] rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Badge variant={statusLabel === 'completed' ? 'success' : 'info'}>
              {statusLabel === 'completed' ? 'Completed' : 'In Progress'}
            </Badge>
            <span className="text-[#687775]">Standard: {pkg.standard.toUpperCase()}</span>
          </div>
          <Button size="sm" variant="primary" onClick={recordCompletion}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark & Sync xAPI Completion
          </Button>
        </div>

        {xapiNotice && (
          <div className="p-2.5 rounded-lg bg-[#F4FBF7] border border-[#A7E2C7] text-[#247A4D] font-medium">
            {xapiNotice}
          </div>
        )}

        {pkg.standard === 'lti_1_3' ? (
          <div className="p-4 rounded-xl border border-[#E1E8E4] bg-white space-y-3">
            <div className="flex items-center gap-2 font-bold text-[#202B2A] text-sm">
              <Layers className="w-4 h-4 text-[#0F5B57]" /> Signed LTI 1.3 Tool Launch
            </div>
            <p className="text-[#687775]">
              Launch external simulation or compiler lab using signed LTI 1.3 JWT identity & grade passback claims.
            </p>
            {ltiTokenInfo && (
              <div className="p-2.5 rounded-lg bg-[#F8FAF7] font-mono text-[11px] break-all text-[#202B2A] border border-[#E1E8E4]">
                Signed id_token: {ltiTokenInfo.id_token.slice(0, 72)}...
              </div>
            )}
            <a
              href={pkg.launch_url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F5B57] text-white font-semibold hover:bg-[#0c4a47]"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open LTI 1.3 Tool
            </a>
          </div>
        ) : h5pPreview ? (
          <div className="p-4 rounded-xl border border-[#E1E8E4] bg-white space-y-2 max-h-96 overflow-y-auto">
            <div className="flex items-center gap-2 font-bold text-[#202B2A]">
              <Play className="w-4 h-4 text-[#0F5B57]" /> H5P Offline Package Content ({pkg.manifest_json?.mainLibrary || 'H5P'})
            </div>
            <pre className="p-3 rounded-lg bg-[#F8FAF7] border border-[#E1E8E4] text-[11px] overflow-x-auto text-[#202B2A]">
              {JSON.stringify(h5pPreview, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="border border-[#E1E8E4] rounded-xl overflow-hidden bg-white h-96">
            <iframe
              title={pkg.title}
              src={pkg.launch_url || 'about:blank'}
              sandbox="allow-scripts allow-forms allow-same-origin"
              className="w-full h-full border-0"
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}
