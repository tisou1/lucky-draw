import Papa from 'papaparse'
import type { DrawRecord } from '@/domain/types'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportRecords(records: DrawRecord[]) {
  const safe = (text: string) => /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  const rows = records.flatMap(r => r.winners.map(w => ({
    抽奖时间: new Date(r.createdAt).toLocaleString('zh-CN'), 奖项: safe(r.prizeName), 奖品: safe(r.gift),
    编号: safe(w.code), 姓名: safe(w.name), 部门: safe(w.department),
  })))
  downloadBlob(new Blob(['\uFEFF', Papa.unparse(rows)], { type: 'text/csv;charset=utf-8' }), '中奖记录.csv')
}
