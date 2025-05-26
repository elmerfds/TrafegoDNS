import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSocketEvent } from '@/hooks/useSocket'
import { DNSRecord, DNSRecordsResponse, CreateDNSRecordInput, UpdateDNSRecordInput } from '@/types/dns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Search,
  AlertCircle,
  Globe,
  Container
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA'] as const

const createRecordSchema = z.object({
  hostname: z.string().min(1, 'Hostname is required'),
  type: z.enum(recordTypes),
  content: z.string().min(1, 'Content is required'),
  ttl: z.number().min(60).max(86400).optional(),
  priority: z.number().min(0).max(65535).optional(),
})

export function DNSRecordsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'managed' | 'orphaned'>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null)

  // Fetch DNS records
  const { data, isLoading, error } = useQuery<DNSRecordsResponse>({
    queryKey: ['dns-records', search, filter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filter !== 'all') params.append('filter', filter)
      params.append('limit', '50')
      
      const response = await api.get(`/dns/records?${params}`)
      return response.data
    },
  })

  // Listen for real-time updates
  useSocketEvent('dns:record:created', () => {
    queryClient.invalidateQueries({ queryKey: ['dns-records'] })
  })

  useSocketEvent('dns:record:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['dns-records'] })
  })

  useSocketEvent('dns:record:deleted', () => {
    queryClient.invalidateQueries({ queryKey: ['dns-records'] })
  })

  // Create record mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateDNSRecordInput) => {
      const response = await api.post('/dns/records', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
      setIsCreateOpen(false)
      reset()
    },
  })

  // Update record mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateDNSRecordInput }) => {
      const response = await api.put(`/dns/records/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
      setEditingRecord(null)
    },
  })

  // Delete record mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/dns/records/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
    },
  })

  // Form handling
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<CreateDNSRecordInput>({
    resolver: zodResolver(createRecordSchema),
    defaultValues: {
      type: 'A',
      ttl: 300,
    },
  })

  const recordType = watch('type')

  const onCreateSubmit = (data: CreateDNSRecordInput) => {
    createMutation.mutate(data)
  }

  const getRecordIcon = (record: DNSRecord) => {
    if (record.isManaged) return <Container className="h-4 w-4 text-blue-500" />
    if (record.isOrphaned) return <AlertCircle className="h-4 w-4 text-orange-500" />
    return <Globe className="h-4 w-4 text-gray-500" />
  }

  const getRecordTooltip = (record: DNSRecord) => {
    if (record.isManaged) return 'Managed by container'
    if (record.isOrphaned) return 'Orphaned record'
    return 'Manual record'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">DNS Records</h1>
        <p className="text-muted-foreground">
          Manage DNS records across all configured providers
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Records</CardTitle>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="managed">Managed</SelectItem>
                  <SelectItem value="orphaned">Orphaned</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Record
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load DNS records. Please try again.
              </AlertDescription>
            </Alert>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>TTL</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !data?.records || data.records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                data?.records?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div title={getRecordTooltip(record)}>
                        {getRecordIcon(record)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{record.hostname}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        {record.type}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={record.content}>
                      {record.content}
                    </TableCell>
                    <TableCell>{record.ttl}s</TableCell>
                    <TableCell>{record.provider}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingRecord(record)}
                          disabled={record.isManaged}
                          title={record.isManaged ? 'Cannot edit managed records' : 'Edit record'}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this record?')) {
                              deleteMutation.mutate(record.id)
                            }
                          }}
                          disabled={record.isManaged || deleteMutation.isPending}
                          title={record.isManaged ? 'Cannot delete managed records' : 'Delete record'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Record Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add DNS Record</DialogTitle>
            <DialogDescription>
              Create a new DNS record in your provider
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateSubmit)}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="hostname">Hostname</Label>
                <Input
                  id="hostname"
                  placeholder="subdomain.example.com"
                  {...register('hostname')}
                />
                {errors.hostname && (
                  <p className="text-sm text-destructive">{errors.hostname.message}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="type">Record Type</Label>
                <Select
                  value={recordType}
                  onValueChange={(value) => setValue('type', value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {recordTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="content">Content</Label>
                <Input
                  id="content"
                  placeholder={
                    recordType === 'A' ? '192.168.1.1' :
                    recordType === 'CNAME' ? 'target.example.com' :
                    recordType === 'MX' ? 'mail.example.com' :
                    recordType === 'TXT' ? 'v=spf1 include:example.com ~all' :
                    'Record content'
                  }
                  {...register('content')}
                />
                {errors.content && (
                  <p className="text-sm text-destructive">{errors.content.message}</p>
                )}
              </div>

              {(recordType === 'MX' || recordType === 'SRV') && (
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    {...register('priority', { valueAsNumber: true })}
                  />
                  {errors.priority && (
                    <p className="text-sm text-destructive">{errors.priority.message}</p>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="ttl">TTL (seconds)</Label>
                <Input
                  id="ttl"
                  type="number"
                  {...register('ttl', { valueAsNumber: true })}
                />
                {errors.ttl && (
                  <p className="text-sm text-destructive">{errors.ttl.message}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false)
                  reset()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Record'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      {editingRecord && (
        <Dialog open={!!editingRecord} onOpenChange={() => setEditingRecord(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit DNS Record</DialogTitle>
              <DialogDescription>
                Update the content or TTL of this record
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const data: UpdateDNSRecordInput = {
                  content: formData.get('content') as string,
                  ttl: parseInt(formData.get('ttl') as string),
                }
                if (editingRecord.type === 'MX' || editingRecord.type === 'SRV') {
                  data.priority = parseInt(formData.get('priority') as string)
                }
                updateMutation.mutate({ id: editingRecord.id, data })
              }}
            >
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Hostname</Label>
                  <Input value={editingRecord.hostname} disabled />
                </div>

                <div className="grid gap-2">
                  <Label>Record Type</Label>
                  <Input value={editingRecord.type} disabled />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-content">Content</Label>
                  <Input
                    id="edit-content"
                    name="content"
                    defaultValue={editingRecord.content}
                    required
                  />
                </div>

                {(editingRecord.type === 'MX' || editingRecord.type === 'SRV') && (
                  <div className="grid gap-2">
                    <Label htmlFor="edit-priority">Priority</Label>
                    <Input
                      id="edit-priority"
                      name="priority"
                      type="number"
                      defaultValue={editingRecord.priority}
                      required
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="edit-ttl">TTL (seconds)</Label>
                  <Input
                    id="edit-ttl"
                    name="ttl"
                    type="number"
                    defaultValue={editingRecord.ttl}
                    required
                    min="60"
                    max="86400"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingRecord(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Updating...' : 'Update Record'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}