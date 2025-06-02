import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, isApiError } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, LogIn } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTheme } from '@/components/theme-provider'

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [error, setError] = useState('')
  const { theme } = useTheme()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Check OIDC status
  const { data: oidcStatus } = useQuery({
    queryKey: ['oidc-status'],
    queryFn: async () => {
      const response = await api.get('/auth/oidc/status')
      return response.data.data
    },
  })

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await api.post('/auth/login', data)
      return response.data
    },
    onSuccess: (response) => {
      login(response.data.accessToken, response.data.user)
      navigate('/')
    },
    onError: (error) => {
      if (isApiError(error)) {
        setError(error.response?.data?.message || 'Invalid credentials')
      } else {
        setError('An unexpected error occurred')
      }
    },
  })

  const onSubmit = (data: LoginFormData) => {
    setError('')
    loginMutation.mutate(data)
  }

  const handleOidcLogin = async () => {
    try {
      const response = await api.get('/auth/oidc/authorize')
      const { authUrl } = response.data.data
      window.location.href = authUrl
    } catch (error) {
      if (isApiError(error)) {
        setError(error.response?.data?.message || 'OIDC login failed')
      } else {
        setError('Failed to initiate OIDC login')
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md login-card">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <img src="/assets/logo.svg" alt="TrafegoDNS Logo" className="h-32 w-32" />
          </div>
          <div className="flex justify-center">
            <img 
              src={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) 
                ? "/assets/trafegodns-header-optimized.svg" 
                : "/assets/trafegodns-header-dark.svg"
              } 
              alt="TrafegoDNS" 
              className="h-12 w-auto"
              style={{ 
                imageRendering: 'auto' as any,
                shapeRendering: 'geometricPrecision' as any,
                textRendering: 'geometricPrecision' as any
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter your username"
                {...register('username')}
                disabled={loginMutation.isPending}
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                {...register('password')}
                disabled={loginMutation.isPending}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Logging in...' : 'Login'}
            </Button>

            {oidcStatus?.enabled && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleOidcLogin}
                  disabled={!oidcStatus?.configured}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Login with SSO
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}