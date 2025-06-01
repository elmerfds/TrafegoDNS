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
import { SecretInput } from '@/components/ui/secret-input'
import { usePermissions } from '@/hooks/usePermissions'
import { Loader2, Save, AlertTriangle } from 'lucide-react'

interface Config {
  operationMode: string
  pollInterval: number
  watchDockerEvents: boolean
  cleanupOrphaned: boolean
  cleanupGracePeriod: number
  dnsProvider: string
  dnsLabelPrefix: string
  dnsDefaultType: string
  dnsDefaultContent: string
  dnsDefaultProxied: boolean
  dnsDefaultTTL: number
  dnsDefaultManage: boolean
  cloudflareZone: string
  route53Zone: string
  route53ZoneId: string
  route53Region: string
  digitalOceanDomain: string
  traefikApiUrl: string
  traefikApiUsername: string
  dockerSocket: string
  genericLabelPrefix: string
  traefikLabelPrefix: string
  managedHostnames: string
  preservedHostnames: string
  domain: string
  publicIP: string
  publicIPv6: string
  ipRefreshInterval: number
  dnsCacheRefreshInterval: number
  apiTimeout: number
  recordDefaults: any
  // Secret fields
  cloudflareToken?: string
  route53AccessKey?: string
  route53SecretKey?: string
  digitalOceanToken?: string
  traefikApiPassword?: string
  // Secret flags to indicate if values are set
  hasCloudflareToken?: boolean
  hasRoute53AccessKey?: boolean
  hasRoute53SecretKey?: boolean
  hasDigitalOceanToken?: boolean
  hasTraefikApiPassword?: boolean
}

export function SettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<Config>>({})
  const { canPerformAction } = usePermissions()
  const canManageSecrets = canPerformAction('settings.secrets')

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

  const secretsMutation = useMutation({
    mutationFn: async (secrets: any) => {
      const response = await api.put('/config/secrets', secrets)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      toast({
        title: 'Secrets updated',
        description: 'Your secrets have been saved successfully and encrypted.',
      })
      setFormData({})
    },
    onError: (error: any) => {
      toast({
        title: 'Secrets update failed',
        description: error.response?.data?.error || 'Failed to update secrets',
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
    // Separate secrets from regular config
    const {
      cloudflareToken,
      route53AccessKey,
      route53SecretKey,
      digitalOceanToken,
      traefikApiPassword,
      ...regularConfig
    } = formData

    const secrets = {
      cloudflareToken,
      route53AccessKey,
      route53SecretKey,
      digitalOceanToken,
      traefikApiPassword
    }

    // Filter out undefined secrets
    const secretsToUpdate = Object.fromEntries(
      Object.entries(secrets).filter(([_, value]) => value !== undefined)
    )

    // Update secrets if any are provided
    if (Object.keys(secretsToUpdate).length > 0) {
      secretsMutation.mutate(secretsToUpdate)
    }

    // Update regular config if any changes
    if (Object.keys(regularConfig).length > 0) {
      updateMutation.mutate(regularConfig)
    }

    // If only secrets or only config, and no changes, show message
    if (Object.keys(secretsToUpdate).length === 0 && Object.keys(regularConfig).length === 0) {
      toast({
        title: 'No changes',
        description: 'No changes were detected to save.',
        variant: 'default',
      })
    }
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
                  value={formData.pollInterval ?? Math.floor(config.pollInterval / 1000)}
                  onChange={(e) =>
                    handleInputChange('pollInterval', parseInt(e.target.value) * 1000)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleanupGracePeriod">
                  Cleanup Grace Period (minutes)
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

        {/* DNS Provider Settings */}
        <Card>
          <CardHeader>
            <CardTitle>DNS Provider Settings</CardTitle>
            <CardDescription>
              Configure DNS provider and zone settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dnsProvider">DNS Provider</Label>
                <Select
                  value={formData.dnsProvider ?? config.dnsProvider}
                  onValueChange={(value) =>
                    handleInputChange('dnsProvider', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloudflare">Cloudflare</SelectItem>
                    <SelectItem value="route53">AWS Route53</SelectItem>
                    <SelectItem value="digitalocean">DigitalOcean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnsLabelPrefix">DNS Label Prefix</Label>
                <Input
                  id="dnsLabelPrefix"
                  value={formData.dnsLabelPrefix ?? config.dnsLabelPrefix}
                  onChange={(e) =>
                    handleInputChange('dnsLabelPrefix', e.target.value)
                  }
                />
              </div>
            </div>

            {/* Provider-specific settings */}
            {(formData.dnsProvider ?? config.dnsProvider) === 'cloudflare' && (
              <div className="space-y-2">
                <Label htmlFor="cloudflareZone">Cloudflare Zone</Label>
                <Input
                  id="cloudflareZone"
                  value={formData.cloudflareZone ?? config.cloudflareZone}
                  onChange={(e) =>
                    handleInputChange('cloudflareZone', e.target.value)
                  }
                />
              </div>
            )}

            {(formData.dnsProvider ?? config.dnsProvider) === 'route53' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="route53Zone">Route53 Zone</Label>
                  <Input
                    id="route53Zone"
                    value={formData.route53Zone ?? config.route53Zone}
                    onChange={(e) =>
                      handleInputChange('route53Zone', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route53ZoneId">Route53 Zone ID</Label>
                  <Input
                    id="route53ZoneId"
                    value={formData.route53ZoneId ?? config.route53ZoneId}
                    onChange={(e) =>
                      handleInputChange('route53ZoneId', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route53Region">Route53 Region</Label>
                  <Input
                    id="route53Region"
                    value={formData.route53Region ?? config.route53Region}
                    onChange={(e) =>
                      handleInputChange('route53Region', e.target.value)
                    }
                  />
                </div>
              </div>
            )}

            {(formData.dnsProvider ?? config.dnsProvider) === 'digitalocean' && (
              <div className="space-y-2">
                <Label htmlFor="digitalOceanDomain">DigitalOcean Domain</Label>
                <Input
                  id="digitalOceanDomain"
                  value={formData.digitalOceanDomain ?? config.digitalOceanDomain}
                  onChange={(e) =>
                    handleInputChange('digitalOceanDomain', e.target.value)
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Secret Management */}
        {canManageSecrets && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Secret Management
              </CardTitle>
              <CardDescription>
                Configure sensitive API credentials and tokens securely
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cloudflare Secrets */}
              {(formData.dnsProvider ?? config.dnsProvider) === 'cloudflare' && (
                <div className="space-y-2">
                  <Label htmlFor="cloudflareToken">Cloudflare API Token</Label>
                  <SecretInput
                    id="cloudflareToken"
                    hasValue={config.hasCloudflareToken}
                    placeholder="Enter Cloudflare API token..."
                    onChange={(value) => handleInputChange('cloudflareToken', value)}
                  />
                </div>
              )}

              {/* Route53 Secrets */}
              {(formData.dnsProvider ?? config.dnsProvider) === 'route53' && (
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="route53AccessKey">AWS Access Key ID</Label>
                    <SecretInput
                      id="route53AccessKey"
                      hasValue={config.hasRoute53AccessKey}
                      placeholder="Enter AWS Access Key ID..."
                      onChange={(value) => handleInputChange('route53AccessKey', value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="route53SecretKey">AWS Secret Access Key</Label>
                    <SecretInput
                      id="route53SecretKey"
                      hasValue={config.hasRoute53SecretKey}
                      placeholder="Enter AWS Secret Access Key..."
                      onChange={(value) => handleInputChange('route53SecretKey', value)}
                    />
                  </div>
                </div>
              )}

              {/* DigitalOcean Secrets */}
              {(formData.dnsProvider ?? config.dnsProvider) === 'digitalocean' && (
                <div className="space-y-2">
                  <Label htmlFor="digitalOceanToken">DigitalOcean API Token</Label>
                  <SecretInput
                    id="digitalOceanToken"
                    hasValue={config.hasDigitalOceanToken}
                    placeholder="Enter DigitalOcean API token..."
                    onChange={(value) => handleInputChange('digitalOceanToken', value)}
                  />
                </div>
              )}

              {/* Traefik API Password (only in Traefik mode) */}
              {config.operationMode === 'traefik' && config.traefikApiUsername && (
                <div className="space-y-2">
                  <Label htmlFor="traefikApiPassword">Traefik API Password</Label>
                  <SecretInput
                    id="traefikApiPassword"
                    hasValue={config.hasTraefikApiPassword}
                    placeholder="Enter Traefik API password..."
                    onChange={(value) => handleInputChange('traefikApiPassword', value)}
                  />
                </div>
              )}

              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <p className="font-medium">Security Notice:</p>
                <p>
                  Secrets are encrypted before storage and only admin users can manage them.
                  Changes to secrets are logged for security audit purposes.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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

            <div className="space-y-2">
              <Label htmlFor="dnsDefaultContent">Default Content</Label>
              <Input
                id="dnsDefaultContent"
                value={formData.dnsDefaultContent ?? config.dnsDefaultContent}
                onChange={(e) =>
                  handleInputChange('dnsDefaultContent', e.target.value)
                }
              />
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

        {/* Traefik Settings */}
        {(config.operationMode === 'traefik') && (
          <Card>
            <CardHeader>
              <CardTitle>Traefik Settings</CardTitle>
              <CardDescription>
                Configure Traefik API connection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="traefikApiUrl">Traefik API URL</Label>
                  <Input
                    id="traefikApiUrl"
                    value={formData.traefikApiUrl ?? config.traefikApiUrl}
                    onChange={(e) =>
                      handleInputChange('traefikApiUrl', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="traefikApiUsername">Traefik API Username</Label>
                  <Input
                    id="traefikApiUsername"
                    value={formData.traefikApiUsername ?? config.traefikApiUsername}
                    onChange={(e) =>
                      handleInputChange('traefikApiUsername', e.target.value)
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Docker Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Docker Settings</CardTitle>
            <CardDescription>
              Configure Docker connection and label settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dockerSocket">Docker Socket Path</Label>
              <Input
                id="dockerSocket"
                value={formData.dockerSocket ?? config.dockerSocket}
                onChange={(e) =>
                  handleInputChange('dockerSocket', e.target.value)
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="genericLabelPrefix">Generic Label Prefix</Label>
                <Input
                  id="genericLabelPrefix"
                  value={formData.genericLabelPrefix ?? config.genericLabelPrefix}
                  onChange={(e) =>
                    handleInputChange('genericLabelPrefix', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="traefikLabelPrefix">Traefik Label Prefix</Label>
                <Input
                  id="traefikLabelPrefix"
                  value={formData.traefikLabelPrefix ?? config.traefikLabelPrefix}
                  onChange={(e) =>
                    handleInputChange('traefikLabelPrefix', e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Advanced Settings</CardTitle>
            <CardDescription>
              Additional configuration options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="managedHostnames">Managed Hostnames (comma-separated)</Label>
              <Input
                id="managedHostnames"
                value={formData.managedHostnames ?? (config.managedHostnames || '')}
                onChange={(e) =>
                  handleInputChange('managedHostnames', e.target.value)
                }
                placeholder="app1.example.com,app2.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preservedHostnames">Preserved Hostnames (comma-separated)</Label>
              <Input
                id="preservedHostnames"
                value={formData.preservedHostnames ?? (config.preservedHostnames || '')}
                onChange={(e) =>
                  handleInputChange('preservedHostnames', e.target.value)
                }
                placeholder="static.example.com,api.example.com"
              />
              <p className="text-sm text-muted-foreground">
                These hostnames will be preserved from automatic cleanup even when orphaned
              </p>
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
                  value={formData.apiTimeout ?? Math.floor(config.apiTimeout / 1000)}
                  onChange={(e) =>
                    handleInputChange('apiTimeout', parseInt(e.target.value) * 1000)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipRefreshInterval">IP Refresh Interval (seconds)</Label>
                <Input
                  id="ipRefreshInterval"
                  type="number"
                  value={formData.ipRefreshInterval ?? Math.floor(config.ipRefreshInterval / 1000)}
                  onChange={(e) =>
                    handleInputChange('ipRefreshInterval', parseInt(e.target.value) * 1000)
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
                value={formData.dnsCacheRefreshInterval ?? Math.floor(config.dnsCacheRefreshInterval / 1000)}
                onChange={(e) =>
                  handleInputChange('dnsCacheRefreshInterval', parseInt(e.target.value) * 1000)
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || secretsMutation.isPending || Object.keys(formData).length === 0}
          >
            {(updateMutation.isPending || secretsMutation.isPending) && (
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