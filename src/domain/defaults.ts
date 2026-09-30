import type { ActivitySnapshot, Participant } from './types'

export const DEFAULT_AUTO_STOP_SECONDS = 5

export function emptyActivity(): ActivitySnapshot {
  return {
    version: 1,
    participants: [],
    prizes: [
      { id: 'prize-1', name: '一等奖', gift: '年度惊喜大奖', total: 1, batchSize: 1, order: 0 },
      { id: 'prize-2', name: '二等奖', gift: '心动好礼', total: 3, batchSize: 1, order: 1 },
      { id: 'prize-3', name: '三等奖', gift: '幸运礼物', total: 10, batchSize: 2, order: 2 },
    ],
    records: [],
    settings: { name: '每一份期待，都值得被点亮', allowRepeat: false, drawMode: 'auto', autoStopSeconds: DEFAULT_AUTO_STOP_SECONDS, layout: 'sphere', quality: 'standard', force2D: false },
  }
}

export function demoParticipants(count = 100): Participant[] {
  const surnames = ['林', '陈', '李', '张', '王', '周', '许', '苏', '吴', '赵']
  const names = ['星辰', '知夏', '予安', '一诺', '嘉宁', '景行', '清和', '沐阳', '若溪', '子墨']
  const departments = ['设计部', '研发部', '产品部', '运营部', '市场部']
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(), code: `DEMO${String(i + 1).padStart(4, '0')}`,
    name: surnames[i % 10] + names[Math.floor(i / 10) % 10],
    department: departments[i % 5], note: '演示参与者',
  }))
}
