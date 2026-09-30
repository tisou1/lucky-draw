import { describe, expect, it, vi } from 'vitest'
import { DrawEngine } from './draw-engine'
import { demoParticipants, emptyActivity } from './defaults'
import type { StorageRepository } from './types'

function setup(commitDraw = vi.fn(async () => {})) {
  const data = { ...emptyActivity(), participants: demoParticipants(10) }
  const repository: StorageRepository = { load: async () => data, replace: async () => {}, commitDraw, getAsset: async () => undefined, getAssets: async () => [], loadBundle: async () => ({ data, assets: [] }) }
  const committed = vi.fn()
  const engine = new DrawEngine(repository, () => data, () => {}, committed)
  return { engine, repository, committed }
}

describe('抽奖状态机', () => {
  it('连续开始与停止只保存一次，保存后才能揭晓', async () => {
    let finish!: () => void
    const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const { engine, committed } = setup(write)
    engine.start('prize-3', 2); engine.start('prize-3', 3)
    const stop = engine.stop(); await engine.stop()
    expect(write).toHaveBeenCalledTimes(1)
    expect(engine.state.phase).toBe('saving')
    expect(committed).not.toHaveBeenCalled()
    finish(); await stop
    expect(engine.state.record?.winners).toHaveLength(2)
    expect(engine.state.phase).toBe('revealing')
    engine.finishReveal(); expect(engine.state.phase).toBe('result')
  })
  it('保存失败重试相同记录，不重新抽取', async () => {
    const write = vi.fn(async () => {})
    write.mockRejectedValueOnce(new Error('磁盘已满'))
    const { engine } = setup(write)
    engine.start('prize-3', 2); await engine.stop()
    const reserved = engine.state.record
    expect(engine.state.phase).toBe('saving'); expect(engine.state.error).toBe('磁盘已满')
    engine.start('prize-2', 1)
    await engine.retry()
    expect(write.mock.calls[0]).toEqual(write.mock.calls[1])
    expect(engine.state.record).toBe(reserved)
    expect(engine.state.phase).toBe('revealing')
  })
  it('刷新时恢复已保存结果；未保存滚动不会恢复', () => {
    const { engine } = setup()
    engine.start('prize-3', 1)
    engine.restore(null)
    expect(engine.state.phase).toBe('idle')
    const record = { id: 'saved', prizeId: 'prize-1', prizeName: '一等奖', gift: '礼物', createdAt: new Date().toISOString(), winners: [] }
    engine.restore(record)
    expect(engine.state.phase).toBe('result'); expect(engine.state.record).toBe(record)
  })
})
