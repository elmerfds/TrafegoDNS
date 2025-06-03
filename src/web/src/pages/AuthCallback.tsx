import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    const token = searchParams.get('token')
    const expiresIn = searchParams.get('expiresIn')
    const error = searchParams.get('error')

    if (error) {
      // Handle error
      console.error('OIDC callback error:', error)
      navigate('/login', { 
        state: { error: decodeURIComponent(error) }
      })
    } else if (token) {
      // Decode JWT to get user info
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const user = {
          id: payload.id,
          username: payload.username,
          role: payload.role
        }
        
        // Store token and user info
        login(token, user)
        
        // Redirect to home
        navigate('/')
      } catch (err) {
        console.error('Failed to decode token:', err)
        navigate('/login', { 
          state: { error: 'Invalid authentication token' }
        })
      }
    } else {
      // No token or error, redirect to login
      navigate('/login')
    }
  }, [searchParams, login, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Authenticating</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">
            Please wait while we complete your login...
          </p>
        </CardContent>
      </Card>
    </div>
  )
}