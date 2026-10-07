import * as THREE from 'three'
import type { Participant } from '@/domain/types'
import { avatarColor } from '@/lib/images'
import { repository } from '@/storage/repository'

export const TILE_WIDTH = 128
export const TILE_HEIGHT = 160
export const ATLAS_COLUMNS = 16

export async function buildAtlas(participants: Participant[], signal: AbortSignal): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLUMNS * TILE_WIDTH
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, Math.ceil(participants.length / ATLAS_COLUMNS)) * TILE_HEIGHT)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建头像纹理')
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i]
    const x = (i % ATLAS_COLUMNS) * TILE_WIDTH
    const y = Math.floor(i / ATLAS_COLUMNS) * TILE_HEIGHT
    context.save(); context.translate(x, y)
    context.fillStyle = '#dfded8'
    context.beginPath(); context.roundRect(3, 3, 122, 154, 4); context.fill()
    context.strokeStyle = '#87877f'; context.lineWidth = 1
    context.stroke()
    context.fillStyle = avatarColor(p.name)
    context.beginPath(); context.roundRect(40, 18, 48, 48, 12); context.fill()
    context.textAlign = 'center'
    context.fillStyle = '#fafaf7'; context.font = '500 19px "Microsoft YaHei", sans-serif'
    context.fillText(p.name.slice(-2), 64, 49)
    context.fillStyle = '#242424'; context.font = '600 14px "Microsoft YaHei", sans-serif'
    context.fillText(p.name.length > 7 ? p.name.slice(0, 6) + '…' : p.name, 64, 96, 114)
    context.fillStyle = '#55554f'; context.font = '10px "Microsoft YaHei", sans-serif'
    context.fillText(p.department.slice(0, 9) || '幸运参与者', 64, 116, 110)
    context.fillStyle = '#73736d'; context.font = '8px Consolas, monospace'
    context.fillText(p.code.slice(0, 16), 64, 142, 110)
    context.restore()
  }

  // Bound concurrent image decoding and close every decoded bitmap.
  let cursor = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (!signal.aborted && cursor < participants.length) {
      const i = cursor++
      const avatarId = participants[i].avatarId
      if (!avatarId) continue
      try {
        const asset = await repository.getAsset(avatarId)
        if (!asset || signal.aborted) continue
        const bitmap = await createImageBitmap(asset.blob)
        try {
          const x = (i % ATLAS_COLUMNS) * TILE_WIDTH + 40
          const y = Math.floor(i / ATLAS_COLUMNS) * TILE_HEIGHT + 18
          context.save(); context.beginPath(); context.roundRect(x, y, 48, 48, 12); context.clip()
          const side = Math.min(bitmap.width, bitmap.height)
          context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, x, y, 48, 48)
          context.restore()
        } finally { bitmap.close() }
      } catch { /* Keep the generated avatar when an image cannot be decoded. */ }
    }
  }))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}
