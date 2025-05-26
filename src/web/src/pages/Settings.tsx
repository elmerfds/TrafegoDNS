import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save } from 'lucide-react'

interface Config {
  operationMode: string
  pollInterval: number
  watchDockerEvents: boolean
  cleanupOrphaned: boolean
  cleanupGracePeriod: number
  dnsProvider: string
  dnsDefaultType: string
  dnsDefaultProxied: boolean
  dnsDefaultTTL: number
  dnsDefaultManage: boolean
  domain: string
  publicIP: string
  publicIPv6: string
  ipRefreshInterval: number
  dnsCacheRefreshInterval: number
  apiTimeout: number
}

export function SettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<Config>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await api.get('/config')
      return response.data.data.config as Config
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (config: Partial<Config>) => {
      const response = await api.put('/config', config)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      toast({
        title: 'Settings updated',
        description: 'Your settings have been saved successfully.',
      })
      setFormData({})
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.response?.data?.error || 'Failed to update settings',
        variant: 'destructive',
      })
    },
  })

  const toggleModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const response = await api.put('/config/mode', { mode })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      toast({
        title: 'Operation mode updated',
        description: data.data.requiresRestart
          ? 'Restart required for changes to take effect.'
          : 'Operation mode has been updated.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.response?.data?.error || 'Failed to update operation mode',
        variant: 'destructive',
      })
    },
  })

  const handleInputChange = (field: keyof Config, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    updateMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const config = data || ({} as Config)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure TrafegoDNS settings</p>
      </div>

      <div className="grid gap-6">
        {/* Operation Mode */}
        <Card>
          <CardHeader>
            <CardTitle>Operation Mode</CardTitle>
            <CardDescription>
              Choose between Traefik integration or direct Docker label mode
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={config.operationMode}
              onValueChange={(value) => toggleModeMutation.mutate(value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="traefik">Traefik Mode</SelectItem>
                <SelectItem value="direct">Direct Mode</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Application Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Application Settings</CardTitle>
            <CardDescription>
              Configure core application behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pollInterval">Poll Interval (seconds)</Label>
                <Input
                  id="pollInterval"
                  type="number"
                  value={formData.pollInterval ?? config.pollInterval}
                  onChange={(e) =>
                    handleInputChange('pollInterval', parseInt(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleanupGracePeriod">
                  Cleanup Grace Period (seconds)
                </Label>
                <Input
                  id="cleanupGracePeriod"
                  type="number"
                  value={formData.cleanupGracePeriod ?? config.cleanupGracePeriod}
                  onChange={(e) =>
                    handleInputChange('cleanupGracePeriod', parseInt(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="watchDockerEvents"
                checked={formData.watchDockerEvents ?? config.watchDockerEvents}
                onCheckedChange={(checked) =>
                  handleInputChange('watchDockerEvents', checked)
                }
              />
              <Label htmlFor="watchDockerEvents">Watch Docker Events</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="cleanupOrphaned"
                checked={formData.cleanupOrphaned ?? config.cleanupOrphaned}
                onCheckedChange={(checked) =>
                  handleInputChange('cleanupOrphaned', checked)
                }
              />
              <Label htmlFor="cleanupOrphaned">Cleanup Orphaned Records</Label>
            </div>
          </CardContent>
        </Card>

        {/* DNS Settings */}
        <Card>
          <CardHeader>
            <CardTitle>DNS Settings</CardTitle>
            <CardDescription>
              Configure default DNS record settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dnsDefaultType">Default Record Type</Label>
                <Select
                  value={formData.dnsDefaultType ?? config.dnsDefaultType}
                  onValueChange={(value) =>
                    handleInputChange('dnsDefaultType', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="AAAA">AAAA</SelectItem>
                    <SelectItem value="CNAME">CNAME</SelectItem>
                    <SelectItem value="MX">MX</SelectItem>
                    <SelectItem value="TXT">TXT</SelectItem>
                    <SelectItem value="SRV">SRV</SelectItem>
                    <SelectItem value="CAA">CAA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnsDefaultTTL">Default TTL</Label>
                <Input
                  id="dnsDefaultTTL"
                  type="number"
                  value={formData.dnsDefaultTTL ?? config.dnsDefaultTTL}
                  onChange={(e) =>
                    handleInputChange('dnsDefaultTTL', parseInt(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="dnsDefaultProxied"
                checked={formData.dnsDefaultProxied ?? config.dnsDefaultProxied}
                onCheckedChange={(checked) =>
                  handleInputChange('dnsDefaultProxied', checked)
                }
              />
              <Label htmlFor="dnsDefaultProxied">Proxy through Cloudflare by Default</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="dnsDefaultManage"
                checked={formData.dnsDefaultManage ?? config.dnsDefaultManage}
                onCheckedChange={(checked) =>
                  handleInputChange('dnsDefaultManage', checked)
                }
              />
              <Label htmlFor="dnsDefaultManage">Manage Records by Default</Label>
            </div>
          </CardContent>
        </Card>

        {/* Network Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Network Settings</CardTitle>
            <CardDescription>
              Configure network and cache settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="apiTimeout">API Timeout (seconds)</Label>
                <Input
                  id="apiTimeout"
                  type="number"
                  value={formData.apiTimeout ?? config.apiTimeout}
                  onChange={(e) =>
                    handleInputChange('apiTimeout', parseInt(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipRefreshInterval">IP Refresh Interval (seconds)</Label>
                <Input
                  id="ipRefreshInterval"
                  type="number"
                  value={formData.ipRefreshInterval ?? config.ipRefreshInterval}
                  onChange={(e) =>
                    handleInputChange('ipRefreshInterval', parseInt(e.target.value))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dnsCacheRefreshInterval">
                DNS Cache Refresh Interval (seconds)
              </Label>
              <Input
                id="dnsCacheRefreshInterval"
                type="number"
                value={formData.dnsCacheRefreshInterval ?? config.dnsCacheRefreshInterval}
                onChange={(e) =>
                  handleInputChange('dnsCacheRefreshInterval', parseInt(e.target.value))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || Object.keys(formData).length === 0}
          >
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}