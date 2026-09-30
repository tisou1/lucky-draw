import { createRecord, validateRound } from './lottery'
import type { ActivitySnapshot, DrawRecord, DrawState, StorageRepository } from './types'

export class DrawEngine {
  state: DrawState = { phase: 'idle', record: null, error: null }
  private round: { prizeId: string; count: number } | null = null
  private writing = false
  private stopTimer: ReturnType<typeof setTimeout> | null = null
  private readonly repository: StorageRepository
  private readonly getData: () => ActivitySnapshot
  private readonly change: (state: DrawState) => void
  private readonly committed: (record: DrawRecord) => void

  constructor(
    repository: StorageRepository,
    getData: () => ActivitySnapshot,
    change: (state: DrawState) => void,
    committed: (record: DrawRecord) => void,
  ) {
    this.repository = repository
    this.getData = getData
    this.change = change
    this.committed = committed
  }

  private update(patch: Partial<DrawState>) {
    this.state = { ...this.state, ...patch }
    this.change(this.state)
  }

  private clearStopTimer() {
    if (this.stopTimer !== null) clearTimeout(this.stopTimer)
    this.stopTimer = null
  }

  start(prizeId: string, count: number) {
    if (this.state.phase !== 'idle' && this.state.phase !== 'result') return
    const data = this.getData()
    validateRound(data, prizeId, count)
    this.clearStopTimer()
    this.round = { prizeId, count }
    this.update({ phase: 'rolling', record: null, error: null })
    if (data.settings.drawMode === 'auto') {
      this.stopTimer = setTimeout(() => {
        void this.stop().catch(error => this.update({ error: error instanceof Error ? error.message : '自动停止失败，请手动停止重试' }))
      }, data.settings.autoStopSeconds * 1000)
    }
  }

  async stop() {
    if (this.state.phase !== 'rolling' || !this.round) return
    this.clearStopTimer()
    // Reserve the exact result synchronously, before the first asynchronous write.
    const record = createRecord(this.getData(), this.round.prizeId, this.round.count)
    this.update({ phase: 'saving', record, error: null })
    await this.persist()
  }

  async retry() {
    if (this.state.phase === 'saving' && this.state.error) await this.persist()
  }

  private async persist() {
    if (this.writing || !this.state.record) return
    this.writing = true
    this.update({ error: null })
    try {
      await this.repository.commitDraw(this.state.record)
      this.committed(this.state.record)
      this.update({ phase: 'revealing', error: null })
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : '保存失败，请重试保存' })
    } finally { this.writing = false }
  }

  finishReveal() {
    if (this.state.phase === 'revealing') this.update({ phase: 'result' })
  }

  restore(record: DrawRecord | null) {
    this.clearStopTimer()
    this.round = null
    this.update({ phase: record ? 'result' : 'idle', record, error: null })
  }
}
