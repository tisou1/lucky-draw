import { useEffect, useState } from 'react'
import { ArrowRight, CircleStop, Gift, Maximize, Minimize, Play, Sparkles, Users, RotateCcw, Orbit } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { AssetImage } from './AssetImage'
import { Pagination } from './common'
import { awardedCount, candidatePool } from '@/domain/lottery'
import { drawEngine, mutateActivity, safeAction, useActivity } from '@/store/activity'
import '@/styles/stage.css'

export default function Stage({ onParticipants, scene }: { onParticipants: () => void; scene?: React.ReactNode }) {
  const { data, draw, writable, mutating, selectedPrizeId } = useActivity()
  const prize = data.prizes.find(p => p.id === selectedPrizeId)
  const remaining = prize ? prize.total - awardedCount(data.records, prize.id) : 0
  const candidates = prize ? candidatePool(data, prize.id).length : 0
  const [batch, setBatch] = useState<number | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [winnerPage, setWinnerPage] = useState(0)
  const count = batch ?? Math.min(prize?.batchSize ?? 1, Math.max(1, remaining))
  const busy = ['rolling', 'saving', 'revealing'].includes(draw.phase)
  const disabled = !writable || mutating
  const result = draw.phase === 'result' && draw.record?.prizeId === selectedPrizeId ? draw.record : null
  const visiblePage = Math.min(winnerPage, Math.max(0, Math.ceil((result?.winners.length ?? 0) / 6) - 1))

  const trigger = () => void safeAction(async () => {
    if (disabled) return
    if (drawEngine.state.phase === 'rolling') await drawEngine.stop()
    else if (drawEngine.state.phase === 'saving' && drawEngine.state.error) await drawEngine.retry()
    else if (!busy) { drawEngine.start(selectedPrizeId, count); setWinnerPage(0) }
  })

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.code !== 'Space' || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]') || document.querySelector('[role="dialog"]')) return
      event.preventDefault(); trigger()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const toggleFullscreen = () => void safeAction(async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.getElementById('lottery-stage')?.requestFullscreen()
  })

  return <section className={`stage-page ${draw.phase} ${result ? 'has-result' : ''}`} id="lottery-stage">
    <header className="stage-heading"><div><p className="eyebrow"><span className="live-dot" /> THE LUCKY UNIVERSE</p><h1>{data.settings.name}</h1><p>让幸运相遇，让期待有回响。</p></div><div className="stage-tools"><div className="layout-switch" aria-label="舞台布局"><button className={data.settings.layout === 'sphere' ? 'active' : ''} disabled={disabled || busy} onClick={() => void safeAction(() => mutateActivity(d => ({ ...d, settings: { ...d.settings, layout: 'sphere' } })))}><Orbit size={14} />球体</button><button className={data.settings.layout === 'helix' ? 'active' : ''} disabled={disabled || busy} onClick={() => void safeAction(() => mutateActivity(d => ({ ...d, settings: { ...d.settings, layout: 'helix' } })))}>螺旋</button></div><Button variant="outline" size="icon" aria-label={fullscreen ? '退出全屏' : '进入全屏'} onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</Button></div></header>
    <div className="stage-content">
      <aside className="stage-prizes"><div className="section-label"><Gift size={14} />今晚的惊喜<span>{data.prizes.length}</span></div><div className="stage-prize-list">{data.prizes.map((p, i) => { const left = p.total - awardedCount(data.records, p.id); return <button key={p.id} className={`stage-prize ${p.id === selectedPrizeId ? 'selected' : ''} tone-${i % 3}`} disabled={busy || mutating} onClick={() => { useActivity.setState({ selectedPrizeId: p.id }); setBatch(null); drawEngine.restore(null) }}><span className="prize-rank">{String(i + 1).padStart(2, '0')}</span><div><strong>{p.name}</strong><p>{p.gift}</p><small>剩余 {left} / {p.total} 名</small></div><span className="prize-indicator" /></button> })}</div><div className="stage-rule"><Sparkles size={16} /><p>{data.settings.allowRepeat ? '不同奖项可以重复中奖' : '每人一次幸运机会'}<small>同一奖项内不会重复中奖</small></p></div></aside>
      <div className="stage-viewport">
        <div className="stage-frame-corner top-left" /><div className="stage-frame-corner top-right" /><div className="stage-frame-corner bottom-left" /><div className="stage-frame-corner bottom-right" />
        <div className="stage-coordinates">STAR PICK / {data.settings.layout === 'sphere' ? 'ORBITAL SPHERE' : 'DOUBLE HELIX'}<span>LIVE EXPERIENCE</span></div>
        <div className="scene-host">{scene ?? <div className="placeholder-orbit"><Orbit size={180} strokeWidth={0.4} /></div>}</div>
        {!data.participants.length && <div className="stage-empty"><span className="eyebrow">READY FOR YOUR STARS</span><h2>幸运，在此汇聚</h2><p>准备一份名单，点亮今晚的主角</p><Button variant="outline" onClick={onParticipants}>准备参与者名单<ArrowRight /></Button></div>}
        {result && <div className="winner-overlay" key={result.id}><div className="winner-heading"><span className="eyebrow">THE LUCKY STARS</span><h2>恭喜，幸运属于你</h2><p>{result.prizeName} · {result.gift}</p></div><div className={`winner-grid ${result.winners.length === 1 ? 'single' : ''}`}>{result.winners.slice(visiblePage * 6, visiblePage * 6 + 6).map((w, i) => <article className="winner-card" key={w.participantId} style={{ animationDelay: `${i * 55}ms` }}><div className="winner-crown"><Sparkles size={22} /></div><AssetImage id={w.avatarId} name={w.name} /><h3>{w.name}</h3><p>{w.department || '幸运参与者'}</p><span>{w.code}</span></article>)}</div>{result.winners.length > 6 && <Pagination page={visiblePage} pages={Math.ceil(result.winners.length / 6)} onChange={setWinnerPage} />}<div className="celebration" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 70}ms`, background: ['#f4cf8c', '#86e6ef', '#af9bff'][i % 3], rotate: `${i * 23}deg` }} />)}</div></div>}
        {(draw.phase === 'saving' || draw.phase === 'revealing') && <div className="reveal-label"><Sparkles size={19} /><span>{draw.error ? '结果尚未保存，请重试保存' : draw.phase === 'saving' ? '正在记录这一份幸运…' : '幸运，即将揭晓'}</span></div>}
        <div className="scene-caption"><span className="live-dot" />{draw.phase === 'rolling' ? '星光正在流转 · 再按一次空格揭晓' : result ? '中奖结果已保存' : '每一颗星，都是一份期待'}<span className="render-mode">{data.settings.force2D ? '2D MODE' : '3D STAGE'}</span></div>
      </div>
      <aside className="draw-panel"><p className="eyebrow">CURRENT DRAW</p><div className="current-gift">{prize?.imageId ? <AssetImage id={prize.imageId} name={prize.gift} /> : <Gift size={45} strokeWidth={1} />}</div><h2>{prize?.name ?? '请先添加奖项'}</h2><p className="current-gift-name">{prize?.gift ?? '为今晚准备一份惊喜'}</p><div className="draw-panel-divider" /><div className="draw-remaining"><span>剩余名额</span><strong>{remaining}<small> / {prize?.total ?? 0}</small></strong></div><label className="batch-control"><span>本轮抽取人数</span><Input type="number" min={1} max={Math.max(1, remaining)} value={count} disabled={disabled || busy} onChange={e => setBatch(Number(e.target.value))} /></label><div className="draw-candidates"><Users size={14} />{candidates} 位候选参与者</div>
        <Button className={`draw-button ${draw.phase === 'rolling' ? 'stop-button' : ''}`} disabled={disabled || (busy && draw.phase !== 'rolling' && !draw.error) || (!busy && (!prize || !remaining || !candidates))} onClick={trigger}>{draw.phase === 'rolling' ? <><CircleStop size={20} />停止并揭晓</> : draw.error ? <><RotateCcw />重试保存</> : result ? <><Play fill="currentColor" />继续抽奖</> : <><Play fill="currentColor" />开始抽奖</>}</Button><p className="keyboard-hint"><kbd>SPACE</kbd> 开始 / 停止</p>{draw.error && <p className="inline-error" role="alert">{draw.error}</p>}<div className="draw-fairness">随机等概率抽取<br />结果保存后揭晓</div></aside>
    </div>
    <footer className="stage-footer"><span><span className="live-dot" />{data.participants.length} 位参与者已就位</span><span>此刻，值得期待。</span><span>{data.settings.quality === 'low' ? '低画质' : '标准画质'} · 本地数据</span></footer>
  </section>
}
