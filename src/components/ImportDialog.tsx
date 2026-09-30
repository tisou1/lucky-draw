import { useMemo, useState } from 'react'
import { FileSpreadsheet, Upload, LoaderCircle } from 'lucide-react'
import { Modal, Field } from './common'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { guessMapping, prepareImport, readParticipantFile, type ColumnMapping, type ImportSheet } from '@/importing/participants'
import { mutateActivity, notify, useActivity } from '@/store/activity'

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const participants = useActivity(state => state.data.participants)
  const [file, setFile] = useState<File | null>(null)
  const [encoding, setEncoding] = useState('utf-8')
  const [sheets, setSheets] = useState<ImportSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({ code: -1, name: -1, department: -1, note: -1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sheet = sheets[sheetIndex]
  const preview = useMemo(() => sheet && mapping.name >= 0 ? prepareImport(sheet.rows, mapping, participants) : null, [sheet, mapping, participants])

  const read = async (nextFile: File, nextEncoding = encoding) => {
    setBusy(true); setError(''); setFile(nextFile); setSheets([])
    try {
      const parsed = await readParticipantFile(nextFile, nextEncoding)
      if (!parsed.length || !parsed[0].rows.length) throw new Error('文件中没有可导入的名单')
      setSheets(parsed); setSheetIndex(0); setMapping(guessMapping(parsed[0].rows[0]))
    } catch (e) { setError(e instanceof Error ? e.message : '文件读取失败') }
    finally { setBusy(false) }
  }

  const submit = async () => {
    if (!sheet || busy) return
    setBusy(true)
    try {
      let imported = 0
      let skipped = 0
      await mutateActivity(data => {
        const result = prepareImport(sheet.rows, mapping, data.participants)
        imported = result.participants.length; skipped = result.issues.length
        if (!imported) throw new Error('没有有效名单可以导入，请检查列映射和编号')
        return { ...data, participants: [...data.participants, ...result.participants] }
      })
      notify(`已导入 ${imported} 人${skipped ? `，跳过 ${skipped} 行` : ''}`); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败') }
    finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} title="导入参与者名单" description="支持 CSV 和 XLSX。第一行为表头；导入只追加名单，重复编号会跳过。" wide busy={busy}>
    <div className="import-file"><FileSpreadsheet size={28} /><div><strong>{file?.name ?? '选择名单文件'}</strong><p>姓名必填 · 编号作为文本保留</p></div><label className="file-button"><Upload size={15} />选择文件<Input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = '' }} /></label></div>
    <div className="form-grid">
      <Field label="CSV 编码"><select value={encoding} disabled={busy} onChange={e => { setEncoding(e.target.value); if (file?.name.toLowerCase().endsWith('.csv')) void read(file, e.target.value) }}><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option></select></Field>
      <Field label="工作表"><select value={sheetIndex} disabled={busy || !sheets.length} onChange={e => { const i = Number(e.target.value); setSheetIndex(i); setMapping(guessMapping(sheets[i].rows[0] ?? [])) }}>{sheets.length ? sheets.map((s, i) => <option value={i} key={s.name}>{s.name}</option>) : <option>请先选择文件</option>}</select></Field>
    </div>
    {sheet && <>
      <div className="form-grid mapping-grid">{(['name', 'code', 'department', 'note'] as const).map(key => <Field key={key} label={{ name: '姓名 *', code: '参与者编号', department: '部门', note: '备注' }[key]}><select value={mapping[key]} disabled={busy} onChange={e => setMapping({ ...mapping, [key]: Number(e.target.value) })}><option value={-1}>{key === 'name' ? '请选择列' : '不导入此字段'}</option>{sheet.rows[0].map((h, i) => <option key={i} value={i}>{h || `第 ${i + 1} 列`}</option>)}</select></Field>)}</div>
      <div className="import-summary"><strong>{preview?.participants.length ?? 0}</strong> 人可导入 <span>·</span> {preview?.issues.length ?? 0} 行将跳过</div>
      {preview && <div className="table-scroll"><table><thead><tr><th>编号</th><th>姓名</th><th>部门</th></tr></thead><tbody>{preview.participants.slice(0, 5).map(p => <tr key={p.id}><td className="mono">{p.code}</td><td>{p.name}</td><td>{p.department || '—'}</td></tr>)}</tbody></table><small>预览前 5 名参与者</small></div>}
      {!!preview?.issues.length && <div className="import-issues">{preview.issues.slice(0, 30).map(i => <p key={i.row}>第 {i.row} 行：{i.message}</p>)}{preview.issues.length > 30 && <p>还有 {preview.issues.length - 30} 行将被跳过</p>}</div>}
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={() => void submit()} disabled={busy || !preview?.participants.length}>{busy ? <LoaderCircle className="spin" /> : <Upload />}追加导入</Button></div>
  </Modal>
}
