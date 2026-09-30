// Web Locks are origin-scoped and released automatically when a tab closes.
export function acquireOperatorLock(onChange: (writable: boolean) => void): () => void {
  let disposed = false
  let release: (() => void) | undefined
  if (!navigator.locks) { onChange(false); return () => {} }
  void navigator.locks.request('star-pick-operator', { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock || disposed) { onChange(false); return }
    onChange(true)
    await new Promise<void>(resolve => { release = resolve; if (disposed) resolve() })
    onChange(false)
  }).catch(() => onChange(false))
  return () => { disposed = true; release?.() }
}
