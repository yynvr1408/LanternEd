import React, { useEffect, useState } from 'react'
import { BookOpen, DownloadCloud, FolderSearch, Share2, Sparkles, UploadCloud } from 'lucide-react'
import { db, type OerPackRecord } from '../../db/db'
import { Badge, Button, Card, CardContent, CardHeader, Input } from '../ui'
import { askOfflineLibrary, type OfflineAiAnswer } from '../../services/offlineAiEngine'
import {
  exportLocalLibraryToLanternPack,
  importLanternPackBytes,
  lanternPackService,
  type OerCatalogItem,
} from '../../services/lanternPackService'
import { platformAdapter } from '../../services/platformAdapter'

/**
 * Unified Offline AI Q&A ("Ask Offline Library") + Curated OER / ZIM Catalog
 * + Zero-Router USB / AirDrop / Nearby Share `.lanternpack.zip` Manager.
 */
export const OfflineLibraryToolsSection: React.FC = () => {
  // On-device AI Retrieval Q&A state
  const [aiQuery, setAiQuery] = useState('')
  const [aiAnswer, setAiAnswer] = useState<OfflineAiAnswer | null>(null)
  const [isQuerying, setIsQuerying] = useState(false)

  // OER & .lanternpack Mesh state
  const [catalog, setCatalog] = useState<OerCatalogItem[]>([])
  const [installedPacks, setInstalledPacks] = useState<OerPackRecord[]>([])
  const [usbPacks, setUsbPacks] = useState<Array<{ name: string; path: string; sizeBytes: number }>>([])
  const [busyPackId, setBusyPackId] = useState<string | null>(null)
  const [meshNotice, setMeshNotice] = useState<string | null>(null)

  const refreshInstalled = async () => {
    try {
      setInstalledPacks(await db.oerPacks.toArray())
    } catch {
      setInstalledPacks([])
    }
  }

  useEffect(() => {
    void refreshInstalled()
    void lanternPackService
      .listOerCatalog()
      .then(setCatalog)
      .catch(() => {})
  }, [])

  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aiQuery.trim()) return
    setIsQuerying(true)
    try {
      setAiAnswer(await askOfflineLibrary(aiQuery.trim()))
    } finally {
      setIsQuerying(false)
    }
  }

  const handleInstallCatalogPack = async (packId: string) => {
    setBusyPackId(packId)
    setMeshNotice(null)
    try {
      const rec = await lanternPackService.installCatalogOerPack(packId)
      await refreshInstalled()
      setMeshNotice(`Installed "${rec.title}" (${rec.lessons.length} modules) into verified offline storage.`)
    } catch (err: any) {
      setMeshNotice(err?.message || 'Unable to install OER pack while offline.')
    } finally {
      setBusyPackId(null)
    }
  }

  const handleImportLanternPackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMeshNotice(null)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const pack = await importLanternPackBytes(buf)
      await refreshInstalled()
      setMeshNotice(
        `Verified SHA-256 & imported "${pack.title}" (${pack.lessons.length} lessons) completely offline!`
      )
    } catch (err: any) {
      setMeshNotice(err?.message || 'Invalid or corrupted .lanternpack.zip file.')
    } finally {
      e.target.value = ''
    }
  }

  const handleExportAndShareBundle = async () => {
    setMeshNotice(null)
    try {
      const { filename, bytes } = await exportLocalLibraryToLanternPack()
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blob = new Blob([copy.buffer], { type: 'application/zip' })
      await platformAdapter.shareArtifact({
        title: 'LanternED Offline Study Bundle',
        text: 'Share this verified .lanternpack.zip over USB, AirDrop, or Android Nearby Share.',
        fileName: filename,
        contentType: 'application/zip',
        blob,
      })
      setMeshNotice(`Prepared ${filename} (${Math.max(1, Math.round(bytes.length / 1024))} KB) for offline transfer.`)
    } catch (err: any) {
      setMeshNotice(err?.message || 'Failed to build offline bundle.')
    }
  }

  const handleScanUsbPacks = async () => {
    const found = await platformAdapter.scanRemovablePacks()
    setUsbPacks(found)
    if (found.length === 0) {
      setMeshNotice('No .lanternpack.zip or .zim files found in current app folder. Use Import File to select from USB/Files.')
    }
  }

  const speechStatus = platformAdapter.getSpeechRecognitionStatus()

  return (
    <div className="space-y-6">
      {/* 1. On-Device Offline AI Q&A ("Ask Offline Library") */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-base text-[#202B2A] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0F5B57]" />
              Ask Your Offline AI Library
            </h2>
            <p className="text-xs text-[#687775]">
              100% on-device BM25 search & extractive Q&A across downloaded notes, summaries, recordings, and OER packs.
            </p>
          </div>
          <Badge variant="info" size="sm">
            Speech Engine: {speechStatus.engine}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAskAi} className="flex flex-col sm:flex-row gap-2">
            <Input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="Ask e.g. Ohm's Law formula, binary search complexity, entropy..."
              aria-label="Ask Offline AI Library"
            />
            <Button type="submit" variant="primary" isLoading={isQuerying} className="shrink-0">
              Search & Answer Offline
            </Button>
          </form>

          {aiAnswer && (
            <div className="space-y-3 p-4 rounded-xl bg-[#F8FAF7] border border-[#E1E8E4] text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0F5B57]">On-Device Extractive Answer</span>
                <span className="text-[11px] text-[#687775]">
                  Indexed {aiAnswer.indexedDocCount} local docs · {aiAnswer.engine}
                </span>
              </div>
              <p className="text-sm text-[#202B2A] leading-relaxed">{aiAnswer.synthesizedAnswer}</p>

              {aiAnswer.citations.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#E1E8E4]">
                  <div className="font-bold text-[#202B2A]">Local Source Citations</div>
                  {aiAnswer.citations.map((hit) => (
                    <div key={hit.docId} className="p-2.5 rounded-lg bg-white border border-[#E1E8E4]">
                      <div className="flex items-center justify-between font-semibold text-[#0F5B57]">
                        <span>{hit.title}</span>
                        <span className="text-[10px] font-mono text-[#687775]">BM25 {hit.score}</span>
                      </div>
                      <p className="text-[#687775] mt-1">{hit.bestPassage}</p>
                    </div>
                  ))}
                </div>
              )}

              {aiAnswer.generatedFlashcards.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#E1E8E4]">
                  <div className="font-bold text-[#202B2A]">Auto-Generated Study Flashcards</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {aiAnswer.generatedFlashcards.map((fc, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-white border border-[#CBD7D1]">
                        <div className="font-semibold text-[#202B2A]">{fc.question}</div>
                        <div className="text-[#687775] mt-1">{fc.answer}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Curated OER Packs & Zero-Router USB / Peer Mesh (.lanternpack.zip) */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-base text-[#202B2A] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0F5B57]" />
              Offline OER Libraries & Zero-Router USB / Peer Exchange
            </h2>
            <p className="text-xs text-[#687775]">
              Install compact STEM OER packs or exchange SHA-256 verified `.lanternpack.zip` bundles via USB, AirDrop, or Nearby Share.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" icon={<Share2 className="w-3.5 h-3.5" />} onClick={handleExportAndShareBundle}>
              Export / Share .lanternpack
            </Button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F5B57] hover:bg-[#0c4a47] text-white text-xs font-semibold cursor-pointer">
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import USB / File Pack</span>
              <input type="file" accept=".zip,.lanternpack.zip" onChange={handleImportLanternPackFile} className="hidden" />
            </label>
            {platformAdapter.getPlatform() === 'tauri' && (
              <Button size="sm" variant="outline" icon={<FolderSearch className="w-3.5 h-3.5" />} onClick={handleScanUsbPacks}>
                Scan Folder
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          {meshNotice && (
            <div className="p-2.5 rounded-lg bg-[#F4FBF7] border border-[#A7E2C7] text-[#247A4D] font-medium">
              {meshNotice}
            </div>
          )}

          {usbPacks.length > 0 && (
            <div className="p-3 rounded-xl bg-[#F8FAF7] border border-[#E1E8E4] space-y-1">
              <div className="font-bold text-[#202B2A]">Detected Local / USB Bundles</div>
              {usbPacks.map((u) => (
                <div key={u.path} className="font-mono text-[11px] text-[#687775]">
                  {u.name} ({Math.max(1, Math.round(u.sizeBytes / 1024))} KB)
                </div>
              ))}
            </div>
          )}

          {installedPacks.length > 0 && (
            <div className="space-y-2">
              <div className="font-bold text-[#202B2A]">Installed Offline OER / Peer Packs ({installedPacks.length})</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {installedPacks.map((p) => (
                  <div key={p.id} className="p-3 rounded-xl border border-[#A7E2C7] bg-[#F4FBF7] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#202B2A]">{p.title}</span>
                      <Badge variant="success" size="sm">Indexed Offline</Badge>
                    </div>
                    <div className="text-[#687775]">
                      {p.provider} · {p.lessons.length} modules ready for offline Q&A
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {catalog.length > 0 && (
            <div className="space-y-2">
              <div className="font-bold text-[#202B2A]">Curated OER / ZIM Starter Catalog</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {catalog.map((item) => {
                  const alreadyInstalled = installedPacks.some((p) => p.id === item.id)
                  return (
                    <div key={item.id} className="p-3.5 rounded-xl border border-[#E1E8E4] bg-white flex flex-col justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-bold text-[#202B2A]">{item.title}</div>
                        <div className="text-[11px] text-[#0F5B57] font-semibold">
                          {item.subject} · ~{item.estimated_kb} KB
                        </div>
                        <p className="text-[#687775] line-clamp-3">{item.description}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyInstalled ? 'outline' : 'primary'}
                        icon={<DownloadCloud className="w-3.5 h-3.5" />}
                        isLoading={busyPackId === item.id}
                        onClick={() => handleInstallCatalogPack(item.id)}
                      >
                        {alreadyInstalled ? 'Re-Sync OER Pack' : 'Install for Offline Use'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
