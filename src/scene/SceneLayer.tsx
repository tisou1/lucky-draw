import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Participant } from '@/domain/types'
import { useActivity } from '@/store/activity'
import { AssetImage } from '@/components/AssetImage'
import { useScenePreferences } from './preferences'

const Scene3D = lazy(() => import('./Scene3D'))
const placeholders: Participant[] = Array.from({ length: 64 }, (_, i) => ({ id: `preview-${i}`, code: `STAR ${String(i + 1).padStart(3, '0')}`, name: '幸运席位', department: '等待你的加入', note: '' }))

function webGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Fallback({ participants, rolling, visible, reduced }: { participants: Participant[]; rolling: boolean; visible: boolean; reduced: boolean }) {
  return <div className={`fallback-scene ${rolling ? 'rolling' : ''} ${!visible || reduced ? 'motion-paused' : ''}`} aria-hidden="true"><div className="fallback-ring" /><div className="fallback-cards">{participants.slice(0, 48).map(p => <div className="fallback-card" key={p.id}><AssetImage id={p.avatarId} name={p.name} /><strong>{p.name}</strong><small>{p.department}</small></div>)}</div><span className="fallback-badge">2D 卡片舞台</span></div>
}

export default function SceneLayer() {
  const participants = useActivity(s => s.data.participants)
  const settings = useActivity(s => s.data.settings)
  const phase = useActivity(s => s.draw.phase)
  const { reduced, visible } = useScenePreferences()
  const [supported] = useState(webGLAvailable)
  const [failed, setFailed] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = settings.quality === 'low' ? 120 : 300
  const source = participants.length ? participants : placeholders
  useEffect(() => {
    if (!visible || source.length <= limit || phase === 'rolling' || phase === 'saving' || phase === 'revealing') return
    const timer = setInterval(() => setOffset(value => (value + limit) % source.length), 12000)
    return () => clearInterval(timer)
  }, [source.length, limit, phase, visible])
  const cards = useMemo(() => Array.from({ length: Math.min(source.length, limit) }, (_, i) => source[(offset + i) % source.length]), [source, offset, limit])
  const onFailure = useCallback(() => setFailed(true), [])
  const fallback = <Fallback participants={cards} rolling={phase === 'rolling'} visible={visible} reduced={reduced} />
  if (!supported || failed || settings.force2D) return fallback
  return <SceneBoundary fallback={fallback}><Suspense fallback={fallback}><Scene3D participants={cards} layout={settings.layout} quality={settings.quality} phase={phase} reduced={reduced} visible={visible} onFailure={onFailure} /></Suspense></SceneBoundary>
}
