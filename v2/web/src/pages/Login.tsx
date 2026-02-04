/**
 * Login Page
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../stores';
import { Button } from '../components/common';
import { Alert } from '../components/common';
import { Lock } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate({ to: '/' });
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="min-h-screen flex gradient-bg dark:bg-gray-950">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo.svg" alt="TrafegoDNS" className="w-24 h-24" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">TrafegoDNS</h1>
          <p className="text-lg text-gray-400 mb-6">
            Automatic DNS management for your Docker containers and Traefik routes.
          </p>
          <div className="flex justify-center gap-2">
            <span className="px-3 py-1 text-sm font-bold bg-gradient-to-r from-primary-500 to-purple-500 text-white rounded-lg">
              v2
            </span>
            <span className="px-3 py-1 text-sm font-medium bg-gray-800 text-gray-400 rounded-lg">
              BETA
            </span>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/logo.svg" alt="TrafegoDNS" className="w-16 h-16" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">TrafegoDNS</h1>
            <div className="flex justify-center gap-2 mt-2">
              <span className="px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-primary-500 to-purple-500 text-white rounded-md">
                v2
              </span>
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl dark:shadow-none border border-gray-200 dark:border-gray-800 p-8">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Welcome back
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Sign in to access your dashboard
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert variant="error" onClose={clearError}>
                  {error}
                </Alert>
              )}

              <div>
                <label htmlFor="username" className="label">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input mt-1.5"
                  placeholder="Enter your username"
                  autoComplete="username"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input mt-1.5"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
              >
                Sign in
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
            TrafegoDNS v2 - Automatic DNS Management
          </p>
        </div>
      </div>
    </div>
  );
}
