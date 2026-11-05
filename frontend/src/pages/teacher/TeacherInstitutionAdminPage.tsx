import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Building2,
  Check,
  Download,
  RefreshCw,
  FileUp,
  KeyRound,
  Layers,
  Mail,
  Pencil,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  UserMinus,
  Users,
  X,
  Sparkles,
  Sliders,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  GitBranch,
  BookOpen,
  GraduationCap,
  Plus,
  Trash2,
  Filter,
  Search,
  CheckCircle2,
  Phone,
  MapPin,
  ExternalLink,
} from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Dialog,
  FormField,
  Input,
  Select,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/ui'
import {
  institutionAdminApi,
  type CollegeDeletionRequest,
  type PendingUser,
  type RosterEntry,
  type RosterImportResult,
  type AiScreenedApplicant,
  type CollegeSettings,
  type InstitutionCourse,
} from '../../services/institutionAdminApi'
import type { BillingSummary, College, CollegeBranch, CollegeSection, CollegeStatus } from '../../services/adminApi'
import { platformAdapter } from '../../services/platformAdapter'
import { AppDownloadModal } from '../../components/common/AppDownloadModal'
import { AppUpdateModal } from '../../components/common/AppUpdateModal'

const shortForm = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return words.map((w) => w[0]!.toUpperCase()).join('').slice(0, 6)
  return (words[0] || '').slice(0, 4).toUpperCase()
}

export type AdminTab =
  | 'overview'
  | 'branches'
  | 'courses'
  | 'teachers'
  | 'students'
  | 'approvals'
  | 'settings'
  | 'roster'

interface TeacherInstitutionAdminPageProps {
  activeTab?: AdminTab
}

export const TeacherInstitutionAdminPage: React.FC<TeacherInstitutionAdminPageProps> = ({
  activeTab: initialTab = 'overview',
}) => {
  const navigate = useNavigate()
  const location = useLocation()

  // Determine active tab from prop or URL
  const currentTab: AdminTab = useMemo(() => {
    const path = location.pathname
    if (path.includes('/branches')) return 'branches'
    if (path.includes('/courses')) return 'courses'
    if (path.includes('/teachers')) return 'teachers'
    if (path.includes('/students')) return 'students'
    if (path.includes('/approvals')) return 'approvals'
    if (path.includes('/settings')) return 'settings'
    if (path.includes('/roster')) return 'roster'
    return initialTab
  }, [location.pathname, initialTab])

  const setTab = (tab: AdminTab) => {
    navigate(`/institution/${tab === 'overview' ? 'dashboard' : tab}`)
  }

  const [colleges, setColleges] = useState<College[] | null>(null)
  const [selectedCollegeId, setSelectedCollegeId] = useState<string | null>(null)
  const [deletionRequests, setDeletionRequests] = useState<Record<string, CollegeDeletionRequest | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  // Modals for App Download & Updates
  const [isDownloadOpen, setIsDownloadOpen] = useState(false)
  const [isUpdateOpen, setIsUpdateOpen] = useState(false)
  const isNative = platformAdapter.isNative()

  // Load Colleges
  const loadColleges = async () => {
    setError(null)
    try {
      const list = await institutionAdminApi.myColleges()
      setColleges(list)
      if (list.length > 0 && !selectedCollegeId) {
        setSelectedCollegeId(list[0].id)
      }
      const delMap = await Promise.all(
        list.map(async (c) => [c.id, await institutionAdminApi.getDeletionRequest(c.id).catch(() => null)] as const)
      )
      setDeletionRequests(Object.fromEntries(delMap))
    } catch (err: any) {
      setError(err.message || 'Failed to load administered institutions.')
    }
  }

  useEffect(() => {
    void loadColleges()
  }, [refreshTick])

  const activeCollege = useMemo(() => {
    if (!colleges || colleges.length === 0) return null
    return colleges.find((c) => c.id === selectedCollegeId) || colleges[0]
  }, [colleges, selectedCollegeId])

  // Shared Data: Branches, Members, Courses
  const [branches, setBranches] = useState<CollegeBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [courses, setCourses] = useState<InstitutionCourse[]>([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [members, setMembers] = useState<PendingUser[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<PendingUser[]>([])

  const loadBranches = async (cId: string) => {
    setBranchesLoading(true)
    try {
      const list = await institutionAdminApi.listBranches(cId)
      setBranches(list)
    } catch {
      // offline or error
    } finally {
      setBranchesLoading(false)
    }
  }

  const loadCourses = async (cId: string) => {
    setCoursesLoading(true)
    try {
      const list = await institutionAdminApi.listCourses(cId)
      setCourses(list)
    } catch {
      // offline or error
    } finally {
      setCoursesLoading(false)
    }
  }

  const loadMembers = async (cId: string) => {
    setMembersLoading(true)
    try {
      const [allMembers, pending] = await Promise.all([
        institutionAdminApi.listMembers(cId),
        institutionAdminApi.listPendingRegistrations(cId),
      ])
      setMembers(allMembers)
      setPendingApprovals(pending)
    } catch {
      // offline or error
    } finally {
      setMembersLoading(false)
    }
  }

  useEffect(() => {
    if (activeCollege) {
      loadBranches(activeCollege.id)
      loadCourses(activeCollege.id)
      loadMembers(activeCollege.id)
    }
  }, [activeCollege?.id, refreshTick])

  // Split members into Teachers and Students
  const teachers = useMemo(() => members.filter((m) => m.role === 'teacher'), [members])
  const students = useMemo(() => members.filter((m) => m.role === 'student'), [members])

  // -------------------------------------------------------------
  // BRANCH MANAGEMENT CRUD STATE & ACTIONS
  // -------------------------------------------------------------
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<CollegeBranch | null>(null)
  const [branchName, setBranchName] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [branchBusy, setBranchBusy] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const [deletingBranch, setDeletingBranch] = useState<CollegeBranch | null>(null)

  // Section Management within a branch
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null)
  const [branchSections, setBranchSections] = useState<Record<string, CollegeSection[]>>({})
  const [newSectionName, setNewSectionName] = useState('')

  const loadSectionsForBranch = async (branchId: string) => {
    try {
      const secs = await institutionAdminApi.listSections(branchId)
      setBranchSections((prev) => ({ ...prev, [branchId]: secs }))
    } catch {}
  }

  const toggleExpandBranch = (branchId: string) => {
    if (expandedBranchId === branchId) {
      setExpandedBranchId(null)
    } else {
      setExpandedBranchId(branchId)
      if (!branchSections[branchId]) {
        loadSectionsForBranch(branchId)
      }
    }
  }

  const openCreateBranchModal = () => {
    setEditingBranch(null)
    setBranchName('')
    setBranchCode('')
    setIsBranchModalOpen(true)
  }

  const openEditBranchModal = (branch: CollegeBranch) => {
    setEditingBranch(branch)
    setBranchName(branch.name)
    setBranchCode(branch.short_code || '')
    setIsBranchModalOpen(true)
  }

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCollege || !branchName.trim()) return
    setBranchBusy(true)
    setError(null)
    try {
      if (editingBranch) {
        await institutionAdminApi.updateBranch(editingBranch.id, {
          name: branchName.trim(),
          short_code: branchCode.trim() || null,
        })
        setNotice(`Branch "${branchName.trim()}" updated successfully.`)
      } else {
        await institutionAdminApi.createBranch(activeCollege.id, branchName.trim(), branchCode.trim())
        setNotice(`Branch "${branchName.trim()}" created successfully.`)
      }
      setIsBranchModalOpen(false)
      loadBranches(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Failed to save branch.')
    } finally {
      setBranchBusy(false)
    }
  }

  const handleDeleteBranch = async () => {
    if (!deletingBranch || !activeCollege) return
    setBranchBusy(true)
    try {
      await institutionAdminApi.deleteBranch(deletingBranch.id)
      setNotice(`Branch "${deletingBranch.name}" was deleted.`)
      setDeletingBranch(null)
      loadBranches(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Failed to delete branch.')
    } finally {
      setBranchBusy(false)
    }
  }

  const handleAddSection = async (branchId: string) => {
    if (!newSectionName.trim()) return
    try {
      await institutionAdminApi.createSection(branchId, newSectionName.trim())
      setNewSectionName('')
      loadSectionsForBranch(branchId)
    } catch (err: any) {
      setError(err.message || 'Could not add section.')
    }
  }

  const handleDeleteSection = async (branchId: string, sectionId: string) => {
    if (!confirm('Are you sure you want to delete this section?')) return
    try {
      await institutionAdminApi.deleteSection(sectionId)
      loadSectionsForBranch(branchId)
    } catch (err: any) {
      setError(err.message || 'Could not delete section.')
    }
  }

  // -------------------------------------------------------------
  // COURSE MANAGEMENT CRUD STATE & ACTIONS
  // -------------------------------------------------------------
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<InstitutionCourse | null>(null)
  const [courseTitle, setCourseTitle] = useState('')
  const [courseSubject, setCourseSubject] = useState('')
  const [courseDesc, setCourseDesc] = useState('')
  const [courseTeacherId, setCourseTeacherId] = useState('')
  const [courseBranchId, setCourseBranchId] = useState('')
  const [courseStatus, setCourseStatus] = useState<'published' | 'draft'>('published')
  const [courseBusy, setCourseBusy] = useState(false)
  const [courseFilterBranch, setCourseFilterBranch] = useState('')
  const [deletingCourse, setDeletingCourse] = useState<InstitutionCourse | null>(null)

  const openCreateCourseModal = () => {
    setEditingCourse(null)
    setCourseTitle('')
    setCourseSubject('')
    setCourseDesc('')
    setCourseTeacherId(teachers.length > 0 ? teachers[0].id : '')
    setCourseBranchId(branches.length > 0 ? branches[0].id : '')
    setCourseStatus('published')
    setIsCourseModalOpen(true)
  }

  const openEditCourseModal = (c: InstitutionCourse) => {
    setEditingCourse(c)
    setCourseTitle(c.title)
    setCourseSubject(c.subject || '')
    setCourseDesc(c.description || '')
    setCourseTeacherId(c.teacher_id)
    setCourseBranchId(c.branch_id || '')
    setCourseStatus(c.status === 'published' ? 'published' : 'draft')
    setIsCourseModalOpen(true)
  }

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCollege || !courseTitle.trim() || !courseTeacherId) return
    setCourseBusy(true)
    setError(null)
    try {
      if (editingCourse) {
        await institutionAdminApi.updateCourse(activeCollege.id, editingCourse.id, {
          title: courseTitle.trim(),
          subject: courseSubject.trim() || undefined,
          description: courseDesc.trim() || undefined,
          teacher_id: courseTeacherId,
          branch_id: courseBranchId || null,
          status: courseStatus,
        })
        setNotice(`Course "${courseTitle.trim()}" updated successfully.`)
      } else {
        await institutionAdminApi.createCourse(activeCollege.id, {
          title: courseTitle.trim(),
          subject: courseSubject.trim() || undefined,
          description: courseDesc.trim() || undefined,
          teacher_id: courseTeacherId,
          branch_id: courseBranchId || null,
          status: courseStatus,
        })
        setNotice(`Course "${courseTitle.trim()}" created successfully.`)
      }
      setIsCourseModalOpen(false)
      loadCourses(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Failed to save course.')
    } finally {
      setCourseBusy(false)
    }
  }

  const handleDeleteCourse = async () => {
    if (!deletingCourse || !activeCollege) return
    setCourseBusy(true)
    try {
      await institutionAdminApi.deleteCourse(activeCollege.id, deletingCourse.id)
      setNotice(`Course "${deletingCourse.title}" deleted successfully.`)
      setDeletingCourse(null)
      loadCourses(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Failed to delete course.')
    } finally {
      setCourseBusy(false)
    }
  }

  // -------------------------------------------------------------
  // PROFILE CRUD & BRANCH REASSIGNMENT STATE
  // -------------------------------------------------------------
  const [editingMember, setEditingMember] = useState<PendingUser | null>(null)
  const [editMemberName, setEditMemberName] = useState('')
  const [editMemberEmail, setEditMemberEmail] = useState('')
  const [editMemberBranchId, setEditMemberBranchId] = useState('')
  const [editMemberSectionId, setEditMemberSectionId] = useState('')
  const [editMemberAllSections, setEditMemberAllSections] = useState(false)
  const [memberSaveBusy, setMemberSaveBusy] = useState(false)
  const [removingMember, setRemovingMember] = useState<PendingUser | null>(null)

  const openEditMemberModal = (m: PendingUser) => {
    setEditingMember(m)
    setEditMemberName(m.full_name)
    setEditMemberEmail(m.email)
    setEditMemberBranchId(m.branch_id || '')
    setEditMemberSectionId(m.section_id || '')
    setEditMemberAllSections(m.all_sections ?? false)
    if (m.branch_id && !branchSections[m.branch_id]) {
      loadSectionsForBranch(m.branch_id)
    }
  }

  const handleSaveMemberProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMember || !activeCollege) return
    setMemberSaveBusy(true)
    setError(null)
    try {
      await institutionAdminApi.updateMemberProfile(activeCollege.id, editingMember.id, {
        full_name: editMemberName.trim(),
        email: editMemberEmail.trim(),
        branch_id: editMemberBranchId || null,
        section_id: editMemberAllSections ? null : editMemberSectionId || null,
        all_sections: editingMember.role === 'teacher' ? editMemberAllSections : false,
      })
      setNotice(`Profile and branch assignment for ${editMemberName} updated.`)
      setEditingMember(null)
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Could not update profile.')
    } finally {
      setMemberSaveBusy(false)
    }
  }

  const handleToggleSuspendMember = async (m: PendingUser) => {
    if (!activeCollege) return
    try {
      if (m.status === 'suspended') {
        await institutionAdminApi.reactivateMember(activeCollege.id, m.id)
        setNotice(`Reactivated ${m.full_name}.`)
      } else {
        await institutionAdminApi.suspendMember(activeCollege.id, m.id)
        setNotice(`Suspended ${m.full_name}.`)
      }
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Action failed.')
    }
  }

  const handleRemoveMember = async () => {
    if (!removingMember || !activeCollege) return
    try {
      await institutionAdminApi.deleteMember(activeCollege.id, removingMember.id)
      setNotice(`Removed ${removingMember.full_name} from institution.`)
      setRemovingMember(null)
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Could not remove member.')
    }
  }

  // -------------------------------------------------------------
  // APPROVALS ACTIONS & SECTION ALLOCATION
  // -------------------------------------------------------------
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([])
  const [bulkActing, setBulkActing] = useState(false)
  const [screeningResults, setScreeningResults] = useState<Record<string, AiScreenedApplicant>>({})

  // Single Approval Modal state
  const [approvingUser, setApprovingUser] = useState<PendingUser | null>(null)
  const [approveBranchId, setApproveBranchId] = useState('')
  const [approveSectionId, setApproveSectionId] = useState('')
  const [approveAllSections, setApproveAllSections] = useState(false)
  const [approveBusy, setApproveBusy] = useState(false)

  // Bulk Approval Modal state
  const [isBulkReviewOpen, setIsBulkReviewOpen] = useState(false)
  const [bulkAllocations, setBulkAllocations] = useState<
    Record<string, { branch_id?: string | null; section_id?: string | null; all_sections?: boolean }>
  >({})
  const [batchBranchSections, setBatchBranchSections] = useState<Record<string, string>>({})

  const openApproveModal = (u: PendingUser) => {
    setApprovingUser(u)
    const bId = u.branch_id || (branches.length > 0 ? branches[0].id : '')
    setApproveBranchId(bId)
    setApproveSectionId(u.section_id || '')
    setApproveAllSections(u.role === 'teacher' && Boolean(u.all_sections))
    if (bId && !branchSections[bId]) {
      loadSectionsForBranch(bId)
    }
  }

  const handleConfirmSingleApprove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCollege || !approvingUser) return
    setApproveBusy(true)
    try {
      await institutionAdminApi.approveRegistration(activeCollege.id, approvingUser.id, {
        branch_id: approveBranchId || null,
        section_id: approveAllSections ? null : (approveSectionId || null),
        all_sections: approveAllSections,
      })
      setNotice(`Approved registration for ${approvingUser.full_name}.`)
      setApprovingUser(null)
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Could not approve registration.')
    } finally {
      setApproveBusy(false)
    }
  }

  const handleReject = async (userId: string) => {
    if (!activeCollege) return
    try {
      await institutionAdminApi.rejectRegistration(activeCollege.id, userId)
      setNotice('Registration rejected.')
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Could not reject registration.')
    }
  }

  const openBulkReviewModal = () => {
    if (selectedPendingIds.length === 0) return
    const selectedUsers = pendingApprovals.filter((p) => selectedPendingIds.includes(p.id))
    const initialAlloc: Record<string, { branch_id?: string | null; section_id?: string | null; all_sections?: boolean }> = {}
    selectedUsers.forEach((u) => {
      const bId = u.branch_id || (branches.length > 0 ? branches[0].id : '')
      initialAlloc[u.id] = {
        branch_id: bId,
        section_id: u.section_id || '',
        all_sections: u.role === 'teacher' && Boolean(u.all_sections),
      }
      if (bId && !branchSections[bId]) {
        loadSectionsForBranch(bId)
      }
    })
    setBulkAllocations(initialAlloc)
    setIsBulkReviewOpen(true)
  }

  const handleApplyBatchSection = (branchId: string, sectionId: string) => {
    if (!branchId || !sectionId) return
    setBulkAllocations((prev) => {
      const next = { ...prev }
      selectedPendingIds.forEach((id) => {
        const user = pendingApprovals.find((p) => p.id === id)
        if (user && (next[id]?.branch_id === branchId || user.branch_id === branchId)) {
          next[id] = {
            ...next[id],
            branch_id: branchId,
            section_id: sectionId,
            all_sections: false,
          }
        }
      })
      return next
    })
  }

  const handleConfirmBulkApprove = async () => {
    if (!activeCollege || selectedPendingIds.length === 0) return
    setBulkActing(true)
    try {
      const allocationsList = selectedPendingIds.map((id) => ({
        user_id: id,
        branch_id: bulkAllocations[id]?.branch_id || null,
        section_id: bulkAllocations[id]?.all_sections ? null : (bulkAllocations[id]?.section_id || null),
        all_sections: Boolean(bulkAllocations[id]?.all_sections),
      }))
      const res = await institutionAdminApi.bulkApproveRegistrations(
        activeCollege.id,
        selectedPendingIds,
        allocationsList
      )
      setNotice(res.message)
      setSelectedPendingIds([])
      setIsBulkReviewOpen(false)
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Bulk approval failed.')
    } finally {
      setBulkActing(false)
    }
  }

  const handleAiAutoApprove = async () => {
    if (!activeCollege) return
    setBulkActing(true)
    try {
      const res = await institutionAdminApi.aiAutoApproveRegistrations(activeCollege.id)
      setNotice(res.message)
      loadMembers(activeCollege.id)
    } catch (err: any) {
      setError(err.message || 'Auto-approve failed.')
    } finally {
      setBulkActing(false)
    }
  }

  const handleAiScreen = async () => {
    if (!activeCollege) return
    try {
      const list = await institutionAdminApi.aiScreenRegistrations(activeCollege.id)
      const map: Record<string, AiScreenedApplicant> = {}
      list.forEach((s) => (map[s.user_id] = s))
      setScreeningResults(map)
      setNotice('AI applicant screening completed.')
    } catch (err: any) {
      setError(err.message || 'AI Screening failed.')
    }
  }

  // Code Regeneration
  const [isRegenerating, setIsRegenerating] = useState(false)
  const handleRegenerateCode = async () => {
    if (!activeCollege) return
    if (!confirm(`Are you sure you want to regenerate the registration code for ${activeCollege.name}? The old code will expire.`)) return
    setIsRegenerating(true)
    try {
      await institutionAdminApi.regenerateCode(activeCollege.id)
      setNotice('New institutional registration code generated successfully.')
      setRefreshTick((t) => t + 1)
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate code.')
    } finally {
      setIsRegenerating(false)
    }
  }

  if (colleges === null) {
    if (error) {
      return (
        <PageContainer maxWidth="2xl">
          <ErrorState message={error} onRetry={loadColleges} />
        </PageContainer>
      )
    }
    return (
      <PageContainer maxWidth="2xl">
        <LoadingState message="Loading your institution console..." />
      </PageContainer>
    )
  }

  if (colleges.length === 0) {
    return (
      <PageContainer maxWidth="2xl">
        <EmptyState
          icon={<Building2 className="w-8 h-8 text-[#0F5B57]" />}
          title="No Institution Delegated"
          description="Your account is not assigned to administer an institution. Platform administrators can delegate management of branches, courses, and rosters."
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer maxWidth="2xl">
      {/* Top Header & College Switcher */}
      <div className="mb-6 p-6 bg-[#FFFFFF] border border-[#E1E8E4] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-[#0F5B57] bg-[#DDF3EA] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-block border border-[#CBD7D1]">
              Institution Admin Console
            </span>
            {colleges.length > 1 && (
              <select
                value={selectedCollegeId || ''}
                onChange={(e) => setSelectedCollegeId(e.target.value)}
                className="text-xs font-semibold text-[#0F5B57] bg-[#F8FAF7] border border-[#CBD7D1] rounded px-2 py-0.5"
              >
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202B2A]">
            {activeCollege?.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#687775] mt-1 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {activeCollege?.location || 'Campus'}
            </span>
            <span className="flex items-center gap-1 font-mono text-[#0F5B57] font-semibold bg-[#DDF3EA]/60 px-2 py-0.5 rounded">
              Code: {activeCollege?.code}
            </span>
            <Badge variant={activeCollege?.status === 'active' ? 'success' : 'secondary'} size="sm">
              {activeCollege?.status?.toUpperCase()}
            </Badge>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<KeyRound className="w-3.5 h-3.5" />}
            isLoading={isRegenerating}
            onClick={handleRegenerateCode}
          >
            Regenerate Code
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={isNative ? <RefreshCw className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            onClick={() => (isNative ? setIsUpdateOpen(true) : setIsDownloadOpen(true))}
          >
            {isNative ? 'Updates' : 'Client App'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => setRefreshTick((t) => t + 1)}
          >
            Sync Data
          </Button>
        </div>
      </div>

      {notice && (
        <div className="mb-4 p-3 rounded-lg bg-[#E5F5EB] border border-[#247A4D]/30 text-[#247A4D] text-xs font-medium flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-[#247A4D] hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#FDE8E7] border border-[#B42318]/30 text-[#B42318] text-xs font-medium flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-[#B42318] hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E1E8E4] pb-2 mb-6 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'overview'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Overview
        </button>

        <button
          onClick={() => setTab('branches')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'branches'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Branches &amp; Depts
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{branches.length}</span>
        </button>

        <button
          onClick={() => setTab('courses')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'courses'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Course Catalog
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{courses.length}</span>
        </button>

        <button
          onClick={() => setTab('teachers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'teachers'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Teachers Directory
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{teachers.length}</span>
        </button>

        <button
          onClick={() => setTab('students')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'students'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <Users className="w-4 h-4" />
          Students Directory
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{students.length}</span>
        </button>

        <button
          onClick={() => setTab('approvals')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'approvals'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Pending Approvals
          {pendingApprovals.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[#B42318] text-white">
              {pendingApprovals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('settings')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
            currentTab === 'settings'
              ? 'bg-[#0F5B57] text-[#FFFFFF]'
              : 'text-[#687775] hover:bg-[#DDF3EA] hover:text-[#123B39]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Settings
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'overview' && (
        <div className="flex flex-col gap-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-[#687775] mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Branches</span>
                  <GitBranch className="w-4 h-4 text-[#0F5B57]" />
                </div>
                <p className="text-2xl font-bold text-[#202B2A]">{branches.length}</p>
                <p className="text-[11px] text-[#687775] mt-1">Active Departments</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-[#687775] mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Courses</span>
                  <BookOpen className="w-4 h-4 text-[#0F5B57]" />
                </div>
                <p className="text-2xl font-bold text-[#202B2A]">{courses.length}</p>
                <p className="text-[11px] text-[#687775] mt-1">Branch-Mapped Courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-[#687775] mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Teachers</span>
                  <GraduationCap className="w-4 h-4 text-[#0F5B57]" />
                </div>
                <p className="text-2xl font-bold text-[#202B2A]">{teachers.length}</p>
                <p className="text-[11px] text-[#687775] mt-1">Faculty Members</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-[#687775] mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Students</span>
                  <Users className="w-4 h-4 text-[#0F5B57]" />
                </div>
                <p className="text-2xl font-bold text-[#202B2A]">{students.length}</p>
                <p className="text-[11px] text-[#687775] mt-1">Enrolled Learners</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions Card */}
          <Card>
            <CardHeader><h3 className="text-base font-bold text-[#202B2A]">Institutional Administration Overview</h3></CardHeader>
            <CardContent className="p-5 flex flex-col gap-4">
              <p className="text-xs text-[#687775] leading-relaxed">
                As the administrator for <strong>{activeCollege?.name}</strong>, you manage the complete department hierarchy, course offerings, and user assignments.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setTab('branches')}
                  className="p-3 text-left rounded-xl border border-[#CBD7D1] hover:border-[#0F5B57] bg-[#F8FAF7] hover:bg-[#DDF3EA]/40 transition-all flex flex-col gap-1"
                >
                  <span className="text-xs font-bold text-[#202B2A] flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-[#0F5B57]" />
                    Branch CRUD
                  </span>
                  <span className="text-[11px] text-[#687775]">Add, edit, delete branches &amp; sections</span>
                </button>

                <button
                  onClick={() => setTab('courses')}
                  className="p-3 text-left rounded-xl border border-[#CBD7D1] hover:border-[#0F5B57] bg-[#F8FAF7] hover:bg-[#DDF3EA]/40 transition-all flex flex-col gap-1"
                >
                  <span className="text-xs font-bold text-[#202B2A] flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#0F5B57]" />
                    Course Mapping
                  </span>
                  <span className="text-[11px] text-[#687775]">Create courses mapped under branches</span>
                </button>

                <button
                  onClick={() => setTab('approvals')}
                  className="p-3 text-left rounded-xl border border-[#CBD7D1] hover:border-[#0F5B57] bg-[#F8FAF7] hover:bg-[#DDF3EA]/40 transition-all flex flex-col gap-1"
                >
                  <span className="text-xs font-bold text-[#202B2A] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#0F5B57]" />
                    Review Registrations
                  </span>
                  <span className="text-[11px] text-[#687775]">{pendingApprovals.length} pending candidate(s)</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: BRANCH MANAGEMENT (FULL CRUD) */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'branches' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#202B2A]">Branch &amp; Department Management</h2>
              <p className="text-xs text-[#687775]">
                Configure institutional departments and sections. Full CRUD enabled with instant updates.
              </p>
            </div>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={openCreateBranchModal}
            >
              Add Branch
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#687775]" />
              <input
                type="text"
                placeholder="Search branches..."
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#CBD7D1] bg-white focus:outline-none focus:ring-1 focus:ring-[#0F5B57]"
              />
            </div>
          </div>

          {branchesLoading ? (
            <LoadingState message="Loading branches..." />
          ) : branches.length === 0 ? (
            <EmptyState
              icon={<GitBranch className="w-6 h-6" />}
              title="No branches found"
              description="Click 'Add Branch' to define your first department."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {branches
                .filter((b) => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                .map((b) => {
                  const isExpanded = expandedBranchId === b.id
                  const secs = branchSections[b.id] || []
                  return (
                    <Card key={b.id} className="overflow-hidden">
                      <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleExpandBranch(b.id)}
                            className="p-1 rounded hover:bg-[#DDF3EA] text-[#0F5B57] transition-all"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-[#202B2A]">{b.name}</p>
                              {b.short_code && (
                                <span className="text-[11px] font-mono font-bold text-[#0F5B57] bg-[#DDF3EA] px-1.5 py-0.2 rounded">
                                  {b.short_code}
                                </span>
                              )}
                              <Badge variant={b.status === 'active' ? 'success' : 'secondary'} size="sm">
                                {b.status}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-[#687775] mt-0.5">
                              {secs.length > 0 ? `${secs.length} section(s)` : 'Click arrow to view sections'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Pencil className="w-3.5 h-3.5" />}
                            onClick={() => openEditBranchModal(b)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[#B42318] hover:bg-[#FDE8E7]"
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => setDeletingBranch(b)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Expandable Sections View */}
                      {isExpanded && (
                        <div className="border-t border-[#E1E8E4] bg-[#F8FAF7] p-4 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#687775] uppercase tracking-wider">
                              Sections under {b.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="New section (e.g., Sec A)"
                                value={newSectionName}
                                onChange={(e) => setNewSectionName(e.target.value)}
                                className="!py-1 !text-xs w-48"
                              />
                              <Button size="sm" onClick={() => handleAddSection(b.id)}>
                                Add
                              </Button>
                            </div>
                          </div>

                          {secs.length === 0 ? (
                            <p className="text-xs text-[#687775] italic">No sections created for this branch yet.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {secs.map((s) => (
                                <div
                                  key={s.id}
                                  className="p-2.5 bg-white border border-[#CBD7D1] rounded-lg flex items-center justify-between"
                                >
                                  <div>
                                    <p className="text-xs font-semibold text-[#202B2A]">{s.name}</p>
                                    <span className="text-[10px] text-[#687775]">{s.status}</span>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteSection(b.id, s.id)}
                                    className="p-1 rounded text-[#687775] hover:text-[#B42318] hover:bg-[#FDE8E7] transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: COURSE MANAGEMENT (BRANCH MAPPED) */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'courses' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#202B2A]">Course Management</h2>
              <p className="text-xs text-[#687775]">
                Create and manage courses mapped under institutional branches and assign faculty.
              </p>
            </div>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={openCreateCourseModal}
            >
              Create Course
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#687775]" />
              <select
                value={courseFilterBranch}
                onChange={(e) => setCourseFilterBranch(e.target.value)}
                className="text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {coursesLoading ? (
            <LoadingState message="Loading courses..." />
          ) : courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="w-6 h-6" />}
              title="No courses yet"
              description="Click 'Create Course' to set up a new branch-mapped course."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {courses
                .filter((c) => !courseFilterBranch || c.branch_id === courseFilterBranch)
                .map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#202B2A]">{c.title}</h3>
                          <Badge variant={c.status === 'published' ? 'success' : 'secondary'} size="sm">
                            {c.status}
                          </Badge>
                        </div>
                        {c.subject && <p className="text-xs font-medium text-[#0F5B57] mt-0.5">{c.subject}</p>}
                        {c.description && (
                          <p className="text-xs text-[#687775] mt-1 line-clamp-2">{c.description}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#687775]">
                          <span className="flex items-center gap-1 bg-[#F8FAF7] border border-[#CBD7D1] px-2 py-0.5 rounded">
                            <GraduationCap className="w-3 h-3 text-[#0F5B57]" />
                            {c.teacher_name || 'Assigned Teacher'}
                          </span>
                          {c.branch_name && (
                            <span className="flex items-center gap-1 bg-[#DDF3EA] text-[#0F5B57] font-semibold px-2 py-0.5 rounded">
                              <GitBranch className="w-3 h-3" />
                              {c.branch_name}
                            </span>
                          )}
                          <span className="bg-[#F8FAF7] border border-[#CBD7D1] px-2 py-0.5 rounded">
                            {c.enrollments_count} Student(s)
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E1E8E4] flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Pencil className="w-3.5 h-3.5" />}
                          onClick={() => openEditCourseModal(c)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[#B42318] hover:bg-[#FDE8E7]"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          onClick={() => setDeletingCourse(c)}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: TEACHERS DIRECTORY (SEPARATE VIEW & BRANCH MAPPING) */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'teachers' && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#202B2A]">Enrolled Teachers Directory</h2>
            <p className="text-xs text-[#687775]">
              View all faculty members, update profiles, reassign branches, and manage teaching scopes.
            </p>
          </div>

          {membersLoading ? (
            <LoadingState message="Loading teachers..." />
          ) : teachers.length === 0 ? (
            <EmptyState
              icon={<GraduationCap className="w-6 h-6" />}
              title="No teachers enrolled"
              description="Pending teacher registrations will appear under the Approvals tab."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {teachers.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-[#CBD7D1] rounded-xl shadow-2xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[#202B2A]">{m.full_name}</p>
                      <Badge variant={m.status === 'active' ? 'success' : 'warning'} size="sm">
                        {m.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#687775]">{m.email}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-[#0F5B57] bg-[#DDF3EA] px-2 py-0.5 rounded">
                        Branch: {m.branch_name || 'Unassigned'}
                      </span>
                      <span className="text-[#687775] bg-[#F8FAF7] border border-[#CBD7D1] px-2 py-0.5 rounded">
                        {m.all_sections ? 'All Sections (Branch-Wide)' : m.section_name || 'No Section'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pencil className="w-3.5 h-3.5" />}
                      onClick={() => openEditMemberModal(m)}
                    >
                      Edit &amp; Reassign
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={m.status === 'suspended' ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                      onClick={() => handleToggleSuspendMember(m)}
                    >
                      {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[#B42318] hover:bg-[#FDE8E7]"
                      icon={<UserMinus className="w-3.5 h-3.5" />}
                      onClick={() => setRemovingMember(m)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: STUDENTS DIRECTORY (SEPARATE VIEW & BRANCH MAPPING) */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'students' && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#202B2A]">Enrolled Students Directory</h2>
            <p className="text-xs text-[#687775]">
              View all learners enrolled in your institution, update profiles, and map branch cohorts.
            </p>
          </div>

          {membersLoading ? (
            <LoadingState message="Loading students..." />
          ) : students.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No students enrolled"
              description="Approved student accounts will appear in this directory."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {students.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-[#CBD7D1] rounded-xl shadow-2xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[#202B2A]">{m.full_name}</p>
                      <Badge variant={m.status === 'active' ? 'success' : 'warning'} size="sm">
                        {m.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#687775]">{m.email}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-[#0F5B57] bg-[#DDF3EA] px-2 py-0.5 rounded">
                        Branch: {m.branch_name || 'Unassigned'}
                      </span>
                      <span className="text-[#687775] bg-[#F8FAF7] border border-[#CBD7D1] px-2 py-0.5 rounded">
                        Section: {m.section_name || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pencil className="w-3.5 h-3.5" />}
                      onClick={() => openEditMemberModal(m)}
                    >
                      Edit &amp; Reassign
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={m.status === 'suspended' ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                      onClick={() => handleToggleSuspendMember(m)}
                    >
                      {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[#B42318] hover:bg-[#FDE8E7]"
                      icon={<UserMinus className="w-3.5 h-3.5" />}
                      onClick={() => setRemovingMember(m)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 6: PENDING APPROVALS (APPROVAL WORKFLOW) */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'approvals' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#202B2A]">Registration Approval Workflow</h2>
              <p className="text-xs text-[#687775]">
                Review incoming student &amp; teacher registrations. Screened with AI matching algorithms.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                onClick={handleAiScreen}
              >
                AI Screen
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-[#0F5B57]" />}
                isLoading={bulkActing}
                onClick={handleAiAutoApprove}
              >
                Auto-Approve High Match
              </Button>
              {selectedPendingIds.length > 0 && (
                <Button
                  size="sm"
                  isLoading={bulkActing}
                  onClick={openBulkReviewModal}
                >
                  Review &amp; Allocate Selected ({selectedPendingIds.length})
                </Button>
              )}
            </div>
          </div>

          {pendingApprovals.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="w-6 h-6 text-[#0F5B57]" />}
              title="Queue is empty"
              description="There are no pending registrations requiring review right now."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {pendingApprovals.map((p) => {
                const isSelected = selectedPendingIds.includes(p.id)
                const screen = screeningResults[p.id]
                return (
                  <div
                    key={p.id}
                    className="p-3 bg-white border border-[#CBD7D1] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          setSelectedPendingIds((ids) =>
                            isSelected ? ids.filter((id) => id !== p.id) : [...ids, p.id]
                          )
                        }
                        className="rounded border-[#CBD7D1] text-[#0F5B57] focus:ring-[#0F5B57]"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[#202B2A]">{p.full_name}</p>
                          <Badge variant={p.role === 'teacher' ? 'default' : 'secondary'} size="sm">
                            {p.role}
                          </Badge>
                          {screen && (
                            <Badge
                              variant={
                                screen.ai_recommendation === 'approve'
                                  ? 'success'
                                  : screen.ai_recommendation === 'review'
                                  ? 'warning'
                                  : 'error'
                              }
                              size="sm"
                            >
                              AI: {screen.ai_recommendation.toUpperCase()} ({screen.ai_score}%)
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#687775]">{p.email}</p>
                        <p className="text-[11px] text-[#687775] mt-0.5">
                          Requested Branch: <strong className="text-[#0F5B57]">{p.branch_name || 'General'}</strong>
                          {p.section_name && ` • Section: ${p.section_name}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        icon={<Check className="w-3.5 h-3.5" />}
                        onClick={() => openApproveModal(p)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[#B42318] hover:bg-[#FDE8E7]"
                        icon={<X className="w-3.5 h-3.5" />}
                        onClick={() => handleReject(p.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 7: COLLEGE SETTINGS */}
      {/* ------------------------------------------------------------- */}
      {currentTab === 'settings' && activeCollege && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><h3 className="text-base font-bold text-[#202B2A]">Institution Operational Settings</h3></CardHeader>
            <CardContent className="p-5">
              <p className="text-xs text-[#687775] mb-4">
                Configure self-registration rules, verified email domains, and platform feature flags for this campus.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-[#F8FAF7] border border-[#CBD7D1] rounded-lg">
                  <span className="text-xs font-bold text-[#202B2A]">Registration Code Proof</span>
                  <p className="text-[11px] text-[#687775] mt-1">
                    Current Code: <code className="font-mono text-[#0F5B57] font-bold">{activeCollege.code}</code>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={handleRegenerateCode}
                    isLoading={isRegenerating}
                  >
                    Regenerate Code
                  </Button>
                </div>
                <div className="p-3 bg-[#F8FAF7] border border-[#CBD7D1] rounded-lg">
                  <span className="text-xs font-bold text-[#202B2A]">Institution Status</span>
                  <p className="text-[11px] text-[#687775] mt-1">
                    Accepting Registrations: <Badge variant="success" size="sm">ACTIVE</Badge>
                  </p>
                  <p className="text-[11px] text-[#687775] mt-2">
                    Managed by delegated administrator: {activeCollege.contact_email || 'Verified'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CREATE / EDIT BRANCH */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        title={editingBranch ? 'Edit Department / Branch' : 'Add Department / Branch'}
      >
        <form onSubmit={handleSaveBranch} className="flex flex-col gap-4">
          <FormField label="Branch / Department Name" htmlFor="bName" required>
            <Input
              id="bName"
              placeholder="e.g., Computer Science & Engineering"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Short Code / Acronym (Optional)" htmlFor="bCode" hint="e.g., CSE, ECE, MECH">
            <Input
              id="bCode"
              placeholder="CSE"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              maxLength={20}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setIsBranchModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={branchBusy}>
              {editingBranch ? 'Save Changes' : 'Create Branch'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: DELETE BRANCH CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={Boolean(deletingBranch)}
        onClose={() => setDeletingBranch(null)}
        title="Delete Department / Branch"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[#B42318] leading-relaxed">
            Are you sure you want to delete branch <strong>{deletingBranch?.name}</strong>?
            This will permanently remove the branch and all its associated sections and student/teacher mappings.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDeletingBranch(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#B42318] hover:bg-[#912018] text-white"
              isLoading={branchBusy}
              onClick={handleDeleteBranch}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CREATE / EDIT COURSE */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={isCourseModalOpen}
        onClose={() => setIsCourseModalOpen(false)}
        title={editingCourse ? 'Edit Course' : 'Create Branch-Mapped Course'}
      >
        <form onSubmit={handleSaveCourse} className="flex flex-col gap-3">
          <FormField label="Course Title" htmlFor="cTitle" required>
            <Input
              id="cTitle"
              placeholder="e.g. Data Structures & Algorithms"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Subject / Domain" htmlFor="cSub">
            <Input
              id="cSub"
              placeholder="e.g. Computer Science"
              value={courseSubject}
              onChange={(e) => setCourseSubject(e.target.value)}
            />
          </FormField>
          <FormField label="Assigned Faculty / Teacher" htmlFor="cTeacher" required>
            <select
              id="cTeacher"
              value={courseTeacherId}
              onChange={(e) => setCourseTeacherId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.email})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Target Branch / Department" htmlFor="cBranch">
            <select
              id="cBranch"
              value={courseBranchId}
              onChange={(e) => setCourseBranchId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
            >
              <option value="">All Branches / General</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Publication Status" htmlFor="cStat">
            <select
              id="cStat"
              value={courseStatus}
              onChange={(e) => setCourseStatus(e.target.value as 'published' | 'draft')}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
            >
              <option value="published">Published (Visible to Students)</option>
              <option value="draft">Draft (Private)</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setIsCourseModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={courseBusy}>
              {editingCourse ? 'Save Changes' : 'Create Course'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: DELETE COURSE CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={Boolean(deletingCourse)}
        onClose={() => setDeletingCourse(null)}
        title="Delete Course"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[#B42318] leading-relaxed">
            Are you sure you want to delete course <strong>{deletingCourse?.title}</strong>?
            All enrolled students and lesson materials will be disconnected.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDeletingCourse(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#B42318] hover:bg-[#912018] text-white"
              isLoading={courseBusy}
              onClick={handleDeleteCourse}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: EDIT MEMBER PROFILE & BRANCH REASSIGNMENT */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Edit ${editingMember?.role === 'teacher' ? 'Teacher' : 'Student'} Profile & Branch`}
      >
        <form onSubmit={handleSaveMemberProfile} className="flex flex-col gap-3">
          <FormField label="Full Name" htmlFor="mName" required>
            <Input
              id="mName"
              value={editMemberName}
              onChange={(e) => setEditMemberName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Email" htmlFor="mEmail" required>
            <Input
              id="mEmail"
              type="email"
              value={editMemberEmail}
              onChange={(e) => setEditMemberEmail(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Branch / Department Assignment" htmlFor="mBranch">
            <select
              id="mBranch"
              value={editMemberBranchId}
              onChange={(e) => {
                setEditMemberBranchId(e.target.value)
                setEditMemberSectionId('')
                if (e.target.value) loadSectionsForBranch(e.target.value)
              }}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
            >
              <option value="">Select Branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>

          {editingMember?.role === 'teacher' ? (
            <div className="flex flex-col gap-2 p-3 bg-[#F8FAF7] border border-[#CBD7D1] rounded-lg">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#202B2A]">
                <input
                  type="checkbox"
                  checked={editMemberAllSections}
                  onChange={(e) => setEditMemberAllSections(e.target.checked)}
                  className="rounded text-[#0F5B57] focus:ring-[#0F5B57]"
                />
                All Sections Coverage (Branch-Wide Teaching)
              </label>
              {!editMemberAllSections && editMemberBranchId && (
                <FormField label="Designated Section" htmlFor="mSec">
                  <select
                    id="mSec"
                    value={editMemberSectionId}
                    onChange={(e) => setEditMemberSectionId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
                  >
                    <option value="">Select Section</option>
                    {(branchSections[editMemberBranchId] || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>
          ) : (
            editMemberBranchId && (
              <FormField label="Designated Section" htmlFor="sSec">
                <select
                  id="sSec"
                  value={editMemberSectionId}
                  onChange={(e) => setEditMemberSectionId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
                >
                  <option value="">Select Section</option>
                  {(branchSections[editMemberBranchId] || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={memberSaveBusy}>
              Save Profile
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: REMOVE MEMBER CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={Boolean(removingMember)}
        onClose={() => setRemovingMember(null)}
        title="Remove Member from Institution"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[#B42318] leading-relaxed">
            Are you sure you want to remove <strong>{removingMember?.full_name}</strong> from {activeCollege?.name}?
            Their account will be detached from this institution.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setRemovingMember(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#B42318] hover:bg-[#912018] text-white"
              onClick={handleRemoveMember}
            >
              Confirm Remove
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: SINGLE APPROVAL & SECTION ALLOCATION */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={Boolean(approvingUser)}
        onClose={() => setApprovingUser(null)}
        title={approvingUser?.role === 'teacher' ? 'Approve Faculty Registration' : 'Approve Student & Allocate Section'}
      >
        {approvingUser && (
          <form onSubmit={handleConfirmSingleApprove} className="flex flex-col gap-4">
            <div className="p-3 rounded-xl bg-[#F8FAF7] border border-[#CBD7D1] flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#202B2A] text-sm">{approvingUser.full_name}</span>
                <Badge variant={approvingUser.role === 'teacher' ? 'default' : 'secondary'} size="sm">
                  {approvingUser.role}
                </Badge>
              </div>
              <span className="text-[#687775]">{approvingUser.email}</span>
              {approvingUser.role === 'student' && approvingUser.branch_name && (
                <span className="text-[#0F5B57] font-medium">Requested Branch: {approvingUser.branch_name}</span>
              )}
            </div>

            {approvingUser.role === 'student' ? (
              <>
                <FormField label="Assigned Branch / Department" required>
                  <Select
                    value={approveBranchId}
                    onChange={(e) => {
                      const bId = e.target.value
                      setApproveBranchId(bId)
                      setApproveSectionId('')
                      if (bId && !branchSections[bId]) {
                        loadSectionsForBranch(bId)
                      }
                    }}
                    options={branches.map((b) => ({ value: b.id, label: `${b.name} (${b.short_code || 'General'})` }))}
                  />
                </FormField>

                <FormField label="Designated Section" required hint="Allocate cohort section for this student">
                  <Select
                    value={approveSectionId}
                    onChange={(e) => setApproveSectionId(e.target.value)}
                    options={[
                      { value: '', label: '-- Choose Cohort Section --' },
                      ...(branchSections[approveBranchId] || []).map((s) => ({
                        value: s.id,
                        label: `Section ${s.name}`,
                      })),
                    ]}
                  />
                  {(!branchSections[approveBranchId] || branchSections[approveBranchId].length === 0) && (
                    <p className="text-[11px] text-[#B42318] mt-1">
                      No sections created for this branch yet. Please create a section in Branches tab first, or the student will be assigned branch-wide.
                    </p>
                  )}
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Department / Branch" required>
                  <Select
                    value={approveBranchId}
                    onChange={(e) => {
                      const bId = e.target.value
                      setApproveBranchId(bId)
                      setApproveSectionId('')
                      if (bId && !branchSections[bId]) {
                        loadSectionsForBranch(bId)
                      }
                    }}
                    options={[
                      { value: '', label: '-- General / Unassigned --' },
                      ...branches.map((b) => ({ value: b.id, label: `${b.name} (${b.short_code || 'General'})` })),
                    ]}
                  />
                </FormField>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="singleApproveAllSec"
                    checked={approveAllSections}
                    onChange={(e) => {
                      setApproveAllSections(e.target.checked)
                      if (e.target.checked) setApproveSectionId('')
                    }}
                    className="rounded border-[#CBD7D1] text-[#0F5B57] focus:ring-[#0F5B57]"
                  />
                  <label htmlFor="singleApproveAllSec" className="text-xs text-[#202B2A] font-medium cursor-pointer">
                    Teach All Sections in this Branch (Branch-wide coverage)
                  </label>
                </div>

                {!approveAllSections && approveBranchId && (
                  <FormField label="Primary Section (Optional)">
                    <Select
                      value={approveSectionId}
                      onChange={(e) => setApproveSectionId(e.target.value)}
                      options={[
                        { value: '', label: '-- None (Department General) --' },
                        ...(branchSections[approveBranchId] || []).map((s) => ({
                          value: s.id,
                          label: `Section ${s.name}`,
                        })),
                      ]}
                    />
                  </FormField>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#CBD7D1]">
              <Button size="sm" variant="outline" type="button" onClick={() => setApprovingUser(null)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" isLoading={approveBusy} icon={<Check className="w-4 h-4" />}>
                Approve &amp; Grant Access
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: BULK APPROVAL & SECTION ALLOCATION REVIEW */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={isBulkReviewOpen}
        onClose={() => setIsBulkReviewOpen(false)}
        title={`Review & Allocate Registrations (${selectedPendingIds.length} Selected)`}
      >
        <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
          <p className="text-xs text-[#687775] leading-relaxed">
            Review incoming student registration requests and designate cohort sections before approving.
          </p>

          {/* Quick Batch Allocation Tool for Branches */}
          {Array.from(
            new Set(
              pendingApprovals
                .filter((p) => selectedPendingIds.includes(p.id) && p.role === 'student' && p.branch_id)
                .map((p) => p.branch_id!)
            )
          ).map((branchId) => {
            const branch = branches.find((b) => b.id === branchId)
            const countInBranch = pendingApprovals.filter(
              (p) => selectedPendingIds.includes(p.id) && p.branch_id === branchId
            ).length
            const sections = branchSections[branchId] || []
            const selectedBatchSec = batchBranchSections[branchId] || ''
            return (
              <div
                key={branchId}
                className="p-3 bg-[#EAF6F0] border border-[#0F5B57]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-bold text-[#0F5B57]">
                    Batch Assign for {branch?.name || 'Branch'} ({countInBranch} students):
                  </span>
                  <p className="text-[11px] text-[#687775]">Allocate the same section to all selected students in this branch.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedBatchSec}
                    onChange={(e) => setBatchBranchSections((prev) => ({ ...prev, [branchId]: e.target.value }))}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A] focus:outline-none focus:ring-1 focus:ring-[#0F5B57]"
                  >
                    <option value="">-- Choose Section --</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        Section {s.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedBatchSec}
                    onClick={() => handleApplyBatchSection(branchId, selectedBatchSec)}
                  >
                    Apply to All
                  </Button>
                </div>
              </div>
            )
          })}

          {/* List of members to review */}
          <div className="flex flex-col gap-3">
            {pendingApprovals
              .filter((p) => selectedPendingIds.includes(p.id))
              .map((p) => {
                const alloc = bulkAllocations[p.id] || {}
                const currentBranchId = alloc.branch_id || p.branch_id || ''
                const currentSectionId = alloc.section_id || ''
                const sections = branchSections[currentBranchId] || []
                return (
                  <div
                    key={p.id}
                    className="p-3 bg-white border border-[#CBD7D1] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#202B2A] truncate">{p.full_name}</span>
                        <Badge variant={p.role === 'teacher' ? 'default' : 'secondary'} size="sm">
                          {p.role}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[#687775] truncate">{p.email}</p>
                      {p.role === 'student' && (
                        <p className="text-[11px] text-[#0F5B57] font-medium mt-0.5">
                          Department: {p.branch_name || 'General'}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {p.role === 'student' ? (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-[#687775] font-medium">Cohort Section:</label>
                          <select
                            value={currentSectionId}
                            onChange={(e) =>
                              setBulkAllocations((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...prev[p.id],
                                  branch_id: currentBranchId,
                                  section_id: e.target.value,
                                },
                              }))
                            }
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A] focus:outline-none focus:ring-1 focus:ring-[#0F5B57]"
                          >
                            <option value="">-- Select Section --</option>
                            {sections.map((s) => (
                              <option key={s.id} value={s.id}>
                                Section {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-[#687775] font-medium">Branch:</label>
                          <select
                            value={currentBranchId}
                            onChange={(e) => {
                              const bId = e.target.value
                              if (bId && !branchSections[bId]) loadSectionsForBranch(bId)
                              setBulkAllocations((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...prev[p.id],
                                  branch_id: bId,
                                  section_id: '',
                                },
                              }))
                            }}
                            className="text-xs px-2 py-1.5 rounded-lg border border-[#CBD7D1] bg-white text-[#202B2A]"
                          >
                            <option value="">-- General --</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[11px] text-[#202B2A] ml-2">
                            <input
                              type="checkbox"
                              checked={Boolean(alloc.all_sections)}
                              onChange={(e) =>
                                setBulkAllocations((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    all_sections: e.target.checked,
                                    section_id: e.target.checked ? '' : alloc.section_id,
                                  },
                                }))
                              }
                              className="rounded border-[#CBD7D1] text-[#0F5B57]"
                            />
                            All Sections
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CBD7D1]">
            <Button size="sm" variant="outline" onClick={() => setIsBulkReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={bulkActing}
              onClick={handleConfirmBulkApprove}
              icon={<Check className="w-4 h-4" />}
            >
              Confirm &amp; Approve All ({selectedPendingIds.length})
            </Button>
          </div>
        </div>
      </Dialog>

      <AppDownloadModal isOpen={isDownloadOpen} onClose={() => setIsDownloadOpen(false)} />
      <AppUpdateModal isOpen={isUpdateOpen} onClose={() => setIsUpdateOpen(false)} />
    </PageContainer>
  )
}
