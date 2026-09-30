import Papa from 'papaparse'
import type { Participant } from '@/domain/types'

export interface ImportSheet { name: string; rows: string[][] }
export interface ColumnMapping { code: number; name: number; department: number; note: number }
export interface ImportIssue { row: number; message: string }

export function parseCSV(text: string): ImportSheet[] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', dynamicTyping: false })
  if (result.errors.length) throw new Error(`CSV 第 ${Number(result.errors[0].row ?? 0) + 1} 行：${result.errors[0].message}`)
  return [{ name: 'CSV 名单', rows: result.data }]
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

export function prepareImport(rows: string[][], mapping: ColumnMapping, existing: Participant[]) {
  if (mapping.name < 0) throw new Error('请映射姓名列')
  const codes = new Set(existing.map(p => p.code))
  const participants: Participant[] = []
  const issues: ImportIssue[] = []
  rows.slice(1).forEach((row, i) => {
    const value = (index: number) => index < 0 ? '' : (row[index] ?? '').trim()
    const name = value(mapping.name)
    if (!name) { issues.push({ row: i + 2, message: '姓名为空，已跳过' }); return }
    const code = value(mapping.code) || `P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    if (codes.has(code)) { issues.push({ row: i + 2, message: `编号 ${code} 重复，已跳过` }); return }
    if (existing.length + participants.length >= 1000) { issues.push({ row: i + 2, message: '超过 1000 人上限，已跳过' }); return }
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
