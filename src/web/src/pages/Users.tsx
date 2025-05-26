import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plus, Pencil, Trash2, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface User {
  id: string
  username: string
  role: 'admin' | 'operator' | 'viewer'
  createdAt?: string
  lastLogin?: string
}

interface UserFormData {
  username: string
  password: string
  role: 'admin' | 'operator' | 'viewer'
}

export function UsersPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    role: 'operator',
  })

  const { data: usersResponse, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/auth/users')
      console.log('Users API response:', response.data)
      return response.data
    },
  })

  // Transform snake_case to camelCase for frontend
  const users = Array.isArray(usersResponse?.data?.users) 
    ? usersResponse.data.users.map((user: any) => ({
        ...user,
        lastLogin: user.last_login || user.lastLogin,
        createdAt: user.created_at || user.createdAt
      }))
    : []

  const createMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const response = await api.post('/auth/register', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'User created',
        description: 'The user has been created successfully.',
      })
      setIsCreateOpen(false)
      setFormData({ username: '', password: '', role: 'operator' })
    },
    onError: (error: any) => {
      toast({
        title: 'Creation failed',
        description: error.response?.data?.error || 'Failed to create user',
        variant: 'destructive',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserFormData> }) => {
      const response = await api.put(`/auth/users/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'User updated',
        description: 'The user has been updated successfully.',
      })
      setEditingUser(null)
      setFormData({ username: '', password: '', role: 'operator' })
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.response?.data?.error || 'Failed to update user',
        variant: 'destructive',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/auth/users/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'User deleted',
        description: 'The user has been deleted successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Deletion failed',
        description: error.response?.data?.error || 'Failed to delete user',
        variant: 'destructive',
      })
    },
  })

  const handleCreate = () => {
    createMutation.mutate(formData)
  }

  const handleUpdate = () => {
    if (!editingUser) return
    const updateData: Partial<UserFormData> = {}
    if (formData.username && formData.username !== editingUser.username) {
      updateData.username = formData.username
    }
    if (formData.password) {
      updateData.password = formData.password
    }
    if (formData.role !== editingUser.role) {
      updateData.role = formData.role
    }
    updateMutation.mutate({ id: editingUser.id, data: updateData })
  }

  const handleDelete = (user: User) => {
    if (window.confirm(`Are you sure you want to delete user ${user.username}?`)) {
      deleteMutation.mutate(user.id)
    }
  }

  const openEditDialog = (user: User) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
    })
  }

  const getRoleBadge = (role: string) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      operator: 'bg-blue-100 text-blue-800',
      viewer: 'bg-gray-100 text-gray-800',
    }
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          colors[role as keyof typeof colors] || colors.viewer
        }`}
      >
        {role === 'admin' && <Shield className="w-3 h-3 mr-1" />}
        {role}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600">Error loading users</p>
          <p className="text-sm text-muted-foreground">{String(error)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Create a new user account with specific permissions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  placeholder="Enter password (min 8 characters)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) =>
                    setFormData({ ...formData, role: value as User['role'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user: User) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(user)}
                        disabled={user.id === currentUser?.id}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(user)}
                        disabled={user.id === currentUser?.id}
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
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user account information and permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                value={formData.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                placeholder="Enter username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password</Label>
              <Input
                id="edit-password"
                type="password"
                value={formData.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Leave blank to keep current password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData({ ...formData, role: value as User['role'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}