import { useState } from 'react'
import { Gift, Plus, Pencil, Trash2, LoaderCircle } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { AssetImage } from './AssetImage'
import { Confirm, Field, Modal, PageHead } from './common'
import type { Prize } from '@/domain/types'
import { awardedCount } from '@/domain/lottery'
import { compressImage } from '@/lib/images'
import { mutateActivity, notify, useActivity } from '@/store/activity'

function PrizeEditor({ initial, order, onClose }: { initial: Prize | null; order: number; onClose: () => void }) {
  const [form, setForm] = useState<Prize>(initial ?? { id: crypto.randomUUID(), name: '', gift: '', total: 1, batchSize: 1, order })
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('')
    try {
      if (!form.name.trim() || !form.gift.trim()) throw new Error('请填写奖项名称和奖品名称')
      if (![form.total, form.batchSize, form.order].every(Number.isInteger) || form.total < 1 || form.batchSize < 1 || form.batchSize > form.total || form.total > 1000 || form.order < 0) throw new Error('请检查名额、每轮人数和排序，名额范围为 1～1000')
      const asset = image ? await compressImage(image, 1024) : undefined
      const next = { ...form, name: form.name.trim(), gift: form.gift.trim(), imageId: asset?.id ?? form.imageId }
      await mutateActivity(d => {
        if (next.total < awardedCount(d.records, next.id)) throw new Error('总名额不能少于已中奖人数')
        return { ...d, prizes: (initial ? d.prizes.map(p => p.id === next.id ? next : p) : [...d.prizes, next]).sort((a, b) => a.order - b.order) }
      }, asset ? [asset] : [])
      notify('奖项已保存'); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setBusy(false) }
  }
  return <Modal open onClose={onClose} title={initial ? '编辑奖项' : '添加奖项'} description="配置奖项、奖品及人数，可分多轮抽完。" busy={busy}><form className="form-stack" onSubmit={e => void save(e)}>
    <Field label="奖项名称 *"><Input required value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如 特等奖" /></Field>
    <Field label="奖品名称 *"><Input required value={form.gift} maxLength={100} onChange={e => setForm({ ...form, gift: e.target.value })} placeholder="例如 惊喜旅行基金" /></Field>
    <div className="form-grid"><Field label="总名额"><Input type="number" min={1} max={1000} required value={form.total} onChange={e => setForm({ ...form, total: Number(e.target.value) })} /></Field><Field label="每轮默认抽取人数"><Input type="number" min={1} max={1000} required value={form.batchSize} onChange={e => setForm({ ...form, batchSize: Number(e.target.value) })} /></Field></div>
    <Field label="展示顺序" hint="数字越小，越靠前"><Input type="number" min={0} max={1000} required value={form.order} onChange={e => setForm({ ...form, order: Number(e.target.value) })} /></Field>
    <div className="image-upload"><AssetImage id={form.imageId} name={form.name || '奖品'} /><Field label="奖品图片"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setImage(e.target.files?.[0] ?? null)} /><small>{image?.name ?? '可选，最大 15 MB'}</small></Field><Button type="button" variant="ghost" onClick={() => { setImage(null); setForm({ ...form, imageId: undefined }) }}>移除图片</Button></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" />}保存奖项</Button></div>
  </form></Modal>
}

export default function Prizes() {
  const { data, writable, draw, mutating } = useActivity()
  const locked = !writable || mutating || ['rolling', 'saving', 'revealing'].includes(draw.phase)
  const [editor, setEditor] = useState<{ prize: Prize | null } | null>(null)
  const [deleting, setDeleting] = useState<Prize | null>(null)
  return <section className="management-page">
    <PageHead eyebrow="PRIZE COLLECTION" title="为幸运，准备一份惊喜" description="设置奖项与名额，每一次揭晓都有不同的期待。"><Button disabled={locked} onClick={() => setEditor({ prize: null })}><Plus />添加奖项</Button></PageHead>
    <div className="prize-grid">{data.prizes.map((p, i) => { const awarded = awardedCount(data.records, p.id); return <article className={`prize-card prize-tone-${i % 3}`} key={p.id}>
      <div className="prize-card-top"><span className="eyebrow">PRIZE {String(i + 1).padStart(2, '0')}</span><span className="status-pill">{p.total - awarded ? '待揭晓' : '已抽完'}</span></div>
      <div className="prize-art">{p.imageId ? <AssetImage id={p.imageId} name={p.gift} /> : <><div className="gift-halo" /><Gift size={64} strokeWidth={1} /></>}</div>
      <h2>{p.name}</h2><p>{p.gift}</p><div className="prize-count"><strong>{p.total - awarded}<small> / {p.total}</small></strong><span>剩余名额</span></div>
      <div className="progress-track"><span style={{ width: `${awarded / p.total * 100}%` }} /></div>
      <div className="prize-card-footer"><span>每轮 {p.batchSize} 人</span><div className="row-actions"><Button variant="ghost" size="icon" aria-label={`编辑${p.name}`} disabled={locked} onClick={() => setEditor({ prize: p })}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`删除${p.name}`} disabled={locked || awarded > 0} onClick={() => setDeleting(p)}><Trash2 /></Button></div></div>
    </article> })}</div>
    {!data.prizes.length && <div className="panel empty-state"><Gift size={40} /><h2>添加第一份奖项</h2><p>配置奖品和名额后，就可以开始抽奖。</p></div>}
    {editor && <PrizeEditor initial={editor.prize} order={data.prizes.length} onClose={() => setEditor(null)} />}
    <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="删除奖项" description={`将删除 ${deleting?.name ?? ''}。`} action={() => mutateActivity(d => { if (deleting && awardedCount(d.records, deleting.id)) throw new Error('已有中奖记录的奖项不能删除'); return { ...d, prizes: d.prizes.filter(p => p.id !== deleting?.id) } })} />
  </section>
}
