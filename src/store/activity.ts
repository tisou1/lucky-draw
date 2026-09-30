import { create } from 'zustand'
import { emptyActivity } from '@/domain/defaults'
import { DrawEngine } from '@/domain/draw-engine'
import type { ActivitySnapshot, Asset, DrawState } from '@/domain/types'
import { repository } from '@/storage/repository'

interface ActivityStore {
  data: ActivitySnapshot
  ready: boolean
  writable: boolean
  mutating: boolean
  selectedPrizeId: string
  draw: DrawState
  notice: string | null
}

export const useActivity = create<ActivityStore>(() => ({
  data: emptyActivity(), ready: false, writable: false, mutating: false,
  selectedPrizeId: 'prize-3', draw: { phase: 'idle', record: null, error: null }, notice: null,
}))

export const drawEngine = new DrawEngine(repository, () => useActivity.getState().data,
  draw => useActivity.setState({ draw }),
  record => {
    useActivity.setState(state => ({ data: { ...state.data, records: [...state.data.records.filter(r => r.id !== record.id), record] } }))
    broadcastChange()
  })

let channel: BroadcastChannel | undefined
function broadcastChange() { channel?.postMessage('changed') }

export function isLocked() {
  const { writable, ready, mutating, draw } = useActivity.getState()
  return !ready || !writable || mutating || ['rolling', 'saving', 'revealing'].includes(draw.phase)
}

export function notify(message: string | null) { useActivity.setState({ notice: message }) }

export async function initializeActivity() {
  const data = await repository.load()
  const latest = data.records.at(-1) ?? null
  useActivity.setState({ data, ready: true, selectedPrizeId: latest?.prizeId ?? data.prizes.at(-1)?.id ?? '' })
  drawEngine.restore(latest)
}

export function subscribeChanges() {
  channel = new BroadcastChannel('star-pick-changes')
  channel.onmessage = () => {
    if (!useActivity.getState().writable) void initializeActivity().catch(e => notify(String(e)))
  }
  return () => { channel?.close(); channel = undefined }
}

export async function mutateActivity(
  edit: (data: ActivitySnapshot) => ActivitySnapshot,
  assets: Asset[] = [],
  clearAssets = false,
) {
  if (isLocked()) throw new Error('当前页面只读或抽奖正在进行，请稍后操作')
  useActivity.setState({ mutating: true })
  try {
    const next = edit(useActivity.getState().data)
    await repository.replace(next, assets, clearAssets)
    const selected = useActivity.getState().selectedPrizeId
    useActivity.setState({ data: next, selectedPrizeId: next.prizes.some(p => p.id === selected) ? selected : next.prizes[0]?.id ?? '' })
    // Edits do not reveal old results again. Clearing records also resets the engine.
    if (!next.records.some(r => r.id === drawEngine.state.record?.id)) drawEngine.restore(null)
    broadcastChange()
  } finally { useActivity.setState({ mutating: false }) }
}

export async function safeAction(action: () => void | Promise<void>) {
  try { await action() } catch (e) { notify(e instanceof Error ? e.message : '操作失败，请重试') }
}
