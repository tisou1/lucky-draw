import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { createBackup, readBackup } from './backup'
import { IndexedDBRepository } from './repository'
import { demoParticipants, emptyActivity } from '@/domain/defaults'
import { createRecord } from '@/domain/lottery'

let repo: IndexedDBRepository
beforeEach(() => { repo = new IndexedDBRepository(`backup-${crypto.randomUUID()}`) })
afterEach(async () => { await repo.db.delete() })

function archive(manifest: unknown, extra: Record<string, Uint8Array> = {}) {
  const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...extra })
  return new Blob([new Uint8Array(bytes).buffer])
}

describe('完整 ZIP 备份', () => {
  it('备份恢复保留名单、奖项、规则、记录和图片', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(2) }
    data.settings.allowRepeat = true
    data.settings.drawMode = 'manual'
    data.settings.autoStopSeconds = 12
    data.participants[0].avatarId = 'avatar-1'; data.prizes[0].imageId = 'gift-1'
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV0AAAAASUVORK5CYII=', 'base64'))
    const assets = ['avatar-1', 'gift-1'].map(id => ({ id, blob: new Blob([png], { type: 'image/png' }) }))
    await repo.replace(data, assets)
    await repo.commitDraw(createRecord(data, 'prize-3', 2))
    const original = await repo.loadBundle()
    const backup = await createBackup(repo)
    await repo.replace(emptyActivity(), [], true)
    const restored = await readBackup(backup)
    await repo.replace(restored.data, restored.assets, true)
    expect(await repo.load()).toEqual(original.data)
    for (const asset of await repo.getAssets()) {
      expect(asset.blob.type).toBe('image/png')
      expect(new Uint8Array(await asset.blob.arrayBuffer())).toEqual(png)
    }
  })
  it('损坏 ZIP 不覆盖当前活动', async () => {
    const original = { ...emptyActivity(), participants: demoParticipants(3) }
    await repo.replace(original)
    await expect(readBackup(new Blob(['broken zip']))).rejects.toThrow('ZIP')
    expect(await repo.load()).toEqual(original)
  })
  it('旧备份缺少停止配置时采用默认自动停止，不修改原始清单', async () => {
    const data = emptyActivity()
    Reflect.deleteProperty(data.settings, 'drawMode')
    Reflect.deleteProperty(data.settings, 'autoStopSeconds')
    const restored = await readBackup(archive({ format: 'star-pick', version: 1, data, assets: [] }))
    expect(restored.data.settings).toMatchObject({ drawMode: 'auto', autoStopSeconds: 5 })
    expect(data.settings).not.toHaveProperty('drawMode')
  })
  it.each([
    { drawMode: 'invalid' }, { drawMode: null },
    { autoStopSeconds: 0 }, { autoStopSeconds: 61 }, { autoStopSeconds: 1.5 },
    { autoStopSeconds: '5' }, { autoStopSeconds: null },
  ])('拒绝无效抽奖停止配置 %j，并保留当前活动', async patch => {
    const original = { ...emptyActivity(), participants: demoParticipants(2) }
    await repo.replace(original)
    const data = { ...original, settings: { ...original.settings, ...patch } }
    await expect(readBackup(archive({ format: 'star-pick', version: 1, data, assets: [] }))).rejects.toThrow('停止')
    expect(await repo.load()).toEqual(original)
  })
  it('版本、重复编号和超过奖项名额的备份被拒绝', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(2) }
    await expect(readBackup(archive({ format: 'star-pick', version: 2, data, assets: [] }))).rejects.toThrow('版本')
    data.participants[1].code = data.participants[0].code
    await expect(readBackup(archive({ format: 'star-pick', version: 1, data, assets: [] }))).rejects.toThrow('编号重复')
    data.participants[1].code = 'another'
    const r = createRecord(data, 'prize-3', 2); r.prizeId = 'prize-1'; data.records = [r]
    await expect(readBackup(archive({ format: 'star-pick', version: 1, data, assets: [] }))).rejects.toThrow('总名额')
  })
  it('缺失或伪造图片被拒绝', async () => {
    const data = { ...emptyActivity(), participants: demoParticipants(1) }
    data.participants[0].avatarId = 'picture'
    const manifest = { format: 'star-pick', version: 1, data, assets: [{ id: 'picture', mime: 'image/png' }] }
    await expect(readBackup(archive(manifest))).rejects.toThrow('图片缺失')
    await expect(readBackup(archive(manifest, { 'assets/picture.bin': strToU8('not png') }))).rejects.toThrow('图片内容')
  })
  it('不允许 ZIP 内包含无效路径', async () => {
    const manifest = { format: 'star-pick', version: 1, data: emptyActivity(), assets: [] }
    await expect(readBackup(archive(manifest, { '../outside.txt': strToU8('bad') }))).rejects.toThrow('文件路径')
  })
})
