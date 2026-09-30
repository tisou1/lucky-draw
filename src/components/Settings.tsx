import { useState } from 'react'
import { Archive, ArrowDownToLine, ArrowUpFromLine, Database, LoaderCircle, RotateCcw, Settings2, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { Confirm, Field, PageHead } from './common'
import { emptyActivity } from '@/domain/defaults'
import { drawEngine, mutateActivity, notify, safeAction, useActivity } from '@/store/activity'
import { repository } from '@/storage/repository'
import { downloadBlob } from '@/lib/download'
import type { BackupBundle } from '@/storage/backup'

export default function Settings() {
  const { data, writable, mutating, draw } = useActivity()
  const [name, setName] = useState(data.settings.name)
  const [exporting, setExporting] = useState(false)
  const [reading, setReading] = useState(false)
  const [pendingBackup, setPendingBackup] = useState<BackupBundle | null>(null)
  const [confirm, setConfirm] = useState<'records' | 'reset' | null>(null)
  const locked = !writable || mutating || ['rolling', 'saving', 'revealing'].includes(draw.phase)
  const update = (patch: Partial<typeof data.settings>) => void safeAction(() => mutateActivity(d => ({ ...d, settings: { ...d.settings, ...patch } })))
  const backup = async () => {
    if (exporting) return; setExporting(true)
    try {
      const { createBackup } = await import('@/storage/backup')
      const blob = await createBackup(repository)
      downloadBlob(blob, `星选备份-${new Date().toISOString().slice(0, 10)}.zip`)
      notify('完整备份已导出，包含名单、图片和中奖记录')
    } catch (e) { notify(e instanceof Error ? e.message : '备份失败') }
    finally { setExporting(false) }
  }
  const read = async (file: File) => {
    if (reading || locked) return; setReading(true)
    try {
      const { readBackup } = await import('@/storage/backup')
      const bundle = await readBackup(file)
      // Validate image decodability before the user can confirm replacement.
      for (const asset of bundle.assets) {
        try { const bitmap = await createImageBitmap(asset.blob); bitmap.close() }
        catch { throw new Error('备份包含无法解码的图片，当前活动未修改') }
      }
      setPendingBackup(bundle)
    } catch (e) { notify(e instanceof Error ? e.message : '备份读取失败') }
    finally { setReading(false) }
  }
  return <section className="management-page">
    <PageHead eyebrow="YOUR EVENT, YOUR RULES" title="为这一场，做好准备" description="活动规则、舞台表现和本地数据，都在这里管理。" />
    <div className="settings-grid"><div className="settings-stack">
      <section className="panel settings-panel"><div className="settings-title"><Settings2 size={19} /><h2>活动设置</h2></div>
        <form className="form-stack" onSubmit={e => { e.preventDefault(); if (name.trim()) void safeAction(async () => { await mutateActivity(d => ({ ...d, settings: { ...d.settings, name: name.trim() } })); notify('活动名称已保存') }) }}><Field label="活动名称"><Input value={name} onChange={e => setName(e.target.value)} maxLength={120} required disabled={locked} /></Field><div className="dialog-actions"><Button disabled={locked || !name.trim()}>保存名称</Button></div></form>
        <div className="setting-row"><div><strong>允许跨奖项重复中奖</strong><p>开启后可获得不同奖项，同一奖项仍只可中一次。</p></div><Switch checked={data.settings.allowRepeat} disabled={locked} onCheckedChange={value => update({ allowRepeat: value })} aria-label="允许跨奖项重复中奖" /></div>
      </section>
      <section className="panel settings-panel"><div className="settings-title"><SparkleIcon /><h2>舞台表现</h2></div><div className="form-grid"><Field label="默认布局"><select value={data.settings.layout} disabled={locked} onChange={e => update({ layout: e.target.value as 'sphere' | 'helix' })}><option value="sphere">3D 球体</option><option value="helix">3D 螺旋</option></select></Field><Field label="画质"><select value={data.settings.quality} disabled={locked} onChange={e => update({ quality: e.target.value as 'standard' | 'low' })}><option value="standard">标准 · 最多 300 张卡片</option><option value="low">低画质 · 最多 120 张卡片</option></select></Field></div><div className="setting-row"><div><strong>使用 2D 卡片舞台</strong><p>适合图形性能有限的设备，抽奖规则保持一致。</p></div><Switch checked={data.settings.force2D} disabled={locked} onCheckedChange={value => update({ force2D: value })} aria-label="使用 2D 卡片舞台" /></div><p className="settings-note">系统启用减少动态效果时，舞台会减少持续旋转和庆祝动画。</p></section>
      <section className="panel settings-panel"><div className="settings-title"><RotateCcw size={19} /><h2>开始下一场</h2></div><div className="setting-row"><div><strong>清空中奖记录</strong><p>保留名单、头像、奖项和设置，重新开始抽奖。</p></div><Button variant="outline" disabled={locked || !data.records.length} onClick={() => setConfirm('records')}>清空记录</Button></div><div className="setting-row"><div><strong>重置整个活动</strong><p>删除名单、图片和记录，恢复默认奖项与设置。</p></div><Button variant="destructive" disabled={locked} onClick={() => setConfirm('reset')}>重置活动</Button></div></section>
    </div><aside className="settings-stack">
      <section className="panel settings-panel backup-panel"><div className="settings-title"><Archive size={20} /><h2>把这场活动，妥善保存</h2></div><p>导出完整 ZIP 备份，换一台设备也能恢复名单、图片和中奖记录。</p><div className="backup-stats"><div><strong>{data.participants.length}</strong><span>参与者</span></div><div><strong>{data.prizes.length}</strong><span>奖项</span></div><div><strong>{data.records.length}</strong><span>抽奖轮次</span></div></div><Button className="backup-button" disabled={exporting} onClick={() => void backup()}>{exporting ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}导出完整备份</Button><label className={`file-button backup-button ${locked || reading ? 'disabled' : ''}`}>{reading ? <LoaderCircle className="spin" size={15} /> : <ArrowUpFromLine size={15} />}{reading ? '正在校验备份…' : '从 ZIP 恢复活动'}<Input type="file" accept=".zip" disabled={locked || reading} onChange={e => { const file = e.target.files?.[0]; if (file) void read(file); e.target.value = '' }} /></label><small>恢复前会校验数据，并再次确认覆盖。</small></section>
      <section className="panel settings-panel local-info"><Database size={26} /><h3>数据留在你的设备</h3><p>数据使用 IndexedDB 保存在当前浏览器和当前站点地址下。清除站点数据、换浏览器或更换访问端口后，需要使用备份恢复。</p><div><ShieldCheck size={14} />当前活动不上传到服务器</div></section>
    </aside></div>
    <Confirm open={confirm === 'records'} onClose={() => setConfirm(null)} title="清空中奖记录" description="所有中奖记录将被删除，奖项名额和候选池恢复。建议先导出备份。" action={async () => { await mutateActivity(d => ({ ...d, records: [] })); notify('中奖记录已清空') }} />
    <Confirm open={confirm === 'reset'} onClose={() => setConfirm(null)} title="重置整个活动" description="名单、头像、奖品图片和中奖记录都会删除，无法撤销。建议先导出备份。" action={async () => { const next = emptyActivity(); await mutateActivity(() => next, [], true); setName(next.settings.name); notify('活动已重置') }} />
    <Confirm open={Boolean(pendingBackup)} onClose={() => setPendingBackup(null)} title="恢复活动" description={`将使用备份覆盖当前活动：${pendingBackup?.data.settings.name ?? ''}，${pendingBackup?.data.participants.length ?? 0} 位参与者、${pendingBackup?.data.prizes.length ?? 0} 个奖项、${pendingBackup?.data.records.length ?? 0} 轮记录。建议先备份当前数据。`} action={async () => {
      if (!pendingBackup) return
      await mutateActivity(() => pendingBackup.data, pendingBackup.assets, true)
      const latest = pendingBackup.data.records.at(-1) ?? null
      drawEngine.restore(latest)
      useActivity.setState({ selectedPrizeId: latest?.prizeId ?? pendingBackup.data.prizes.at(-1)?.id ?? '' })
      setName(pendingBackup.data.settings.name)
      notify('活动与图片已恢复')
    }} />
  </section>
}

function SparkleIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z" /></svg> }
