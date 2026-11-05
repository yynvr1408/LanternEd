import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/db'
import type { Summary } from '../types'

const cacheSummary = (classId: string) =>
  db.cachedSummaries.put({
    classId,
    courseId: 'course-1',
    status: 'completed',
    reviewStatus: 'approved',
    updatedAt: new Date().toISOString(),
    payload: { class_id: classId } as unknown as Summary,
  })

describe('offline data ownership', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.cachedSummaries.clear()
  })

  it('keeps offline data when the same account signs back in', async () => {
    await db.claimDataOwner('user-a')
    await cacheSummary('class-1')

    await db.claimDataOwner('user-a')

    expect(await db.cachedSummaries.count()).toBe(1)
  })

  it('wipes the previous account\'s offline data when a different account signs in', async () => {
    await db.claimDataOwner('user-a')
    await cacheSummary('class-1')

    await db.claimDataOwner('user-b')

    expect(await db.cachedSummaries.count()).toBe(0)
    expect(localStorage.getItem('eduvillage_data_owner')).toBe('user-b')
  })

  it('does not wipe data it cannot attribute (first sign-in after upgrade)', async () => {
    await cacheSummary('class-1')

    await db.claimDataOwner('user-a')

    expect(await db.cachedSummaries.count()).toBe(1)
  })
})
