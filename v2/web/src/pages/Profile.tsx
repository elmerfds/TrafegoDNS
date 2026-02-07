/**
 * Profile Page - User's own settings + API Key management
 */
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Mail,
  Lock,
  Shield,
  Camera,
  X,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { authApi, type ApiKey } from '../api/auth';
import { Button, Alert, Badge, Modal, ModalFooter } from '../components/common';
import { useAuthStore } from '../stores';

/** Permissions available per role (mirrors backend ROLE_ALLOWED_PERMISSIONS) */
const ROLE_PERMISSIONS: Record<string, { value: string; label: string; description: string }[]> = {
  admin: [
    { value: '*', label: 'Full Access', description: 'All operations (read, write, delete, admin)' },
    { value: 'read', label: 'Read', description: 'View records, providers, settings' },
    { value: 'write', label: 'Write', description: 'Create, update, and delete resources' },
  ],
  user: [
    { value: 'read', label: 'Read', description: 'View records, providers, settings' },
    { value: 'write', label: 'Write', description: 'Create, update, and delete resources' },
  ],
  readonly: [
    { value: 'read', label: 'Read', description: 'View records, providers, settings' },
  ],
};

function formatDate(date: string | undefined | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isExpired(expiresAt: string | undefined | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

// ─── API Keys Section ────────────────────────────────────────────────────────

function ApiKeysSection() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showRevoke, setShowRevoke] = useState<ApiKey | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form state
  const [keyName, setKeyName] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['read']);
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [createError, setCreateError] = useState<string | null>(null);

  const userRole = user?.role ?? 'readonly';
  const availablePerms = ROLE_PERMISSIONS[userRole] ?? ROLE_PERMISSIONS.readonly;

  // Fetch API keys
  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => authApi.listApiKeys(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; permissions: string[]; expiresAt?: string }) =>
      authApi.createApiKey(data),
    onSuccess: (result) => {
      setNewKey(result.key);
      setKeyName('');
      setSelectedPerms(['read']);
      setExpiresIn('never');
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error: Error) => {
      setCreateError(error.message);
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => authApi.deleteApiKey(id),
    onSuccess: () => {
      setShowRevoke(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreate = () => {
    if (!keyName.trim()) {
      setCreateError('Name is required');
      return;
    }
    if (selectedPerms.length === 0) {
      setCreateError('Select at least one permission');
      return;
    }

    let expiresAt: string | undefined;
    if (expiresIn !== 'never') {
      const now = new Date();
      const days = parseInt(expiresIn, 10);
      now.setDate(now.getDate() + days);
      expiresAt = now.toISOString();
    }

    createMutation.mutate({ name: keyName.trim(), permissions: selectedPerms, expiresAt });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseCreate = () => {
    setShowCreate(false);
    setNewKey(null);
    setCreateError(null);
    setKeyName('');
    setSelectedPerms(['read']);
    setExpiresIn('never');
    setCopied(false);
  };

  const togglePerm = (perm: string) => {
    if (perm === '*') {
      // Full access is exclusive
      setSelectedPerms(selectedPerms.includes('*') ? ['read'] : ['*']);
      return;
    }
    // If selecting a granular perm, remove wildcard
    let next = selectedPerms.filter(p => p !== '*');
    if (next.includes(perm)) {
      next = next.filter(p => p !== perm);
    } else {
      next.push(perm);
    }
    if (next.length === 0) next = ['read'];
    setSelectedPerms(next);
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Keys
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Create API keys for programmatic access. Keys inherit your role's permissions.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Create Key
        </Button>
      </div>

      {/* API Keys List */}
      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Loading...</div>
      ) : apiKeys.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          No API keys yet. Create one for programmatic access.
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((apiKey) => {
            const expired = isExpired(apiKey.expiresAt);
            return (
              <div
                key={apiKey.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  expired
                    ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {apiKey.name}
                    </span>
                    {expired && (
                      <Badge variant="error" className="text-xs">Expired</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                      {apiKey.prefix}...
                    </code>
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {(typeof apiKey.permissions === 'string'
                        ? JSON.parse(apiKey.permissions)
                        : apiKey.permissions
                      ).join(', ')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Used {formatDate(apiKey.lastUsedAt)}
                    </span>
                    {apiKey.expiresAt && (
                      <span className={`flex items-center gap-1 ${expired ? 'text-red-500' : ''}`}>
                        Expires {formatDate(apiKey.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowRevoke(apiKey)}
                  className="ml-3 p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Revoke key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={handleCloseCreate} title={newKey ? 'API Key Created' : 'Create API Key'}>
        {newKey ? (
          /* Key created — show once */
          <div className="space-y-4">
            <Alert variant="warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Copy this key now. It will not be shown again.</span>
              </div>
            </Alert>

            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-mono break-all border border-gray-200 dark:border-gray-700">
                {newKey}
              </code>
              <button
                onClick={() => handleCopy(newKey)}
                className={`p-2 rounded-lg transition-colors ${
                  copied
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
                title={copied ? 'Copied!' : 'Copy to clipboard'}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Use this key in the <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">X-API-Key</code> header for API requests.
            </p>

            <ModalFooter>
              <Button onClick={handleCloseCreate}>Done</Button>
            </ModalFooter>
          </div>
        ) : (
          /* Create form */
          <div className="space-y-4">
            {createError && <Alert variant="error">{createError}</Alert>}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Name
              </label>
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                placeholder="e.g., CI/CD Pipeline, Monitoring Script"
                maxLength={100}
                autoFocus
              />
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Permissions
              </label>
              <div className="space-y-2">
                {availablePerms.map((perm) => (
                  <label
                    key={perm.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPerms.includes(perm.value)
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(perm.value)}
                      onChange={() => togglePerm(perm.value)}
                      className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {perm.label}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{perm.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              {userRole !== 'admin' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  Permissions are limited to your role ({userRole}).
                </p>
              )}
            </div>

            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expiration
              </label>
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              >
                <option value="never">Never expires</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
              </select>
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={handleCloseCreate}>Cancel</Button>
              <Button onClick={handleCreate} isLoading={createMutation.isPending}>
                Create API Key
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal isOpen={!!showRevoke} onClose={() => setShowRevoke(null)} title="Revoke API Key">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Are you sure you want to revoke <strong className="text-gray-900 dark:text-white">{showRevoke?.name}</strong>?
            This action cannot be undone and any systems using this key will lose access immediately.
          </p>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setShowRevoke(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => showRevoke && revokeMutation.mutate(showRevoke.id)}
              isLoading={revokeMutation.isPending}
            >
              Revoke Key
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}

// ─── Profile Page ────────────────────────────────────────────────────────────

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, updateUser, authMode } = useAuthStore();
  const [email, setEmail] = useState(user?.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync email when user loads (e.g. after page refresh when checkAuth completes)
  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  const updateMutation = useMutation({
    mutationFn: (data: { email?: string; password?: string; avatar?: string | null }) => authApi.updateProfile(data),
    onSuccess: (updatedUser) => {
      setSuccess('Profile updated successfully');
      setError(null);
      setChangePassword(false);
      setNewPassword('');
      setConfirmPassword('');
      setAvatarPreview(null);
      // Update user in store
      updateUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => {
      setError(error.message);
      setSuccess(null);
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 500KB)
    if (file.size > 500 * 1024) {
      setError('Image must be smaller than 500KB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview('__remove__'); // Special marker for removal
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const updateData: { email?: string; password?: string; avatar?: string | null } = {};

    if (email !== user?.email) {
      updateData.email = email;
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

    // Handle avatar changes
    if (avatarPreview === '__remove__') {
      updateData.avatar = null;
    } else if (avatarPreview) {
      updateData.avatar = avatarPreview;
    }

    if (Object.keys(updateData).length === 0) {
      setError('No changes to save');
      return;
    }

    updateMutation.mutate(updateData);
  };

  const getRoleBadgeVariant = (role: string): 'success' | 'info' | 'warning' => {
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Profile Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage your account settings and API keys
        </p>
      </div>

      {/* User Info Card */}
      <div className="card p-6">
        <div className="flex items-center space-x-4 mb-6">
          {/* Avatar with upload */}
          <div className="relative group">
            {(avatarPreview && avatarPreview !== '__remove__') || (user?.avatar && avatarPreview !== '__remove__') ? (
              <img
                src={avatarPreview && avatarPreview !== '__remove__' ? avatarPreview : user?.avatar || ''}
                alt="Avatar"
                className="w-20 h-20 rounded-xl object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            {/* Upload overlay */}
            <div
              className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-6 h-6 text-white" />
            </div>
            {/* Remove button */}
            {(user?.avatar || avatarPreview) && avatarPreview !== '__remove__' && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Remove avatar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {user?.username}
            </h3>
            <div className="flex items-center space-x-2 mt-1">
              <Badge variant={getRoleBadgeVariant(user?.role ?? 'user')} className="inline-flex items-center">
                <Shield className="w-3 h-3 mr-1" />
                {user?.role}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Hover over avatar to change
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <Alert variant="error">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          {/* Username (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <User className="w-4 h-4 inline mr-2" />
              Username
            </label>
            <input
              type="text"
              value={user?.username ?? ''}
              className="w-full px-3 py-2 border rounded-lg bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Mail className="w-4 h-4 inline mr-2" />
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              autoComplete="email"
            />
          </div>

          {/* Change Password Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={changePassword}
                onChange={(e) => setChangePassword(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                <Lock className="w-4 h-4 inline mr-2" />
                Change password
              </span>
            </label>
          </div>

          {changePassword && (
            <div className="space-y-4 pl-6 border-l-2 border-primary-500">
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
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-4">
            <Button type="submit" isLoading={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>

      {/* API Keys Section — only show when auth is enabled */}
      {authMode !== 'none' && <ApiKeysSection />}

      {/* Role Info Card */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Your Permissions</h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          {user?.role === 'admin' && (
            <>
              <p>As an <strong className="text-green-600">Admin</strong>, you have full access to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Manage all DNS records</li>
                <li>Configure providers and settings</li>
                <li>Create and manage users</li>
                <li>View audit logs</li>
                <li>Manage webhooks and tunnels</li>
              </ul>
            </>
          )}
          {user?.role === 'user' && (
            <>
              <p>As a <strong className="text-blue-600">User</strong>, you can:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>View and manage DNS records</li>
                <li>View providers (read-only)</li>
                <li>View settings (read-only)</li>
              </ul>
            </>
          )}
          {user?.role === 'readonly' && (
            <>
              <p>As a <strong className="text-amber-600">Read Only</strong> user, you can:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>View DNS records</li>
                <li>View providers</li>
                <li>View settings</li>
              </ul>
              <p className="text-amber-600 mt-2">You cannot make any changes to the system.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
