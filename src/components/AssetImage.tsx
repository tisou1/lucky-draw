import { useEffect, useState } from 'react'
import { repository } from '@/storage/repository'
import { avatarColor } from '@/lib/images'

export function AssetImage({ id, name, className = '' }: { id?: string; name: string; className?: string }) {
  const [url, setUrl] = useState<{ id: string; value: string } | null>(null)
  useEffect(() => {
    let alive = true
    let created: string | undefined
    if (id) void repository.getAsset(id).then(asset => {
      if (!asset || !alive) return
      created = URL.createObjectURL(asset.blob)
      setUrl({ id, value: created })
    }).catch(() => {})
    return () => { alive = false; if (created) URL.revokeObjectURL(created) }
  }, [id])
  return url && url.id === id
    ? <img src={url.value} alt={name} className={`asset-image ${className}`} />
    : <span className={`avatar-placeholder ${className}`} style={{ background: avatarColor(name) }} aria-label={`${name}的默认头像`}>{name.slice(-2)}</span>
}
