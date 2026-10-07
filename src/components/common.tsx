import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { notify } from '@/store/activity'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-field"><Label asChild><span>{label}</span></Label>{children}{hint && <small>{hint}</small>}</label>
}

export function Modal({ open, onClose, title, description, children, wide = false, busy = false }: {
  open: boolean; onClose: () => void; title: string; description: string; children: ReactNode; wide?: boolean; busy?: boolean
}) {
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose() }}>
    <DialogContent className={`app-dialog ${wide ? 'dialog-wide' : ''}`} showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
}

export function Confirm({ open, onClose, title, description, action, destructive = true }: {
  open: boolean; onClose: () => void; title: string; description: string; action: () => Promise<void>; destructive?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try { await action(); onClose() } catch (e) { notify(e instanceof Error ? e.message : '操作失败') }
    finally { setBusy(false) }
  }
  return <Modal open={open} onClose={onClose} title={title} description={description} busy={busy}>
    <div className="dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button variant={destructive ? 'destructive' : 'default'} onClick={() => void confirm()} disabled={busy}>{busy && <LoaderCircle className="spin" />}确认{title}</Button></div>
  </Modal>
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return <div className="pagination"><span>第 {page + 1} / {Math.max(1, pages)} 页</span><Button variant="outline" size="icon" aria-label="上一页" disabled={page <= 0} onClick={() => onChange(page - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="下一页" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}><ChevronRight /></Button></div>
}

export function PageHead({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1><p className="muted">{description}</p></div><div className="page-actions">{children}</div></header>
}
