import Papa from 'papaparse'
import type { Participant } from '@/domain/types'

export interface ImportSheet { name: string; rows: string[][]; rowNumbers?: number[] }
export interface ColumnMapping { code: number; name: number; department: number; note: number }
export interface ImportIssue { row: number; message: string }

export function parseCSV(text: string): ImportSheet[] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false, dynamicTyping: false })
  const error = result.errors.find(e => e.code !== 'UndetectableDelimiter')
  if (error) throw new Error(`CSV 第 ${Number(error.row ?? 0) + 1} 行：${error.message}`)
  const first = Math.max(0, result.data.findIndex(row => row.some(v => v.trim())))
  return [{ name: 'CSV 名单', rows: result.data.slice(first), rowNumbers: result.data.slice(first).map((_, i) => first + i + 1) }]
}

export async function readParticipantFile(file: File, encoding = 'utf-8'): Promise<ImportSheet[]> {
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (extension === 'xls') throw new Error('请先将旧版 .xls 转换为 .xlsx，再导入')
  if (file.size > 20 * 1024 * 1024) throw new Error('名单文件不能超过 20 MB')
  const buffer = await file.arrayBuffer()
  if (extension === 'csv') return parseCSV(new TextDecoder(encoding).decode(buffer))
  if (extension !== 'xlsx') throw new Error('请选择 CSV 或 XLSX 文件')
  const { readExcelSheets } = await import('./excel')
  return readExcelSheets(buffer)
}

export function guessMapping(headers: string[]): ColumnMapping {
  const find = (names: string[]) => headers.findIndex(h => names.includes(h.trim().toLowerCase()))
  return {
    code: find(['编号', '参与者编号', '工号', 'code', 'id']),
    name: find(['姓名', '名字', 'name']),
    department: find(['部门', 'department']), note: find(['备注', 'note']),
  }
}

export function prepareImport(rows: string[][], mapping: ColumnMapping, existing: Participant[], rowNumbers?: number[]) {
  if (mapping.name < 0) throw new Error('请映射姓名列')
  const codes = new Set(existing.map(p => p.code))
  const participants: Participant[] = []
  const issues: ImportIssue[] = []
  rows.slice(1).forEach((row, i) => {
    if (row.every(v => !v.trim())) return
    const line = rowNumbers?.[i + 1] ?? i + 2
    const value = (index: number) => index < 0 ? '' : (row[index] ?? '').trim()
    const name = value(mapping.name)
    if (!name) { issues.push({ row: line, message: '姓名为空，已跳过' }); return }
    const code = value(mapping.code) || `P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    if (name.length > 80 || code.length > 80 || value(mapping.department).length > 100 || value(mapping.note).length > 300) {
      issues.push({ row: line, message: '字段过长，姓名和编号最多 80 字、部门 100 字、备注 300 字' }); return
    }
    if (codes.has(code)) { issues.push({ row: line, message: `编号 ${code} 重复，已跳过` }); return }
    if (existing.length + participants.length >= 1000) { issues.push({ row: line, message: '超过 1000 人上限，已跳过' }); return }
    codes.add(code)
    participants.push({ id: crypto.randomUUID(), code, name, department: value(mapping.department), note: value(mapping.note) })
  })
  return { participants, issues }
}

export function matchAvatarFiles(files: File[], participants: Participant[]) {
  const byCode = new Map(participants.map(p => [p.code, p]))
  const seen = new Set<string>()
  const matched: { participant: Participant; file: File }[] = []
  const unmatched: string[] = []
  for (const file of files) {
    const code = file.name.replace(/\.[^.]+$/, '')
    const participant = byCode.get(code)
    if (!participant || seen.has(code) || !/\.(png|jpe?g|webp)$/i.test(file.name)) { unmatched.push(file.name); continue }
    seen.add(code)
    matched.push({ participant, file })
  }
  return { matched, unmatched }
}
