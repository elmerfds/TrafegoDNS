import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2, RotateCcw, Search, Clock, AlertTriangle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { usePermissions } from '@/hooks/usePermissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface OrphanedRecord {
  id: string
  hostname: string
  name: string
  type: string
  content: string
  ttl: number
  proxied?: boolean
  orphanedAt: string
  orphanedTime: number
}

interface OrphanedHistoryRecord {
  id: string
  hostname: string
  type: string
  content: string
  ttl: number
  proxied?: boolean
  provider: string
  orphanedAt: string
  trackedAt: string
  updatedAt: string
  isDeleted: boolean
  metadata: any
}

interface OrphanedSettings {
  cleanupOrphaned: boolean
  cleanupGracePeriod: number
}

export function OrphanedRecordsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { canPerformAction } = usePermissions()
  const [searchTerm, setSearchTerm] = useState('')
  const [historySearchTerm, setHistorySearchTerm] = useState('')
  const [historyPage, setHistoryPage] = useState(1)

  const { data: records, isLoading } = useQuery({
    queryKey: ['orphaned-records'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned')
      // Transform the API response to match the expected format
      return response.data.data.records.map((record: any) => ({
        ...record,
        hostname: record.name,
        orphanedAt: record.orphanedSince || '',
        orphanedTime: record.elapsedMinutes ? record.elapsedMinutes * 60 : 0 // Convert minutes to seconds
      })) as OrphanedRecord[]
    },
  })

  const { data: settings } = useQuery({
    queryKey: ['orphaned-settings'],
    queryFn: async () => {
      const response = await api.get('/hostnames/orphaned/settings')
      return response.data.data.settings as OrphanedSettings
    },
  })

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['orphaned-history', historyPage],
    queryFn: async () => {
      const response = await api.get(`/dns/orphaned/history?page=${historyPage}&limit=20`)
      return response.data.data
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/hostnames/orphaned/${id}/restore`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orphaned-records'] })
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
      toast({
        title: 'Record restored',
        description: 'The DNS record has been restored successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Restore failed',
        description: error.response?.data?.error || 'Failed to restore record',
        variant: 'destructive',
      })
    },
  })

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/dns/records/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orphaned-records'] })
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
      toast({
        title: 'Record deleted',
        description: 'The DNS record has been deleted successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Delete failed',
        description: error.response?.data?.error || 'Failed to delete record',
        variant: 'destructive',
      })
    },
  })

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/dns/orphaned/delete-expired')
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orphaned-records'] })
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
      toast({
        title: 'Cleanup completed',
        description: `Removed ${data.data.totalDeleted || 0} orphaned records.`,
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Cleanup failed',
        description: error.response?.data?.error || 'Failed to cleanup records',
        variant: 'destructive',
      })
    },
  })

  const forceDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/dns/orphaned/force-delete')
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orphaned-records'] })
      queryClient.invalidateQueries({ queryKey: ['dns-records'] })
      toast({
        title: 'Force delete completed',
        description: `Forcefully removed ${data.data.totalDeleted || 0} orphaned records.`,
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Force delete failed',
        description: error.response?.data?.error || 'Failed to force delete records',
        variant: 'destructive',
      })
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: OrphanedSettings) => {
      const response = await api.put('/hostnames/orphaned/settings', newSettings)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orphaned-settings'] })
      toast({
        title: 'Settings updated',
        description: 'Orphaned record settings have been updated.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.response?.data?.error || 'Failed to update settings',
        variant: 'destructive',
      })
    },
  })

  const filteredRecords = records?.filter((record) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      record.hostname.toLowerCase().includes(term) ||
      record.name.toLowerCase().includes(term) ||
      record.type.toLowerCase().includes(term) ||
      record.content.toLowerCase().includes(term)
    )
  })

  const filteredHistoryRecords = historyData?.records?.filter((record: OrphanedHistoryRecord) => {
    if (!historySearchTerm) return true
    const term = historySearchTerm.toLowerCase()
    return (
      record.hostname.toLowerCase().includes(term) ||
      record.type.toLowerCase().includes(term) ||
      record.content.toLowerCase().includes(term)
    )
  })

  const formatTimeAgo = (seconds: number) => {
    if (!seconds || seconds === 0) return 'Unknown'
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown'
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return 'Invalid date'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const orphanedRecords = filteredRecords || []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orphaned Records</h1>
          <p className="text-muted-foreground">
            DNS records that are no longer associated with active containers
          </p>
        </div>
        <div className="flex gap-2">
          {canPerformAction('orphaned.cleanup') && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={orphanedRecords.length === 0}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cleanup All
                </Button>
              </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cleanup Orphaned Records</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all orphaned DNS records that have exceeded
                  the grace period. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => cleanupMutation.mutate()}>
                  Cleanup Records
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
          )}
          
          {canPerformAction('orphaned.forceDelete') && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={orphanedRecords.length === 0}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Force Delete All
                </Button>
              </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Force Delete All Orphaned Records</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
                    This will <strong>forcefully delete ALL orphaned DNS records</strong> regardless 
                    of grace period or app-managed status.
                  </p>
                  <p className="text-destructive font-semibold">
                    ⚠️ WARNING: This action bypasses all safety checks and cannot be undone!
                  </p>
                  <p>
                    Use this only when records are stuck and won't delete through normal cleanup.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => forceDeleteMutation.mutate()}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Force Delete All Records
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Cleanup Settings</CardTitle>
          <CardDescription>
            Configure automatic cleanup behavior for orphaned records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-cleanup">Automatic Cleanup</Label>
              <p className="text-sm text-muted-foreground">
                Automatically remove orphaned records after the grace period
              </p>
            </div>
            <Switch
              id="auto-cleanup"
              checked={settings?.cleanupOrphaned || false}
              onCheckedChange={(checked) =>
                updateSettingsMutation.mutate({
                  ...settings!,
                  cleanupOrphaned: checked,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grace-period">Grace Period (seconds)</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="grace-period"
                type="number"
                value={settings?.cleanupGracePeriod || 3600}
                onChange={(e) =>
                  updateSettingsMutation.mutate({
                    ...settings!,
                    cleanupGracePeriod: parseInt(e.target.value),
                  })
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">
                ({Math.floor((settings?.cleanupGracePeriod || 3600) / 60)} minutes)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Tables with Tabs */}
      <Tabs defaultValue="current" className="space-y-4">
        <TabsList>
          <TabsTrigger value="current">Current Orphaned Records</TabsTrigger>
          <TabsTrigger value="history">Orphaned Records History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="current">
          <Card>
            <CardHeader>
              <CardTitle>Current Orphaned Records</CardTitle>
              <CardDescription>
                {orphanedRecords.length} record{orphanedRecords.length !== 1 ? 's' : ''} currently in grace period or ready for cleanup
              </CardDescription>
            </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>TTL</TableHead>
                  <TableHead>Orphaned</TableHead>
                  {canPerformAction('orphaned.delete') && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphanedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No orphaned records found
                    </TableCell>
                  </TableRow>
                ) : (
                  orphanedRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{record.hostname}</span>
                          {record.orphanedTime < (settings?.cleanupGracePeriod || 3600) && (
                            <Badge variant="secondary" className="text-xs">
                              <Clock className="mr-1 h-3 w-3" />
                              In Grace Period
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{record.content}</TableCell>
                      <TableCell>{record.ttl}s</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1 text-muted-foreground">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">
                            {formatTimeAgo(record.orphanedTime)}
                          </span>
                        </div>
                      </TableCell>
                      {canPerformAction('orphaned.delete') && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => restoreMutation.mutate(record.id)}
                              disabled={restoreMutation.isPending}
                              title="Restore record"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={deleteRecordMutation.isPending}
                                  title="Delete record"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete DNS Record</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this DNS record? This will remove it from your DNS provider and cannot be undone.
                                  <br /><br />
                                  <strong>Record:</strong> {record.hostname} ({record.type})
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteRecordMutation.mutate(record.id)}>
                                  Delete Record
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Orphaned Records History</CardTitle>
              <CardDescription>
                {historyData?.pagination?.total || 0} historical orphaned records (showing page {historyPage} of {historyData?.pagination?.totalPages || 1})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search history..."
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {isHistoryLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead>TTL</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Orphaned At</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistoryRecords?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No orphaned records history found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredHistoryRecords?.map((record: OrphanedHistoryRecord) => (
                          <TableRow key={record.id}>
                            <TableCell>
                              <span className="font-medium">{record.hostname}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.type}</Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">{record.content}</TableCell>
                            <TableCell>{record.ttl}s</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{record.provider}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-muted-foreground">
                                {formatDate(record.orphanedAt)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={record.isDeleted ? "destructive" : "default"}>
                                {record.isDeleted ? "Deleted" : "Tracked"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination for history */}
              {historyData?.pagination && historyData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between space-x-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((historyPage - 1) * 20) + 1} to {Math.min(historyPage * 20, historyData.pagination.total)} of {historyData.pagination.total} records
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
                      disabled={historyPage <= 1}
                    >
                      Previous
                    </Button>
                    <div className="text-sm font-medium">
                      Page {historyPage} of {historyData.pagination.totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage(Math.min(historyData.pagination.totalPages, historyPage + 1))}
                      disabled={historyPage >= historyData.pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}