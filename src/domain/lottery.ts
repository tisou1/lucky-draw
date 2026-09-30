import type { ActivitySnapshot, DrawRecord, Participant, Prize } from './types'

export function awardedCount(records: DrawRecord[], prizeId: string): number {
  return records.filter(r => r.prizeId === prizeId).reduce((sum, r) => sum + r.winners.length, 0)
}

export function candidatePool(data: ActivitySnapshot, prizeId: string): Participant[] {
  const excluded = new Set(data.records
    .filter(r => !data.settings.allowRepeat || r.prizeId === prizeId)
    .flatMap(r => r.winners.map(w => w.participantId)))
  return data.participants.filter(p => !excluded.has(p.id))
}

// Rejection sampling avoids the modulo bias of random % upperBound.
export function secureIndex(upperBound: number, random = (bytes: Uint32Array<ArrayBuffer>) => crypto.getRandomValues(bytes)): number {
  if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > 0x100000000) throw new Error('无效的随机范围')
  const limit = Math.floor(0x100000000 / upperBound) * upperBound
  const value = new Uint32Array(1)
  do { random(value) } while (value[0] >= limit)
  return value[0] % upperBound
}

export function sample<T>(pool: T[], count: number, randomIndex = secureIndex): T[] {
  if (!Number.isInteger(count) || count < 1 || count > pool.length) throw new Error('候选人数不足或抽取人数无效')
  const copy = [...pool]
  for (let i = 0; i < count; i++) {
    const j = i + randomIndex(copy.length - i)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export function validateRound(data: ActivitySnapshot, prizeId: string, count: number): { prize: Prize; pool: Participant[] } {
  const prize = data.prizes.find(p => p.id === prizeId)
  if (!prize) throw new Error('请先选择奖项')
  if (!Number.isInteger(count) || count < 1) throw new Error('本轮人数必须是大于 0 的整数')
  if (count > prize.total - awardedCount(data.records, prizeId)) throw new Error('本轮人数超过奖项剩余名额')
  const pool = candidatePool(data, prizeId)
  if (count > pool.length) throw new Error(`候选人数不足，目前只有 ${pool.length} 人可参与`)
  return { prize, pool }
}

export function createRecord(data: ActivitySnapshot, prizeId: string, count: number): DrawRecord {
  const { prize, pool } = validateRound(data, prizeId, count)
  return {
    id: crypto.randomUUID(), prizeId, prizeName: prize.name, gift: prize.gift,
    createdAt: new Date().toISOString(),
    winners: sample(pool, count).map(p => ({ participantId: p.id, code: p.code, name: p.name, department: p.department, avatarId: p.avatarId })),
  }
}
