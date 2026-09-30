import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrawEngine } from './draw-engine'
import { demoParticipants, emptyActivity } from './defaults'
import type { StorageRepository } from './types'

function setup(commitDraw = vi.fn(async () => {})) {
  const data = { ...emptyActivity(), participants: demoParticipants(10) }
  const repository: StorageRepository = { load: async () => data, replace: async () => {}, commitDraw, getAsset: async () => undefined, getAssets: async () => [], loadBundle: async () => ({ data, assets: [] }) }
  const committed = vi.fn()
  const engine = new DrawEngine(repository, () => data, () => {}, committed)
  return { engine, repository, committed, data }
}

describe('抽奖状态机', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  it('默认自动模式在 5 秒后停止并保存', async () => {
    const { engine, repository, committed } = setup()
    engine.start('prize-3', 2)
    await vi.advanceTimersByTimeAsync(4999)
    expect(engine.state.phase).toBe('rolling')
    expect(repository.commitDraw).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.state.phase).toBe('revealing')
    expect(engine.state.record?.winners).toHaveLength(2)
    expect(repository.commitDraw).toHaveBeenCalledTimes(1)
    expect(committed).toHaveBeenCalledTimes(1)
  })
  it('按本轮开始时的配置计时，连续开始不会重置计时', async () => {
    const { engine, repository, data } = setup()
    data.settings.autoStopSeconds = 8
    engine.start('prize-3', 1)
    await vi.advanceTimersByTimeAsync(3000)
    data.settings.autoStopSeconds = 60
    engine.start('prize-3', 2)
    await vi.advanceTimersByTimeAsync(4999)
    expect(engine.state.phase).toBe('rolling')
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.state.record?.winners).toHaveLength(1)
    expect(repository.commitDraw).toHaveBeenCalledTimes(1)
  })
  it('手动模式不会自动停止，点击后只保存一次', async () => {
    const { engine, repository, data } = setup()
    data.settings.drawMode = 'manual'
    engine.start('prize-3', 2)
    await vi.advanceTimersByTimeAsync(120000)
    expect(engine.state.phase).toBe('rolling')
    expect(repository.commitDraw).not.toHaveBeenCalled()
    await Promise.all([engine.stop(), engine.stop()])
    expect(repository.commitDraw).toHaveBeenCalledTimes(1)
  })
  it('提前手动停止取消计时，不会停止下一轮', async () => {
    const { engine, repository, data } = setup()
    engine.start('prize-3', 1)
    await vi.advanceTimersByTimeAsync(1000)
    await engine.stop()
    engine.finishReveal()
    data.settings.drawMode = 'manual'
    engine.start('prize-3', 1)
    await vi.advanceTimersByTimeAsync(6000)
    expect(engine.state.phase).toBe('rolling')
    expect(repository.commitDraw).toHaveBeenCalledTimes(1)
  })
  it('到期和手动停止同时触发仍只保存一条记录', async () => {
    const { engine, repository } = setup()
    engine.start('prize-3', 1)
    setTimeout(() => { void engine.stop() }, 5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(engine.state.phase).toBe('revealing')
    expect(repository.commitDraw).toHaveBeenCalledTimes(1)
  })
  it('自动保存失败可重试相同结果，不再启动计时或重新抽取', async () => {
    const write = vi.fn(async () => {})
    write.mockRejectedValueOnce(new Error('磁盘已满'))
    const { engine } = setup(write)
    engine.start('prize-3', 2)
    await vi.advanceTimersByTimeAsync(5000)
    const reserved = engine.state.record
    expect(engine.state.error).toBe('磁盘已满')
    await vi.advanceTimersByTimeAsync(60000)
    expect(write).toHaveBeenCalledTimes(1)
    await engine.retry()
    expect(write.mock.calls[0]).toEqual(write.mock.calls[1])
    expect(engine.state.record).toBe(reserved)
    expect(engine.state.phase).toBe('revealing')
  })
  it('恢复待机清除旧计时，不影响新一轮手动抽奖', async () => {
    const { engine, repository, data } = setup()
    engine.start('prize-3', 1)
    await vi.advanceTimersByTimeAsync(1000)
    engine.restore(null)
    data.settings.drawMode = 'manual'
    engine.start('prize-3', 1)
    await vi.advanceTimersByTimeAsync(6000)
    expect(engine.state.phase).toBe('rolling')
    expect(repository.commitDraw).not.toHaveBeenCalled()
  })
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
