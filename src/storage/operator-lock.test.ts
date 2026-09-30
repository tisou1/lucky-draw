import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireOperatorLock } from './operator-lock'

afterEach(() => vi.unstubAllGlobals())

describe('单页面操作锁', () => {
  it('锁被其他页面持有时进入只读，不等待后偷偷获取', async () => {
    const request = vi.fn(async (_: string, options: LockOptions, callback: LockGrantedCallback) => {
      expect(options.ifAvailable).toBe(true)
      return callback(null)
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const change = vi.fn()
    acquireOperatorLock(change)
    await request.mock.results[0].value
    expect(change).toHaveBeenCalledExactlyOnceWith(false)
  })
  it('操作页面关闭时释放锁', async () => {
    const request = vi.fn(async (_: string, _options: LockOptions, callback: LockGrantedCallback) => callback({ name: 'operator', mode: 'exclusive' }))
    vi.stubGlobal('navigator', { locks: { request } })
    const change = vi.fn()
    const close = acquireOperatorLock(change)
    expect(change).toHaveBeenCalledExactlyOnceWith(true)
    close(); await request.mock.results[0].value
    expect(change.mock.calls).toEqual([[true], [false]])
  })
  it('不支持 Web Locks 的环境保持只读', () => {
    vi.stubGlobal('navigator', {})
    const change = vi.fn()
    acquireOperatorLock(change)
    expect(change).toHaveBeenCalledExactlyOnceWith(false)
  })
})
