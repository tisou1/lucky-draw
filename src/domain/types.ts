export interface Participant {
  id: string
  code: string
  name: string
  department: string
  note: string
  avatarId?: string
}

export interface Prize {
  id: string
  name: string
  gift: string
  total: number
  batchSize: number
  order: number
  imageId?: string
}

export interface WinnerSnapshot {
  participantId: string
  code: string
  name: string
  department: string
  avatarId?: string
}

export interface DrawRecord {
  id: string
  prizeId: string
  prizeName: string
  gift: string
  createdAt: string
  winners: WinnerSnapshot[]
}

export interface ActivitySettings {
  name: string
  allowRepeat: boolean
  layout: 'sphere' | 'helix'
  quality: 'standard' | 'low'
  force2D: boolean
}

export interface ActivitySnapshot {
  version: 1
  participants: Participant[]
  prizes: Prize[]
  records: DrawRecord[]
  settings: ActivitySettings
}

export interface Asset {
  id: string
  blob: Blob
}

export interface StorageRepository {
  load(): Promise<ActivitySnapshot>
  replace(snapshot: ActivitySnapshot, assets?: Asset[], clearAssets?: boolean): Promise<void>
  commitDraw(record: DrawRecord): Promise<void>
  getAsset(id: string): Promise<Asset | undefined>
  getAssets(): Promise<Asset[]>
  loadBundle(): Promise<{ data: ActivitySnapshot; assets: Asset[] }>
}

export type DrawPhase = 'idle' | 'rolling' | 'saving' | 'revealing' | 'result'
export interface DrawState {
  phase: DrawPhase
  record: DrawRecord | null
  error: string | null
}
