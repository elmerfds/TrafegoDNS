import { useEffect } from 'react'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'

export function useSocket() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) {
      const socket = getSocket()
      
      return () => {
        // Don't disconnect on component unmount, only on logout
      }
    } else {
      disconnectSocket()
    }
  }, [isAuthenticated])

  return getSocket()
}

export function useSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void,
  deps: any[] = []
) {
  const socket = useSocket()

  useEffect(() => {
    if (socket) {
      socket.on(event, handler)

      return () => {
        socket.off(event, handler)
      }
    }
  }, [socket, event, ...deps])
}