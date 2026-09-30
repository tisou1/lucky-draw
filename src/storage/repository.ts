import Dexie, { type Table } from 'dexie'
import { emptyActivity } from '@/domain/defaults'
import { candidatePool, awardedCount } from '@/domain/lottery'
import { assetReferences, validateSnapshot } from '@/domain/validation'
import type { ActivitySettings, ActivitySnapshot, Asset, DrawRecord, Participant, Prize, StorageRepository } from '@/domain/types'

class ActivityDatabase extends Dexie {
  participants!: Table<Participant, string>
  prizes!: Table<Prize, string>
  records!: Table<DrawRecord, string>
  assets!: Table<Asset, string>
  settings!: Table<{ id: string; value: ActivitySettings; participantOrder?: string[] }, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ participants: 'id,&code', prizes: 'id,order', records: 'id,prizeId,createdAt', assets: 'id', settings: 'id' })
  }
}

export class IndexedDBRepository implements StorageRepository {
  readonly db: ActivityDatabase
  constructor(name = 'star-pick-v1') { this.db = new ActivityDatabase(name) }

  async load(): Promise<ActivitySnapshot> {
    return this.db.transaction('r', this.db.participants, this.db.prizes, this.db.records, this.db.settings, async () => {
      const settings = await this.db.settings.get('activity')
      if (!settings) return emptyActivity()
      const [participants, prizes, records] = await Promise.all([
        this.db.participants.toArray(), this.db.prizes.orderBy('order').toArray(), this.db.records.orderBy('createdAt').toArray(),
      ])
      const order = new Map(settings.participantOrder?.map((id, i) => [id, i]))
      participants.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code))
      return validateSnapshot({ version: 1, participants, prizes, records, settings: settings.value })
    })
  }

  async replace(snapshot: ActivitySnapshot, assets: Asset[] = [], clearAssets = false): Promise<void> {
    validateSnapshot(snapshot)
    await this.db.transaction('rw', this.db.tables, async () => {
      await Promise.all([this.db.participants.clear(), this.db.prizes.clear(), this.db.records.clear()])
      if (clearAssets) await this.db.assets.clear()
      await this.db.participants.bulkAdd(snapshot.participants)
      await this.db.prizes.bulkAdd(snapshot.prizes)
      await this.db.records.bulkAdd(snapshot.records)
      await this.db.settings.put({ id: 'activity', value: snapshot.settings, participantOrder: snapshot.participants.map(p => p.id) })
      if (assets.length) await this.db.assets.bulkPut(assets)
      for (const id of assetReferences(snapshot)) {
        if (!(await this.db.assets.get(id))) throw new Error('图片资源缺失，活动未保存')
      }
      // Retain assets referenced by historical snapshots, collect everything else.
      const referenced = new Set([
        ...snapshot.participants.map(p => p.avatarId), ...snapshot.prizes.map(p => p.imageId),
        ...snapshot.records.flatMap(r => r.winners.map(w => w.avatarId)),
      ].filter((id): id is string => Boolean(id)))
      await this.db.assets.filter(a => !referenced.has(a.id)).delete()
    })
  }

  async commitDraw(record: DrawRecord): Promise<void> {
    await this.db.transaction('rw', this.db.participants, this.db.prizes, this.db.records, this.db.settings, async () => {
      const existing = await this.db.records.get(record.id)
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('抽奖记录编号冲突')
        return // Retrying an already committed result is safe.
      }
      const data = await this.load()
      const prize = data.prizes.find(p => p.id === record.prizeId)
      if (!prize || record.winners.length < 1 || record.winners.length > prize.total - awardedCount(data.records, prize.id)) throw new Error('奖项剩余名额发生变化')
      const eligible = new Set(candidatePool(data, prize.id).map(p => p.id))
      const unique = new Set(record.winners.map(w => w.participantId))
      if (unique.size !== record.winners.length || [...unique].some(id => !eligible.has(id))) throw new Error('候选名单发生变化，结果无法保存')
      await this.db.records.add(record)
    })
  }

  async getAsset(id: string) { return this.db.assets.get(id) }
  async getAssets() { return this.db.assets.toArray() }
  async loadBundle() {
    return this.db.transaction('r', this.db.tables, async () => ({ data: await this.load(), assets: await this.getAssets() }))
  }
}

export const repository = new IndexedDBRepository()
