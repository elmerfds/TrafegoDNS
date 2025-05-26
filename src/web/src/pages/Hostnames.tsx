import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Hostname, HostnamesResponse, CreateHostnameInput } from '@/types/hostname'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus,
  Search,
  AlertCircle,
  Shield,
  Container,
  Trash2,
  ToggleLeft,
  ToggleRight
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const createHostnameSchema = z.object({
  hostname: z.string()
    .min(1, 'Hostname is required')
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, 'Invalid hostname format'),
})

export function HostnamesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'managed' | 'preserved'>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Fetch hostnames
  const { data: hostnamesResponse, isLoading, error } = useQuery({
    queryKey: ['hostnames', search, filter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filter !== 'all') params.append('type', filter)
      params.append('limit', '50')
      
      const response = await api.get(`/hostnames?${params}`)
      return response.data
    },
  })

  const data = hostnamesResponse?.data

  // Create hostname mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateHostnameInput) => {
      const response = await api.post('/hostnames', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostnames'] })
      setIsCreateOpen(false)
      reset()
    },
  })

  // Toggle hostname type mutation
  const toggleTypeMutation = useMutation({
    mutationFn: async ({ id, currentType }: { id: string; currentType: string }) => {
      const newType = currentType === 'managed' ? 'preserved' : 'managed'
      const response = await api.put(`/hostnames/${id}`, { type: newType })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostnames'] })
    },
  })

  // Delete hostname mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/hostnames/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostnames'] })
    },
  })

  // Form handling
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateHostnameInput>({
    resolver: zodResolver(createHostnameSchema),
    defaultValues: {
      type: 'preserved',
    },
  })

  const onCreateSubmit = (data: CreateHostnameInput) => {
    createMutation.mutate(data)
  }

  const getTypeIcon = (type: string) => {
    return type === 'managed' ? (
      <Container className="h-4 w-4" />
    ) : (
      <Shield className="h-4 w-4" />
    )
  }

  const getTypeBadge = (type: string) => {
    return (
      <Badge variant={type === 'managed' ? 'default' : 'secondary'} className="gap-1">
        {getTypeIcon(type)}
        {type}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hostnames</h1>
        <p className="text-muted-foreground">
          Manage hostname configurations and preservation rules
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total Hostnames</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Managed</CardTitle>
            <CardDescription>Auto-managed by containers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.hostnames?.filter((h: Hostname) => h.type === 'managed').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preserved</CardTitle>
            <CardDescription>Protected from deletion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.hostnames?.filter((h: Hostname) => h.type === 'preserved').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Hostname Management</CardTitle>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search hostnames..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('all')}
                >
                  All
                </Button>
                <Button
                  variant={filter === 'managed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('managed')}
                >
                  Managed
                </Button>
                <Button
                  variant={filter === 'preserved' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('preserved')}
                >
                  Preserved
                </Button>
              </div>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Preserved
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load hostnames. Please try again.
              </AlertDescription>
            </Alert>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>DNS Records</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !data?.hostnames || data.hostnames.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    No hostnames found
                  </TableCell>
                </TableRow>
              ) : (
                data?.hostnames?.map((hostname: Hostname) => (
                  <TableRow key={hostname.id}>
                    <TableCell className="font-medium">{hostname.hostname}</TableCell>
                    <TableCell>{getTypeBadge(hostname.type)}</TableCell>
                    <TableCell>
                      {hostname.containerName ? (
                        <div className="flex items-center gap-1">
                          <Container className="h-3 w-3" />
                          <span className="text-sm">{hostname.containerName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{hostname.recordCount} records</Badge>
                    </TableCell>
                    <TableCell>{new Date(hostname.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleTypeMutation.mutate({ 
                            id: hostname.id, 
                            currentType: hostname.type 
                          })}
                          disabled={toggleTypeMutation.isPending}
                          title={`Switch to ${hostname.type === 'managed' ? 'preserved' : 'managed'}`}
                        >
                          {hostname.type === 'managed' ? (
                            <ToggleLeft className="h-4 w-4" />
                          ) : (
                            <ToggleRight className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this hostname?')) {
                              deleteMutation.mutate(hostname.id)
                            }
                          }}
                          disabled={deleteMutation.isPending || hostname.type === 'managed'}
                          title={hostname.type === 'managed' ? 'Cannot delete managed hostnames' : 'Delete hostname'}
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

      {/* Create Preserved Hostname Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Preserved Hostname</DialogTitle>
            <DialogDescription>
              Add a hostname that will be preserved even when containers are removed
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateSubmit)}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="hostname">Hostname</Label>
                <Input
                  id="hostname"
                  placeholder="example.com or subdomain.example.com"
                  {...register('hostname')}
                />
                {errors.hostname && (
                  <p className="text-sm text-destructive">{errors.hostname.message}</p>
                )}
              </div>
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Preserved hostnames will not be deleted when their associated containers are removed.
                  They must be manually deleted.
                </AlertDescription>
              </Alert>
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
                {createMutation.isPending ? 'Creating...' : 'Add Hostname'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}