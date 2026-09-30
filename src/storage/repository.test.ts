import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexedDBRepository } from './repository'
import { demoParticipants, emptyActivity } from '@/domain/defaults'
import { createRecord } from '@/domain/lottery'

let repo: IndexedDBRepository
beforeEach(() => { repo = new IndexedDBRepository(`test-${crypto.randomUUID()}`) })
afterEach(async () => { vi.restoreAllMocks(); await repo.db.delete() })

describe('IndexedDB 活动事务', () => {
  it('首次打开提供奖项模板，不自动加载演示参与者', async () => {
    const data = await repo.load()
    expect(data.participants).toHaveLength(0)
    expect(data.prizes).toHaveLength(3)
  })
  it('刷新后保留导入顺序，不受随机 ID 排序影响', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(4) }
    data.participants = [...data.participants].reverse()
    await repo.replace(data)
    expect((await repo.load()).participants.map(p => p.id)).toEqual(data.participants.map(p => p.id))
  })
  it('旧活动缺少停止配置时补默认值，并保留名单和中奖记录', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(2) }
    await repo.replace(data)
    await repo.commitDraw(createRecord(data, 'prize-3', 1))
    const original = await repo.load()
    const legacy = structuredClone(original.settings)
    Reflect.deleteProperty(legacy, 'drawMode')
    Reflect.deleteProperty(legacy, 'autoStopSeconds')
    await repo.db.settings.update('activity', { value: legacy })
    expect(await repo.load()).toEqual(original)
    expect((await repo.load()).settings).toMatchObject({ drawMode: 'auto', autoStopSeconds: 5 })
  })
  it('结果提交幂等，刷新后恢复相同记录', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(10) }
    await repo.replace(data)
    const record = createRecord(data, 'prize-3', 2)
    await repo.commitDraw(record); await repo.commitDraw(record)
    expect((await repo.load()).records).toEqual([record])
  })
  it('事务检查实时候选池，禁止重复中奖', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(3) }
    await repo.replace(data)
    const record = createRecord(data, 'prize-3', 1)
    await repo.commitDraw(record)
    await expect(repo.commitDraw({ ...record, id: crypto.randomUUID() })).rejects.toThrow('候选名单发生变化')
    expect((await repo.load()).records).toHaveLength(1)
  })
  it('图片引用缺失导致事务回滚，保留原始名单与图片', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(1) }
    data.participants[0].avatarId = 'original'
    await repo.replace(data, [{ id: 'original', blob: new Blob(['old'], { type: 'image/png' }) }])
    const next = structuredClone(data)
    next.participants[0].name = '新名字'; next.participants[0].avatarId = 'missing'
    await expect(repo.replace(next, [], true)).rejects.toThrow('图片资源缺失')
    expect(await repo.load()).toEqual(data)
    expect((await repo.getAssets()).map(a => a.id)).toEqual(['original'])
  })
  it('图片写入失败不会覆盖已有数据', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(1) }
    await repo.replace(data)
    const next = structuredClone(data); next.participants[0].avatarId = 'new-image'
    vi.spyOn(repo.db.assets, 'bulkPut').mockRejectedValueOnce(new DOMException('已满', 'QuotaExceededError'))
    await expect(repo.replace(next, [{ id: 'new-image', blob: new Blob(['new']) }])).rejects.toThrow()
    expect(await repo.load()).toEqual(data)
  })
  it('历史中奖头像保持引用，清空记录后回收无引用图片', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(1) }
    data.participants[0].avatarId = 'old-avatar'
    await repo.replace(data, [{ id: 'old-avatar', blob: new Blob(['old']) }])
    await repo.commitDraw(createRecord(data, 'prize-1', 1))
    const next = await repo.load(); next.participants[0].avatarId = 'new-avatar'
    await repo.replace(next, [{ id: 'new-avatar', blob: new Blob(['new']) }])
    expect((await repo.getAssets()).map(a => a.id).sort()).toEqual(['new-avatar', 'old-avatar'])
    await repo.replace({ ...next, records: [] })
    expect((await repo.getAssets()).map(a => a.id)).toEqual(['new-avatar'])
  })
})
