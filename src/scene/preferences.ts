import { useEffect, useState } from 'react'

export function useScenePreferences() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(query.matches)
    const visibility = () => setVisible(!document.hidden)
    query.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    return () => { query.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  return { reduced, visible }
}
