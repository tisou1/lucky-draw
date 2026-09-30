import { useEffect } from 'react'
import { initializeActivity, useActivity } from '@/store/activity'

export default function App() {
  const ready = useActivity(state => state.ready)
  useEffect(() => { void initializeActivity() }, [])
  return <main style={{ padding: 48 }}><h1>星选 · 3D 抽奖舞台</h1><p>{ready ? '数据存储已就绪' : '正在准备本地数据…'}</p></main>
}
