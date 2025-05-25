import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSocketEvent } from '@/hooks/useSocket'
import { Container, ContainersResponse } from '@/types/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Search,
  AlertCircle,
  Play,
  Square,
  RefreshCw,
  Globe,
  Tag
} from 'lucide-react'

export function ContainersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)

  // Fetch containers
  const { data, isLoading, error } = useQuery<ContainersResponse>({
    queryKey: ['containers', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      params.append('limit', '50')
      
      const response = await api.get(`/containers?${params}`)
      return response.data
    },
  })

  // Listen for real-time updates
  useSocketEvent('container:started', () => {
    queryClient.invalidateQueries({ queryKey: ['containers'] })
  })

  useSocketEvent('container:stopped', () => {
    queryClient.invalidateQueries({ queryKey: ['containers'] })
  })

  useSocketEvent('container:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['containers'] })
  })

  // Refresh container mutation
  const refreshMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/containers/${id}/refresh`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
    },
  })

  const getStatusBadge = (status: Container['status']) => {
    const variants: Record<Container['status'], { variant: any; icon: any }> = {
      running: { variant: 'default', icon: Play },
      exited: { variant: 'secondary', icon: Square },
      paused: { variant: 'outline', icon: Square },
      restarting: { variant: 'outline', icon: RefreshCw },
      removing: { variant: 'destructive', icon: Square },
      dead: { variant: 'destructive', icon: Square },
    }

    const { variant, icon: Icon } = variants[status] || variants.exited

    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Containers</h1>
        <p className="text-muted-foreground">
          Monitor Docker containers and their DNS configurations
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Docker Containers</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search containers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load containers. Please try again.
              </AlertDescription>
            </Alert>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Hostnames</TableHead>
                <TableHead>DNS Records</TableHead>
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
              ) : data?.containers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    No containers found
                  </TableCell>
                </TableRow>
              ) : (
                data?.containers.map((container) => (
                  <TableRow key={container.id}>
                    <TableCell className="font-medium">
                      {container.name.replace(/^\//, '')}
                    </TableCell>
                    <TableCell>{getStatusBadge(container.status)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={container.image}>
                      {container.image}
                    </TableCell>
                    <TableCell>
                      {container.hostnames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {container.hostnames.slice(0, 2).map((hostname) => (
                            <Badge key={hostname} variant="outline" className="text-xs">
                              {hostname}
                            </Badge>
                          ))}
                          {container.hostnames.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{container.hostnames.length - 2}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {container.dnsRecords.length} records
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedContainer(container)}
                        >
                          View Details
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => refreshMutation.mutate(container.id)}
                          disabled={refreshMutation.isPending}
                          title="Refresh DNS records"
                        >
                          <RefreshCw className={cn(
                            "h-4 w-4",
                            refreshMutation.isPending && "animate-spin"
                          )} />
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

      {/* Container Details Dialog */}
      {selectedContainer && (
        <Dialog open={!!selectedContainer} onOpenChange={() => setSelectedContainer(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{selectedContainer.name.replace(/^\//, '')}</DialogTitle>
              <DialogDescription>
                Container details and DNS configuration
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Container Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      {getStatusBadge(selectedContainer.status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Image</span>
                      <span className="font-mono text-xs truncate max-w-[200px]" title={selectedContainer.image}>
                        {selectedContainer.image}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{formatDate(selectedContainer.created)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Network</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mode</span>
                      <span>{selectedContainer.network?.mode || 'Unknown'}</span>
                    </div>
                    {selectedContainer.network?.ipAddress && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IP Address</span>
                        <span className="font-mono">{selectedContainer.network.ipAddress}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Hostnames */}
              {selectedContainer.hostnames.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Configured Hostnames
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {selectedContainer.hostnames.map((hostname) => (
                        <Badge key={hostname} variant="secondary">
                          {hostname}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* DNS Records */}
              {selectedContainer.dnsRecords.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">DNS Records</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hostname</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Content</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedContainer.dnsRecords.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell>{record.hostname}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.type}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {record.content}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Labels */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Container Labels
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {Object.entries(selectedContainer.labels).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="font-mono text-muted-foreground shrink-0">
                          {key}:
                        </span>
                        <span className="font-mono break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}