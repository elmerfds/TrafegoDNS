export interface Container {
  id: string
  name: string
  image: string
  status: 'running' | 'exited' | 'paused' | 'restarting' | 'removing' | 'dead'
  state: string
  labels: Record<string, string>
  hostnames: string[]
  dnsRecords: {
    hostname: string
    type: string
    content: string
  }[]
  network?: {
    mode: string
    ipAddress?: string
  }
  compose?: {
    project?: string | null
    service?: string | null
  }
  created: string
  started?: string
}

export interface ContainersResponse {
  containers: Container[]
  total: number
  page: number
  limit: number
}

export interface ContainerLabels {
  [key: string]: string
}