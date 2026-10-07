import { useState } from 'react'
import { Download, History, Trophy } from 'lucide-react'
import { Button } from './ui/button'
import { AssetImage } from './AssetImage'
import { PageHead, Pagination } from './common'
import { exportRecords } from '@/lib/download'
import { useActivity } from '@/store/activity'

export default function Records() {
  const records = useActivity(s => s.data.records)
  const [page, setPage] = useState(0)
  const sorted = [...records].reverse()
  const count = records.reduce((sum, r) => sum + r.winners.length, 0)
  const pages = Math.ceil(records.length / 8)
  const current = Math.min(page, Math.max(0, pages - 1))
  return <section className="management-page">
    <PageHead title="中奖记录" description={`已完成 ${records.length} 轮抽奖，共发出 ${count} 个中奖名额。`}><Button variant="outline" disabled={!records.length} onClick={() => exportRecords(records)}><Download />导出中奖记录</Button></PageHead>
    {records.length ? <><div className="record-list">{sorted.slice(current * 8, current * 8 + 8).map(r => <article className="panel record-panel" key={r.id}>
      <header className="record-heading"><div className="record-title"><Trophy size={20} /><div><h2>{r.prizeName}</h2><p>{r.gift}</p></div></div><div className="record-date"><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString('zh-CN')}</time><span>本轮 {r.winners.length} 人</span></div></header>
      <div className="record-winners">{r.winners.map(w => <div className="record-winner" key={w.participantId}><AssetImage id={w.avatarId} name={w.name} /><div><strong>{w.name}</strong><p>{w.department || '参与者'}<span> · {w.code}</span></p></div></div>)}</div>
    </article>)}</div><Pagination page={current} pages={pages} onChange={setPage} /></> : <div className="panel empty-state"><History size={40} /><h2>暂无中奖记录</h2><p>抽奖结果保存后，会在这里留下记录。</p></div>}
  </section>
}
