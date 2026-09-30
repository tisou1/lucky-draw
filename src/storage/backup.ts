import { strFromU8, strToU8, unzip, zip } from 'fflate'
import type { ActivitySnapshot, Asset, StorageRepository } from '@/domain/types'
import { assetReferences, validateSnapshot } from '@/domain/validation'

export interface BackupBundle { data: ActivitySnapshot; assets: Asset[] }
const MAX_ARCHIVE = 100 * 1024 * 1024
const MAX_EXPANDED = 128 * 1024 * 1024
const MANIFEST_LIMIT = 8 * 1024 * 1024
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

function validateImage(bytes: Uint8Array, mime: string) {
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = bytes.length >= 12 && strFromU8(bytes.subarray(0, 4)) === 'RIFF' && strFromU8(bytes.subarray(8, 12)) === 'WEBP'
  if (!(mime === 'image/png' && png || mime === 'image/jpeg' && jpeg || mime === 'image/webp' && webp)) throw new Error('备份中的图片内容或格式损坏')
}

export async function createBackup(repository: StorageRepository): Promise<Blob> {
  const { data, assets } = await repository.loadBundle()
  validateSnapshot(data)
  const files: Record<string, Uint8Array> = {}
  const referenced = assetReferences(data)
  const exported = assets.filter(a => referenced.has(a.id))
  if (exported.length !== referenced.size) throw new Error('有图片缺失，请重新上传后再备份')
  let total = 0
  for (const asset of exported) {
    const bytes = new Uint8Array(await asset.blob.arrayBuffer())
    validateImage(bytes, asset.blob.type)
    files[`assets/${asset.id}.bin`] = bytes
    total += bytes.length
  }
  const manifest = strToU8(JSON.stringify({ format: 'star-pick', version: 1, data, assets: exported.map(a => ({ id: a.id, mime: a.blob.type })) }))
  if (manifest.length > MANIFEST_LIMIT || total + manifest.length > MAX_EXPANDED) throw new Error('活动数据过大，无法生成完整备份')
  files['manifest.json'] = manifest
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)))
  return new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' })
}

export async function readBackup(file: Blob): Promise<BackupBundle> {
  if (!file.size || file.size > MAX_ARCHIVE) throw new Error('备份文件为空或超过 100 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let expanded = 0
  let filterError = ''
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(bytes, {
    filter: entry => {
      expanded += entry.originalSize
      if (expanded > MAX_EXPANDED || entry.originalSize > (entry.name === 'manifest.json' ? MANIFEST_LIMIT : 20 * 1024 * 1024)) {
        filterError = '备份解压后过大'; return false
      }
      if (entry.name !== 'manifest.json' && !/^assets\/[a-zA-Z0-9_-]{1,80}\.bin$/.test(entry.name)) {
        filterError = '备份包含无效文件路径'; return false
      }
      return true
    },
  }, (error, result) => {
    if (error) reject(new Error('无法读取 ZIP 备份，请确认文件完整'))
    else if (filterError) reject(new Error(filterError))
    else resolve(result)
  }))
  if (!files['manifest.json']) throw new Error('缺少备份清单')
  let manifest: { format?: string; version?: number; data?: unknown; assets?: unknown }
  try { manifest = JSON.parse(strFromU8(files['manifest.json'])) as typeof manifest } catch { throw new Error('备份清单损坏') }
  if (!manifest || manifest.format !== 'star-pick' || manifest.version !== 1 || !Array.isArray(manifest.assets)) throw new Error('不支持的备份格式或版本')
  const data = validateSnapshot(manifest.data)
  const referenced = assetReferences(data)
  const seen = new Set<string>()
  const assets: Asset[] = []
  for (const entry of manifest.assets) {
    if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) || !imageTypes.has(entry.mime)) throw new Error('备份图片清单无效')
    if (seen.has(entry.id) || !referenced.has(entry.id)) throw new Error('备份图片重复或未被引用')
    const content = files[`assets/${entry.id}.bin`]
    if (!content) throw new Error('备份图片缺失')
    validateImage(content, entry.mime)
    seen.add(entry.id)
    assets.push({ id: entry.id, blob: new Blob([new Uint8Array(content).buffer], { type: entry.mime }) })
  }
  if (seen.size !== referenced.size || Object.keys(files).length !== assets.length + 1) throw new Error('备份图片引用不完整')
  // Only return a fully validated bundle. The caller asks for confirmation before writing.
  return { data, assets }
}
