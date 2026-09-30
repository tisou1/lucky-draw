import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { guessMapping, matchAvatarFiles, parseCSV, prepareImport, readParticipantFile } from './participants'
import { readExcelSheets } from './excel'

describe('参与者名单导入', () => {
  it('CSV 保留前导零并支持 BOM、引号与逗号', () => {
    const sheet = parseCSV('\uFEFF编号,姓名,部门,备注\n0001,林知夏,设计部,"欢迎,你"')[0]
    const result = prepareImport(sheet.rows, guessMapping(sheet.rows[0]), [])
    expect(result.participants[0]).toMatchObject({ code: '0001', name: '林知夏', note: '欢迎,你' })
  })
  it('GB18030 编码选择可以正确读取中文', async () => {
    const header = new TextEncoder().encode('code,name\n0001,')
    const content = new Uint8Array([...header, 0xd5, 0xc5, 0xc8, 0xfd]) // 张三
    const sheet = (await readParticipantFile(new File([content], '名单.csv'), 'gb18030'))[0]
    expect(sheet.rows[1]).toEqual(['0001', '张三'])
  })
  it('跳过重复编号、空姓名，允许同名不同编号', () => {
    const sheet = parseCSV('编号,姓名\n001,张三\n001,李四\n002,张三\n003,')[0]
    const result = prepareImport(sheet.rows, guessMapping(sheet.rows[0]), [])
    expect(result.participants.map(p => p.code)).toEqual(['001', '002'])
    expect(result.issues.map(i => i.row)).toEqual([3, 5])
    const again = prepareImport(sheet.rows, guessMapping(sheet.rows[0]), result.participants)
    expect(again.participants).toHaveLength(0)
  })
  it('缺少姓名映射时禁止导入', () => {
    expect(() => prepareImport([['A'], ['B']], { code: 0, name: -1, department: -1, note: -1 }, [])).toThrow('姓名列')
  })
  it('没有编号时生成唯一编号，空行被忽略', () => {
    const sheet = parseCSV('姓名\n\n张三\n李四\n')[0]
    const result = prepareImport(sheet.rows, guessMapping(sheet.rows[0]), [])
    expect(result.participants).toHaveLength(2)
    expect(new Set(result.participants.map(p => p.code)).size).toBe(2)
  })
  it('XLSX 保留多个工作表以及数字格式的前导零', async () => {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('研发部')
    sheet.addRow(['编号', '姓名']); sheet.addRow([1, '陈予安'])
    sheet.getCell('A2').numFmt = '0000'
    book.addWorksheet('设计部').addRows([['编号', '姓名'], ['0002', '林知夏']])
    const buffer = await book.xlsx.writeBuffer()
    const sheets = await readExcelSheets(new Uint8Array(buffer).buffer)
    expect(sheets.map(s => s.name)).toEqual(['研发部', '设计部'])
    expect(sheets[0].rows[1]).toEqual(['0001', '陈予安'])
    expect(sheets[1].rows[1][0]).toBe('0002')
  })
  it('旧版 XLS 给出格式转换提示', async () => {
    await expect(readParticipantFile(new File([''], '名单.xls'))).rejects.toThrow('转换为 .xlsx')
  })
  it('头像按编号匹配，重复或不支持的文件报告失败', () => {
    const p = { id: 'p1', code: '0001', name: '张三', department: '', note: '' }
    const files = ['0001.png', '0001.jpg', '张三.webp', '0001.gif'].map(name => new File([''], name))
    const result = matchAvatarFiles(files, [p])
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].participant.id).toBe('p1')
    expect(result.unmatched).toEqual(['0001.jpg', '张三.webp', '0001.gif'])
  })
})
