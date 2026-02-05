/**
 * Profile Page - User's own settings
 */
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Mail, Lock, Shield, Camera, X } from 'lucide-react';
import { authApi } from '../api/auth';
import { Button, Alert, Badge } from '../components/common';
import { useAuthStore } from '../stores';

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const [email, setEmail] = useState(user?.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          Manage your account settings and password
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
