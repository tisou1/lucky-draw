import { describe, expect, it } from 'vitest'
import { emptyActivity, demoParticipants } from './defaults'
import { awardedCount, candidatePool, createRecord, sample, secureIndex, validateRound } from './lottery'

function fixture() { return { ...emptyActivity(), participants: demoParticipants(12) } }

describe('公平取样与候选规则', () => {
  it('拒绝存在 modulo bias 的尾部随机值', () => {
    const values = [0xffffffff, 17]
    expect(secureIndex(10, bytes => { bytes[0] = values.shift()!; return bytes })).toBe(7)
    expect(values).toHaveLength(0)
  })
  it('一轮内不放回且不修改原候选池', () => {
    const pool = [1, 2, 3, 4]
    const result = sample(pool, 4, () => 0)
    expect(new Set(result).size).toBe(4)
    expect(pool).toEqual([1, 2, 3, 4])
  })
  it('默认所有奖项排除已中奖参与者', () => {
    const data = fixture()
    data.records.push(createRecord(data, 'prize-1', 1))
    expect(candidatePool(data, 'prize-2')).toHaveLength(11)
    expect(candidatePool(data, 'prize-2').some(p => p.id === data.records[0].winners[0].participantId)).toBe(false)
  })
  it('允许跨奖项重复时仍排除同奖项中奖者', () => {
    const data = fixture(); data.settings.allowRepeat = true
    data.records.push(createRecord(data, 'prize-3', 2))
    expect(candidatePool(data, 'prize-3')).toHaveLength(10)
    expect(candidatePool(data, 'prize-2')).toHaveLength(12)
    expect(awardedCount(data.records, 'prize-3')).toBe(2)
  })
  it('候选或奖项名额不足时禁止开始', () => {
    const data = fixture()
    expect(() => validateRound(data, 'prize-1', 2)).toThrow('剩余名额')
    data.participants = []
    expect(() => validateRound(data, 'prize-3', 1)).toThrow('候选人数不足')
    expect(() => validateRound(data, 'prize-3', 1.5)).toThrow('整数')
  })
  it('完整 1000 人名单都进入候选池', () => {
    const data = { ...emptyActivity(), participants: demoParticipants(1000) }
    expect(candidatePool(data, 'prize-3')).toHaveLength(1000)
    expect(sample(candidatePool(data, 'prize-3'), 1, upper => upper - 1)[0]).toEqual(data.participants[999])
  })
  it('中奖快照不会随原名单编辑改变', () => {
    const data = fixture(); const record = createRecord(data, 'prize-3', 1)
    const winner = data.participants.find(p => p.id === record.winners[0].participantId)!
    const original = record.winners[0].name
    winner.name = '新名字'
    expect(record.winners[0].name).toBe(original)
  })
})
