import { useEffect, useState } from 'react'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'

export function useSocket() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      const socket = getSocket()
      
      const handleConnect = () => setIsConnected(true)
      const handleDisconnect = () => setIsConnected(false)
      
      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      
      // Set initial state
      setIsConnected(socket.connected)
      
      return () => {
        socket.off('connect', handleConnect)
        socket.off('disconnect', handleDisconnect)
        // Don't disconnect on component unmount, only on logout
      }
    } else {
      disconnectSocket()
      setIsConnected(false)
    }
  }, [isAuthenticated])

  return {
    socket: isAuthenticated ? getSocket() : null,
    isConnected: isAuthenticated && isConnected
  }
}

export function useSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void,
  deps: any[] = []
) {
  const { socket } = useSocket()

  useEffect(() => {
    if (socket) {
      socket.on(event, handler)

      return () => {
        socket.off(event, handler)
      }
    }
  }, [socket, event, ...deps])
}