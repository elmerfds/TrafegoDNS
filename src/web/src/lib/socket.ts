import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/authStore'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().token
    
    socket = io(import.meta.env.DEV ? 'http://localhost:9999' : '/', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      console.log('WebSocket connected')
    })

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected')
    })

    socket.on('error', (error) => {
      console.error('WebSocket error:', error)
    })
  }

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

// Re-export event types for type safety
export interface DNSRecordEvent {
  action: 'created' | 'updated' | 'deleted'
  record: any
}

export interface ContainerEvent {
  action: 'start' | 'stop' | 'remove' | 'update'
  container: any
}

export interface StatusEvent {
  healthy: boolean
  statistics: {
    totalRecords: number
    totalContainers: number
    totalHostnames: number
  }
}