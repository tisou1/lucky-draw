import type { Asset } from '@/domain/types'

const palette = ['#217e9d', '#6561ba', '#287e7a', '#aa6386', '#527fa9', '#927245']
export function avatarColor(name: string) {
  const hash = [...name].reduce((value, c) => value + c.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

export async function compressImage(file: File, maxEdge: number): Promise<Asset> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('图片仅支持 PNG、JPEG 和 WebP')
  if (file.size > 15 * 1024 * 1024) throw new Error('单张图片不能超过 15 MB')
  const bitmap = await createImageBitmap(file)
  try {
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法处理图片，请换一张图片重试')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片压缩失败')), 'image/webp', 0.85))
    return { id: crypto.randomUUID(), blob }
  } finally { bitmap.close() }
}
