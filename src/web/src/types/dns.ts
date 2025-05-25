export interface DNSRecord {
  id: string
  hostname: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA'
  content: string
  ttl: number
  priority?: number
  provider: string
  isManaged: boolean
  isOrphaned: boolean
  metadata?: {
    containerId?: string
    containerName?: string
    source?: string
  }
  createdAt: string
  updatedAt: string
}

export interface CreateDNSRecordInput {
  hostname: string
  type: DNSRecord['type']
  content: string
  ttl?: number
  priority?: number
}

export interface UpdateDNSRecordInput {
  content?: string
  ttl?: number
  priority?: number
}

export interface DNSRecordsResponse {
  records: DNSRecord[]
  total: number
  page: number
  limit: number
}