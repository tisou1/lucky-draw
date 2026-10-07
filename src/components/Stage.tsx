import { useEffect, useState } from 'react'
import { ArrowRight, CircleStop, Gift, Maximize, Minimize, Play, RotateCcw, Orbit } from 'lucide-react'
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
  const autoStop = data.settings.drawMode === 'auto'
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
    <header className="stage-heading">
      <div className="stage-title"><p className="stage-kicker">{data.participants.length} 位参与者 · {data.prizes.length} 个奖项</p><h1>{data.settings.name}</h1></div>
      <div className="stage-tools">
        <div className="layout-switch" aria-label="舞台布局">
          <button aria-pressed={data.settings.layout === 'sphere'} className={data.settings.layout === 'sphere' ? 'active' : ''} disabled={disabled || busy} onClick={() => void safeAction(() => mutateActivity(d => ({ ...d, settings: { ...d.settings, layout: 'sphere' } })))}>球体</button>
          <button aria-pressed={data.settings.layout === 'helix'} className={data.settings.layout === 'helix' ? 'active' : ''} disabled={disabled || busy} onClick={() => void safeAction(() => mutateActivity(d => ({ ...d, settings: { ...d.settings, layout: 'helix' } })))}>螺旋</button>
        </div>
        <Button variant="ghost" size="icon" aria-label={fullscreen ? '退出全屏' : '进入全屏'} onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</Button>
      </div>
    </header>
    <div className="stage-content">
      <div className="stage-viewport">
        <div className="scene-host">{scene ?? <div className="placeholder-orbit"><Orbit size={180} strokeWidth={0.4} /></div>}</div>
        {!data.participants.length && <div className="stage-empty"><h2>谁会是下一位？</h2><p>添加参与者，准备开始。</p><Button onClick={onParticipants}>导入参与者名单<ArrowRight /></Button></div>}
        {result && <div className="winner-overlay" key={result.id}>
          <div className="winner-heading"><p>{result.prizeName} · {result.gift}</p><h2>恭喜中奖</h2></div>
          <div className={`winner-grid ${result.winners.length === 1 ? 'single' : ''}`}>
            {result.winners.slice(visiblePage * 6, visiblePage * 6 + 6).map((winner, index) => <article className="winner-card" key={winner.participantId} style={{ animationDelay: `${index * 55}ms` }}>
              <AssetImage id={winner.avatarId} name={winner.name} /><h3>{winner.name}</h3><p>{winner.department || '参与者'}</p><span>{winner.code}</span>
            </article>)}
          </div>
          {result.winners.length > 6 && <Pagination page={visiblePage} pages={Math.ceil(result.winners.length / 6)} onChange={setWinnerPage} />}
          <div className="celebration" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 7) * 70}ms`, background: ['#f1f0eb', '#a7a79f', '#d9bd83'][index % 3], rotate: `${index * 23}deg` }} />)}</div>
        </div>}
        {(draw.phase === 'saving' || draw.phase === 'revealing') && <div className="reveal-label" role="status"><span>{draw.error ? '结果尚未保存，请重试' : draw.phase === 'saving' ? '正在保存结果…' : '即将揭晓'}</span></div>}
      </div>
      <nav className="stage-prizes" aria-label="选择抽奖奖项"><div className="stage-prize-list">
        {data.prizes.map(prizeOption => { const left = prizeOption.total - awardedCount(data.records, prizeOption.id); return <button key={prizeOption.id} className={`stage-prize ${prizeOption.id === selectedPrizeId ? 'selected' : ''}`} aria-pressed={prizeOption.id === selectedPrizeId} disabled={busy || mutating} onClick={() => { useActivity.setState({ selectedPrizeId: prizeOption.id }); setBatch(null); drawEngine.restore(null) }}><strong>{prizeOption.name}</strong><span>{left > 0 ? `${left} 名待抽取` : '已抽完'}</span></button> })}
      </div></nav>
      <div className="draw-panel">
        <div className="current-prize"><div className="current-gift">{prize?.imageId ? <AssetImage id={prize.imageId} name={prize.gift} /> : <Gift size={28} strokeWidth={1.5} />}</div><div><h2>{prize?.name ?? '请先添加奖项'}</h2><p>{prize?.gift ?? '配置奖品后开始抽奖'}</p></div></div>
        <div className="draw-remaining"><span>剩余名额</span><strong>{remaining}<small> / {prize?.total ?? 0}</small></strong></div>
        <label className="batch-control"><span>本轮人数</span><Input type="number" min={1} max={Math.max(1, remaining)} value={count} disabled={disabled || busy} onChange={event => setBatch(Number(event.target.value))} /></label>
        <div className="draw-action">
          <Button className={`draw-button ${draw.phase === 'rolling' ? 'stop-button' : ''}`} disabled={disabled || (busy && draw.phase !== 'rolling' && !draw.error) || (!busy && (!prize || !remaining || !candidates))} onClick={trigger}>
            {draw.phase === 'rolling' ? <><CircleStop size={18} />{autoStop ? '提前停止' : '停止并揭晓'}</> : draw.error ? <><RotateCcw />重试保存</> : result ? <><Play size={18} fill="currentColor" />继续抽奖</> : draw.phase === 'saving' ? '正在保存…' : draw.phase === 'revealing' ? '即将揭晓…' : <><Play size={18} fill="currentColor" />开始抽奖</>}
          </Button>
          <p className="keyboard-hint">{autoStop ? `${data.settings.autoStopSeconds} 秒自动停止` : '手动停止'}<span>·</span><kbd>空格</kbd>开始 / 停止</p>
        </div>
        {draw.error && <p className="inline-error" role="alert">{draw.error}</p>}
      </div>
    </div>
    <footer className="stage-footer"><span>{candidates} 位候选参与者<span>·</span>{data.settings.allowRepeat ? '允许跨奖项重复中奖' : '每人仅中奖一次'}</span><span>{result ? '中奖结果已保存' : '等概率抽取 · 保存后揭晓'}<span>·</span>{data.settings.quality === 'low' ? '低画质' : '标准画质'}</span></footer>
  </section>
}
