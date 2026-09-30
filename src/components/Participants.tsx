import { useMemo, useState } from 'react'
import { Plus, Upload, Users, Search, Pencil, Trash2, ImagePlus, Sparkles, Download, LoaderCircle } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { AssetImage } from './AssetImage'
import { Confirm, Field, Modal, PageHead, Pagination } from './common'
import { ImportDialog } from './ImportDialog'
import type { Participant } from '@/domain/types'
import { demoParticipants } from '@/domain/defaults'
import { matchAvatarFiles } from '@/importing/participants'
import { compressImage } from '@/lib/images'
import { isLocked, mutateActivity, notify, useActivity } from '@/store/activity'

function ParticipantEditor({ initial, onClose }: { initial: Participant | null; onClose: () => void }) {
  const [form, setForm] = useState<Participant>(initial ?? { id: crypto.randomUUID(), code: '', name: '', department: '', note: '' })
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      if (!form.name.trim()) throw new Error('请填写姓名')
      const asset = image ? await compressImage(image, 256) : undefined
      const next = { ...form, name: form.name.trim(), code: form.code.trim() || `P-${form.id.slice(0, 8).toUpperCase()}`, department: form.department.trim(), note: form.note.trim(), avatarId: asset?.id ?? form.avatarId }
      await mutateActivity(data => {
        if (data.participants.some(p => p.id !== next.id && p.code === next.code)) throw new Error('参与者编号已存在')
        if (!initial && data.participants.length >= 1000) throw new Error('最多支持 1000 名参与者')
        return { ...data, participants: initial ? data.participants.map(p => p.id === next.id ? next : p) : [...data.participants, next] }
      }, asset ? [asset] : [])
      notify(initial ? '参与者已更新' : '参与者已添加'); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setBusy(false) }
  }
  return <Modal open onClose={onClose} title={initial ? '编辑参与者' : '添加参与者'} description="姓名必填，编号留空时自动生成。" busy={busy}>
    <form onSubmit={e => void save(e)} className="form-stack">
      <div className="form-grid"><Field label="姓名 *"><Input required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><Field label="参与者编号"><Input maxLength={80} placeholder="留空自动生成" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></Field></div>
      <Field label="部门"><Input value={form.department} maxLength={100} onChange={e => setForm({ ...form, department: e.target.value })} /></Field>
      <Field label="备注"><Input value={form.note} maxLength={300} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
      <div className="image-upload"><AssetImage id={form.avatarId} name={form.name || '头像'} /><Field label="上传头像"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setImage(e.target.files?.[0] ?? null)} /><small>{image?.name ?? 'PNG / JPEG / WebP，最大 15 MB'}</small></Field><Button type="button" variant="ghost" disabled={!form.avatarId && !image} onClick={() => { setImage(null); setForm({ ...form, avatarId: undefined }) }}>默认头像</Button></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" />}保存参与者</Button></div>
    </form>
  </Modal>
}

export default function Participants() {
  const { data, writable, draw, mutating } = useActivity()
  const locked = !writable || mutating || ['rolling', 'saving', 'revealing'].includes(draw.phase)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [editor, setEditor] = useState<{ participant: Participant | null } | null>(null)
  const [deleting, setDeleting] = useState<Participant | null>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchReport, setBatchReport] = useState<string[] | null>(null)
  const filtered = useMemo(() => data.participants.filter(p => `${p.code} ${p.name} ${p.department} ${p.note}`.toLowerCase().includes(query.toLowerCase())), [data.participants, query])
  const pages = Math.ceil(filtered.length / 15)
  const visiblePage = Math.min(page, Math.max(0, pages - 1))
  const winners = new Set(data.records.flatMap(r => r.winners.map(w => w.participantId)))

  const batchUpload = async (files: File[]) => {
    if (batchBusy || isLocked()) return
    setBatchBusy(true)
    const errors: string[] = []
    try {
      const { matched, unmatched } = matchAvatarFiles(files, data.participants)
      errors.push(...unmatched.map(f => `${f}：无法匹配、重复文件或格式不支持`))
      const updates = new Map<string, string>()
      const assets = []
      for (const { participant, file } of matched) {
        try { const asset = await compressImage(file, 256); assets.push(asset); updates.set(participant.id, asset.id) }
        catch (e) { errors.push(`${file.name}：${e instanceof Error ? e.message : '处理失败'}`) }
      }
      if (assets.length) await mutateActivity(d => ({ ...d, participants: d.participants.map(p => updates.has(p.id) ? { ...p, avatarId: updates.get(p.id) } : p) }), assets)
      notify(`已更新 ${assets.length} 人的头像`)
      if (errors.length) setBatchReport(errors)
    } catch (e) { notify(e instanceof Error ? e.message : '头像保存失败') }
    finally { setBatchBusy(false) }
  }

  return <section className="management-page">
    <PageHead eyebrow="PARTICIPANTS" title="让每一位，都在现场" description={`已添加 ${data.participants.length} 位参与者，${winners.size} 位已中奖。`}>
      <Button variant="outline" asChild><a href={`${import.meta.env.BASE_URL}templates/participants.csv`} download><Download />导入模板</a></Button>
      <Button variant="outline" disabled={locked || batchBusy} onClick={() => setImportOpen(true)}><Upload />导入名单</Button>
      <Button disabled={locked || batchBusy} onClick={() => setEditor({ participant: null })}><Plus />添加参与者</Button>
    </PageHead>
    <div className="panel">
      <div className="table-toolbar"><div className="search-input"><Search size={17} /><Input placeholder="搜索姓名、编号、部门" aria-label="搜索参与者" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></div><div className="toolbar-actions"><label className={`file-button ${locked || batchBusy ? 'disabled' : ''}`}>{batchBusy ? <LoaderCircle size={15} className="spin" /> : <ImagePlus size={15} />}{batchBusy ? '正在处理头像…' : '批量上传头像'}<Input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={locked || batchBusy} onChange={e => { void batchUpload(Array.from(e.target.files ?? [])); e.target.value = '' }} /></label><Button variant="ghost" disabled={locked || batchBusy} onClick={() => setDemoOpen(true)}><Sparkles />加载演示</Button></div></div>
      <p className="toolbar-hint">批量头像文件名使用参与者编号，例如 0001.png。</p>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>参与者</th><th>编号</th><th>部门</th><th>备注</th><th>状态</th><th className="text-right">操作</th></tr></thead><tbody>{filtered.slice(visiblePage * 15, visiblePage * 15 + 15).map(p => <tr key={p.id}><td><div className="person-cell"><AssetImage id={p.avatarId} name={p.name} /><strong>{p.name}</strong></div></td><td className="mono">{p.code}</td><td>{p.department || '—'}</td><td className="note-cell">{p.note || '—'}</td><td><span className={`status-pill ${winners.has(p.id) ? 'gold' : ''}`}>{winners.has(p.id) ? '已中奖' : '待抽取'}</span></td><td><div className="row-actions"><Button size="icon" variant="ghost" aria-label={`编辑${p.name}`} disabled={locked || batchBusy} onClick={() => setEditor({ participant: p })}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={`删除${p.name}`} disabled={locked || batchBusy} onClick={() => setDeleting(p)}><Trash2 /></Button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><Users size={40} /><h2>{query ? '没有找到参与者' : '第一份期待，从这里开始'}</h2><p>{query ? '试试其他姓名或编号' : '导入名单、手动添加，或加载演示名单体验抽奖。'}</p>{!query && <Button variant="outline" disabled={locked} onClick={() => setImportOpen(true)}><Upload />导入名单</Button>}</div>}
      {!!filtered.length && <Pagination page={visiblePage} pages={pages} onChange={setPage} />}
    </div>
    {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} />}
    {editor && <ParticipantEditor initial={editor.participant} onClose={() => setEditor(null)} />}
    <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="删除参与者" description={`将删除 ${deleting?.name ?? ''}，历史中奖记录仍会保留。`} action={() => mutateActivity(d => ({ ...d, participants: d.participants.filter(p => p.id !== deleting?.id) }))} />
    <Confirm open={demoOpen} onClose={() => setDemoOpen(false)} title="加载演示名单" description="追加 100 位演示参与者，现有名单保留。可在设置中重置活动后移除演示数据。" destructive={false} action={async () => { await mutateActivity(d => { if (d.participants.length + 100 > 1000) throw new Error('超过 1000 人上限'); const codes = new Set(d.participants.map(p => p.code)); const demo = demoParticipants().filter(p => !codes.has(p.code)); return { ...d, participants: [...d.participants, ...demo] } }); notify('演示名单已加载') }} />
    <Modal open={Boolean(batchReport)} onClose={() => setBatchReport(null)} title="头像上传报告" description="以下文件未更新，请检查文件名与参与者编号。"><div className="import-issues">{batchReport?.map((message, i) => <p key={i}>{message}</p>)}</div><Button onClick={() => setBatchReport(null)}>知道了</Button></Modal>
    <p className="local-footnote">名单和头像仅保存在当前浏览器。建议在活动开始前导出备份。</p>
  </section>
}
