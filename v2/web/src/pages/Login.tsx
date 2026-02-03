/**
 * Login Page
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../stores';
import { Button } from '../components/common';
import { Alert } from '../components/common';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">TrafegoDNS</h1>
          <h2 className="mt-2 text-center text-lg text-gray-600">
            Sign in to your account
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="error" onClose={clearError}>
              {error}
            </Alert>
          )}

          <div className="rounded-md shadow-sm space-y-4">
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
                className="input mt-1"
                placeholder="Enter your username"
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
                className="input mt-1"
                placeholder="Enter your password"
              />
            </div>
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
    </div>
  );
}
