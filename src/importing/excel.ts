import ExcelJS from 'exceljs'
import type { ImportSheet } from './participants'

export function excelCellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && /^0+$/.test(cell.numFmt)) return String(value).padStart(cell.numFmt.length, '0')
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return String(value.result ?? '')
    if ('richText' in value) return value.richText.map(t => t.text).join('')
    if ('text' in value) return value.text
    if ('error' in value) return ''
  }
  return cell.text
}

export async function readExcelSheets(buffer: ArrayBuffer): Promise<ImportSheet[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets.filter(s => s.state === 'visible' && s.actualRowCount > 0).map(sheet => {
    if (sheet.rowCount > 10000 || sheet.columnCount > 200) throw new Error('表格范围过大，请仅保留名单区域后重新导入')
    const rows: string[][] = []
    const rowNumbers: number[] = []
    for (let i = 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i)
      const values = Array.from({ length: sheet.columnCount }, (_, col) => excelCellText(row.getCell(col + 1)))
      if (values.some(v => v.trim())) { rows.push(values); rowNumbers.push(i) }
    }
    return { name: sheet.name, rows, rowNumbers }
  })
}
