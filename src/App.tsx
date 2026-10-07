import { useEffect, useState } from 'react'
import { Orbit, Users, Gift, History, Settings2, X, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Participants from '@/components/Participants'
import Prizes from '@/components/Prizes'
import Records from '@/components/Records'
import Stage from '@/components/Stage'
import SceneLayer from '@/scene/SceneLayer'
import Settings from '@/components/Settings'
import { drawEngine, initializeActivity, notify, subscribeChanges, useActivity } from '@/store/activity'
import { acquireOperatorLock } from '@/storage/operator-lock'
import '@/styles/app.css'

export default function App() {
  const [view, setView] = useState('stage')
  const [lockAttempt, setLockAttempt] = useState(0)
  const { ready, writable, mutating, notice, draw } = useActivity()
  useEffect(() => {
    if (draw.phase !== 'revealing') return
    const timeout = setTimeout(() => drawEngine.finishReveal(), 1100)
    return () => clearTimeout(timeout)
  }, [draw.phase])
  useEffect(() => {
    let alive = true
    let unlock = () => {}
    const unsubscribe = subscribeChanges()
    void initializeActivity().then(() => {
      if (!alive) return
      unlock = acquireOperatorLock(value => { if (alive) useActivity.setState({ writable: value }) })
    }).catch(error => notify(`本地数据读取失败：${String(error)}`))
    return () => { alive = false; unlock(); unsubscribe() }
  }, [lockAttempt])
  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => notify(null), 6500)
    return () => clearTimeout(timeout)
  }, [notice])
  const tabs = [
    { id: 'stage', label: '抽奖舞台', icon: Orbit }, { id: 'participants', label: '参与者', icon: Users },
    { id: 'prizes', label: '奖项设置', icon: Gift }, { id: 'records', label: '中奖记录', icon: History },
  ]
  return <div className="app-shell">
    <header className="app-header">
      <button className="brand" onClick={() => setView('stage')} aria-label="星选，回到抽奖舞台">
        <svg className="brand-mark" viewBox="0 0 40 40" fill="none"><path d="M20 2L24 16L38 20L24 24L20 38L16 24L2 20L16 16Z" fill="currentColor" /><path d="M31 4L33 10L39 12L33 14L31 20L29 14L23 12L29 10Z" fill="currentColor" opacity=".45" /></svg><div><strong>星选</strong><span>现场抽奖</span></div>
      </button>
      <nav className="app-nav" aria-label="主导航">{tabs.map(tab => <button key={tab.id} className={view === tab.id ? 'active' : ''} aria-current={view === tab.id ? 'page' : undefined} onClick={() => setView(tab.id)}><tab.icon size={16} />{tab.label}</button>)}</nav>
      <div className="header-status"><span className="saved-label">{mutating ? '正在保存…' : writable ? '本地已就绪' : '只读模式'}</span><Button variant={view === 'settings' ? 'secondary' : 'ghost'} size="icon" aria-label="活动设置" onClick={() => setView('settings')}><Settings2 /></Button></div>
    </header>
    {ready && !writable && <div className="read-only-banner">{navigator.locks ? '当前页面为只读。关闭其他操作页面后，可重新获取权限。' : '当前环境不支持操作锁，请通过 localhost 或 HTTPS 使用 Chrome / Edge 打开。'}<Button variant="link" size="sm" onClick={() => setLockAttempt(v => v + 1)}>获取操作权限</Button></div>}
    {!ready ? <div className="app-loading"><LoaderCircle className="spin" size={30} /><p>正在准备本地舞台…</p><Button variant="outline" onClick={() => setLockAttempt(v => v + 1)}>重新读取</Button></div> : <>
      {view === 'participants' && <Participants />}
      {view === 'prizes' && <Prizes />}
      {view === 'stage' && <Stage onParticipants={() => setView('participants')} scene={<SceneLayer />} />}
      {view === 'records' && <Records />}
      {view === 'settings' && <Settings />}
    </>}
    {notice && <div className="notice" role="status"><span>{notice}</span><Button variant="ghost" size="icon-sm" aria-label="关闭提示" onClick={() => notify(null)}><X /></Button></div>}
  </div>
}
