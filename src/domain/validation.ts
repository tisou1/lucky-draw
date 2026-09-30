import type { ActivitySnapshot } from './types'

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式错误`)
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max = 300, optional = false): string {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw new Error(`${label}无效或过长`)
  return value
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}无效`)
  return value
}
function unique(value: string, set: Set<string>, label: string) {
  if (set.has(value)) throw new Error(`${label}重复`)
  set.add(value)
}
function optionalAsset(value: unknown) {
  if (value !== undefined && (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))) throw new Error('图片标识无效')
}

export function assetReferences(data: ActivitySnapshot): Set<string> {
  return new Set([
    ...data.participants.map(p => p.avatarId), ...data.prizes.map(p => p.imageId),
    ...data.records.flatMap(r => r.winners.map(w => w.avatarId)),
  ].filter((id): id is string => Boolean(id)))
}

export function validateSnapshot(input: unknown): ActivitySnapshot {
  const data = object(input, '活动数据')
  if (data.version !== 1) throw new Error('不支持的活动数据版本')
  if (!Array.isArray(data.participants) || !Array.isArray(data.prizes) || !Array.isArray(data.records)) throw new Error('名单、奖项或记录格式错误')
  if (data.participants.length > 1000) throw new Error('参与者超过 1000 人上限')
  const settings = object(data.settings, '活动设置')
  text(settings.name, '活动名称', 120)
  if (typeof settings.allowRepeat !== 'boolean' || typeof settings.force2D !== 'boolean' || !['sphere', 'helix'].includes(String(settings.layout)) || !['standard', 'low'].includes(String(settings.quality))) throw new Error('活动设置无效')

  const people = new Set<string>()
  const codes = new Set<string>()
  for (const input of data.participants) {
    const p = object(input, '参与者')
    unique(text(p.id, '参与者 ID', 80), people, '参与者 ID')
    unique(text(p.code, '参与者编号', 80), codes, '参与者编号')
    text(p.name, '姓名', 80); text(p.department, '部门', 100, true); text(p.note, '备注', 300, true)
    optionalAsset(p.avatarId)
  }

  const prizes = new Map<string, number>()
  for (const input of data.prizes) {
    const p = object(input, '奖项')
    const id = text(p.id, '奖项 ID', 80)
    if (prizes.has(id)) throw new Error('奖项 ID 重复')
    text(p.name, '奖项名称', 80); text(p.gift, '奖品名称', 100)
    const total = integer(p.total, '奖项总名额', 1, 1000)
    integer(p.batchSize, '每轮人数', 1, total); integer(p.order, '奖项顺序', 0, 1000)
    optionalAsset(p.imageId)
    prizes.set(id, total)
  }

  const recordIds = new Set<string>()
  const prizeWinners = new Map<string, Set<string>>()
  for (const input of data.records) {
    const r = object(input, '中奖记录')
    unique(text(r.id, '记录 ID', 80), recordIds, '记录 ID')
    const prizeId = text(r.prizeId, '记录奖项 ID', 80)
    if (!prizes.has(prizeId)) throw new Error('记录对应的奖项不存在')
    text(r.prizeName, '记录奖项名称', 80); text(r.gift, '记录奖品名称', 100)
    const time = text(r.createdAt, '记录时间', 40)
    if (!Number.isFinite(Date.parse(time))) throw new Error('记录时间无效')
    if (!Array.isArray(r.winners) || !r.winners.length) throw new Error('中奖者列表无效')
    const seen = prizeWinners.get(prizeId) ?? new Set<string>()
    for (const input of r.winners) {
      const w = object(input, '中奖者')
      unique(text(w.participantId, '中奖者 ID', 80), seen, '同奖项中奖者')
      text(w.code, '中奖编号', 80); text(w.name, '中奖姓名', 80); text(w.department, '中奖部门', 100, true)
      optionalAsset(w.avatarId)
    }
    if (seen.size > prizes.get(prizeId)!) throw new Error('中奖人数超过奖项总名额')
    prizeWinners.set(prizeId, seen)
  }
  return input as ActivitySnapshot
}
