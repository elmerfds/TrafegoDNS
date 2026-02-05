/**
 * Users Page - User Management
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Shield, User as UserIcon, Eye } from 'lucide-react';
import { usersApi, type UserListItem, type CreateUserInput, type UpdateUserInput, type UserRole } from '../api/users';
import { Button, Table, Badge, Modal, ModalFooter, Alert, Select } from '../components/common';
import { useAuthStore } from '../stores';

const roleOptions = [
  { value: 'admin', label: 'Admin - Full access' },
  { value: 'user', label: 'User - Standard access' },
  { value: 'readonly', label: 'Read Only - View only' },
];

const getRoleBadgeVariant = (role: UserRole): 'success' | 'info' | 'warning' => {
  switch (role) {
    case 'admin':
      return 'success';
    case 'user':
      return 'info';
    case 'readonly':
      return 'warning';
    default:
      return 'info';
  }
};

const getRoleIcon = (role: UserRole) => {
  switch (role) {
    case 'admin':
      return <Shield className="w-3 h-3 mr-1" />;
    case 'user':
      return <UserIcon className="w-3 h-3 mr-1" />;
    case 'readonly':
      return <Eye className="w-3 h-3 mr-1" />;
    default:
      return null;
  }
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.listUsers(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteUser(null);
    },
  });

  const columns = [
    {
      key: 'username',
      header: 'Username',
      render: (row: UserListItem) => (
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold mr-3">
            {row.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-medium text-gray-900 dark:text-white">{row.username}</span>
            {currentUser?.id === row.id && (
              <Badge variant="info" size="sm" className="ml-2">
                You
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (row: UserListItem) => (
        <span className="text-gray-600 dark:text-gray-300">{row.email}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row: UserListItem) => (
        <Badge variant={getRoleBadgeVariant(row.role)} className="inline-flex items-center">
          {getRoleIcon(row.role)}
          {row.role}
        </Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last Login',
      render: (row: UserListItem) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: UserListItem) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: UserListItem) => {
        const isCurrentUser = currentUser?.id === row.id;
        return (
          <div className="flex items-center space-x-2">
            <button
              className="p-1 text-gray-400 hover:text-blue-600"
              onClick={() => setEditUser(row)}
              title="Edit user"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              className={`p-1 ${isCurrentUser ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-600'}`}
              onClick={() => !isCurrentUser && setDeleteUser(row)}
              title={isCurrentUser ? "Cannot delete yourself" : "Delete user"}
              disabled={isCurrentUser}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Users</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage user accounts and permissions
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Add User
        </Button>
      </div>

      {/* Role descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center mb-2">
            <Badge variant="success" className="inline-flex items-center">
              <Shield className="w-3 h-3 mr-1" />
              Admin
            </Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Full access to all features including user management, provider configuration, and system settings.
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center mb-2">
            <Badge variant="info" className="inline-flex items-center">
              <UserIcon className="w-3 h-3 mr-1" />
              User
            </Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Can view and manage DNS records, but cannot access user management or system settings.
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center mb-2">
            <Badge variant="warning" className="inline-flex items-center">
              <Eye className="w-3 h-3 mr-1" />
              Read Only
            </Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Can view all data but cannot make any changes. Ideal for monitoring purposes.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={usersData?.users ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No users found"
        />
      </div>

      {/* Create Modal */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Edit Modal */}
      <EditUserModal
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        user={editUser}
        isCurrentUser={currentUser?.id === editUser?.id}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        title="Delete User"
        size="sm"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Are you sure you want to delete user <strong className="text-gray-900 dark:text-white">{deleteUser?.username}</strong>?
          This action cannot be undone.
        </p>
        {deleteUser?.role === 'admin' && (
          <div className="mt-4">
            <Alert variant="warning">
              Warning: This user has admin privileges. Make sure there is at least one other admin.
            </Alert>
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteUser(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// Create User Modal
function CreateUserModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateUserInput>({
    username: '',
    email: '',
    password: '',
    role: 'user',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateUserInput) => usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      handleClose();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const handleClose = () => {
    setFormData({ username: '', email: '', password: '', role: 'user' });
    setConfirmPassword('');
    setError(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.username || !formData.email || !formData.password) {
      setError('All fields are required');
      return;
    }

    if (formData.password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    createMutation.mutate(formData);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create User" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Username
          </label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="johndoe"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="john@example.com"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            placeholder="Confirm password"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Role
          </label>
          <Select
            value={formData.role}
            onChange={(value) => setFormData({ ...formData, role: value as UserRole })}
            options={roleOptions}
          />
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create User
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// Edit User Modal
function EditUserModal({
  isOpen,
  onClose,
  user,
  isCurrentUser,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: UserListItem | null;
  isCurrentUser: boolean;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<UpdateUserInput>({});
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when user changes
  useEffect(() => {
    if (isOpen && user) {
      setFormData({ email: user.email, role: user.role });
      setNewPassword('');
      setConfirmPassword('');
      setChangePassword(false);
      setError(null);
    }
  }, [isOpen, user?.id]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateUserInput) => usersApi.updateUser(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      handleClose();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const handleClose = () => {
    setFormData({});
    setNewPassword('');
    setConfirmPassword('');
    setChangePassword(false);
    setError(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const updateData: UpdateUserInput = {};

    if (formData.email && formData.email !== user?.email) {
      updateData.email = formData.email;
    }

    if (formData.role && formData.role !== user?.role) {
      updateData.role = formData.role;
    }

    if (changePassword && newPassword) {
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      updateData.password = newPassword;
    }

    if (Object.keys(updateData).length === 0) {
      setError('No changes to save');
      return;
    }

    updateMutation.mutate(updateData);
  };

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Edit User: ${user.username}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Username
          </label>
          <input
            type="text"
            value={user.username}
            className="w-full px-3 py-2 border rounded-lg bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={formData.email ?? user.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Role
          </label>
          <Select
            value={formData.role ?? user.role}
            onChange={(value) => setFormData({ ...formData, role: value as UserRole })}
            options={roleOptions}
            disabled={isCurrentUser}
          />
          {isCurrentUser && (
            <p className="text-xs text-amber-500 mt-1">You cannot change your own role</p>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={changePassword}
              onChange={(e) => setChangePassword(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Change password</span>
          </label>
        </div>

        {changePassword && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
          </>
        )}

        <ModalFooter>
          <Button variant="secondary" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Save Changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
