export interface Hostname {
  id: string
  hostname: string
  type: 'managed' | 'preserved'
  source?: string
  containerId?: string
  containerName?: string
  recordCount: number
  createdAt: string
  updatedAt: string
}

export interface HostnamesResponse {
  hostnames: Hostname[]
  total: number
  page: number
  limit: number
}

export interface CreateHostnameInput {
  hostname: string
  type: 'preserved'
}

export interface UpdateHostnameInput {
  type: 'managed' | 'preserved'
}