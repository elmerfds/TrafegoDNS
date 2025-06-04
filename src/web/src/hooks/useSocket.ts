import { useEffect, useState, useCallback, useRef } from 'react'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'
import { webSocketService } from '../services/websocketService'

interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  reconnectAttempts: number;
  lastConnectedAt: Date | null;
  latency: number | null;
}

export function useSocket() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    connectionQuality: 'unknown',
    reconnectAttempts: 0,
    lastConnectedAt: null,
    latency: null
  })

  // Refs for reconnection logic
  const reconnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latencyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pingStartTimeRef = useRef<number | null>(null)

  // Reconnection configuration
  const reconnectionConfig = {
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 1.5
  }

  /**
   * Calculate reconnection delay with exponential backoff
   */
  const getReconnectionDelay = useCallback((attempts: number): number => {
    const delay = Math.min(
      reconnectionConfig.baseDelay * Math.pow(reconnectionConfig.backoffFactor, attempts),
      reconnectionConfig.maxDelay
    )
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000
  }, [])

  /**
   * Measure connection latency
   */
  const measureLatency = useCallback(() => {
    const socket = getSocket()
    if (!socket || !socket.connected) return

    pingStartTimeRef.current = Date.now()
    socket.emit('ping', { timestamp: pingStartTimeRef.current })
  }, [])

  /**
   * Handle connection quality assessment
   */
  const assessConnectionQuality = useCallback((latency: number) => {
    let quality: ConnectionState['connectionQuality']
    
    if (latency < 100) {
      quality = 'excellent'
    } else if (latency < 300) {
      quality = 'good'
    } else if (latency < 1000) {
      quality = 'poor'
    } else {
      quality = 'unknown'
    }

    setConnectionState(prev => ({
      ...prev,
      latency,
      connectionQuality: quality
    }))
  }, [])

  /**
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnection = useCallback(() => {
    if (!isAuthenticated) return

    setConnectionState(prev => {
      if (prev.reconnectAttempts >= reconnectionConfig.maxAttempts) {
        console.error('Max reconnection attempts reached')
        return prev
      }

      const newAttempts = prev.reconnectAttempts + 1
      const delay = getReconnectionDelay(newAttempts)
      
      console.info(`Attempting reconnection ${newAttempts}/${reconnectionConfig.maxAttempts} in ${delay}ms`)
      
      reconnectionTimeoutRef.current = setTimeout(() => {
        try {
          const socket = getSocket()
          if (!socket.connected) {
            socket.connect()
          }
        } catch (error) {
          console.error('Reconnection attempt failed:', error)
          // Try again after another delay
          attemptReconnection()
        }
      }, delay)

      return {
        ...prev,
        isConnecting: true,
        reconnectAttempts: newAttempts
      }
    })
  }, [isAuthenticated, getReconnectionDelay])

  /**
   * Clear reconnection timeout
   */
  const clearReconnectionTimeout = useCallback(() => {
    if (reconnectionTimeoutRef.current) {
      clearTimeout(reconnectionTimeoutRef.current)
      reconnectionTimeoutRef.current = null
    }
  }, [])

  /**
   * Setup socket event handlers
   */
  useEffect(() => {
    if (isAuthenticated) {
      const socket = getSocket()
      
      const handleConnect = () => {
        console.info('WebSocket connected')
        clearReconnectionTimeout()
        
        setConnectionState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          reconnectAttempts: 0,
          lastConnectedAt: new Date()
        }))

        // Initialize WebSocket service
        webSocketService.initialize(socket)
        
        // Start latency monitoring
        latencyCheckIntervalRef.current = setInterval(measureLatency, 30000) // Every 30 seconds
        measureLatency() // Initial measurement
      }
      
      const handleDisconnect = (reason: string) => {
        console.warn('WebSocket disconnected:', reason)
        
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          connectionQuality: 'unknown',
          latency: null
        }))

        // Clear latency monitoring
        if (latencyCheckIntervalRef.current) {
          clearInterval(latencyCheckIntervalRef.current)
          latencyCheckIntervalRef.current = null
        }

        // Attempt reconnection if not manually disconnected
        if (reason !== 'io client disconnect' && reason !== 'transport close') {
          attemptReconnection()
        }
      }

      const handleConnectError = (error: any) => {
        console.error('WebSocket connection error:', error)
        
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false
        }))

        // Attempt reconnection on error
        attemptReconnection()
      }

      const handlePong = (data: { timestamp: number }) => {
        if (pingStartTimeRef.current) {
          const latency = Date.now() - pingStartTimeRef.current
          assessConnectionQuality(latency)
          pingStartTimeRef.current = null
        }
      }

      const handleReconnect = (attemptNumber: number) => {
        console.info(`Reconnection attempt ${attemptNumber}`)
        setConnectionState(prev => ({
          ...prev,
          isConnecting: true
        }))
      }

      const handleReconnectError = (error: any) => {
        console.error('Reconnection error:', error)
      }

      const handleReconnectFailed = () => {
        console.error('Reconnection failed - max attempts reached')
        setConnectionState(prev => ({
          ...prev,
          isConnecting: false
        }))
      }

      // Register event handlers
      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('connect_error', handleConnectError)
      socket.on('pong', handlePong)
      socket.on('reconnect', handleReconnect)
      socket.on('reconnect_error', handleReconnectError)
      socket.on('reconnect_failed', handleReconnectFailed)
      
      // Set initial connection state
      setConnectionState(prev => ({
        ...prev,
        isConnected: socket.connected,
        isConnecting: false,
        reconnectAttempts: 0
      }))

      // Initialize WebSocket service if already connected
      if (socket.connected) {
        webSocketService.initialize(socket)
      }
      
      return () => {
        // Cleanup event handlers
        socket.off('connect', handleConnect)
        socket.off('disconnect', handleDisconnect)
        socket.off('connect_error', handleConnectError)
        socket.off('pong', handlePong)
        socket.off('reconnect', handleReconnect)
        socket.off('reconnect_error', handleReconnectError)
        socket.off('reconnect_failed', handleReconnectFailed)
        
        // Clear timeouts and intervals
        clearReconnectionTimeout()
        if (latencyCheckIntervalRef.current) {
          clearInterval(latencyCheckIntervalRef.current)
        }
        
        // Don't disconnect on component unmount, only on logout
      }
    } else {
      // User logged out - disconnect and cleanup
      disconnectSocket()
      webSocketService.cleanup()
      clearReconnectionTimeout()
      
      if (latencyCheckIntervalRef.current) {
        clearInterval(latencyCheckIntervalRef.current)
        latencyCheckIntervalRef.current = null
      }
      
      setConnectionState({
        isConnected: false,
        isConnecting: false,
        connectionQuality: 'unknown',
        reconnectAttempts: 0,
        lastConnectedAt: null,
        latency: null
      })
    }
  }, [isAuthenticated, attemptReconnection, clearReconnectionTimeout, measureLatency, assessConnectionQuality])

  /**
   * Manual reconnection function
   */
  const reconnect = useCallback(() => {
    if (!isAuthenticated) return
    
    setConnectionState(prev => ({
      ...prev,
      reconnectAttempts: 0
    }))
    
    attemptReconnection()
  }, [isAuthenticated, attemptReconnection])

  return {
    socket: isAuthenticated ? getSocket() : null,
    isConnected: isAuthenticated && connectionState.isConnected,
    isConnecting: connectionState.isConnecting,
    connectionQuality: connectionState.connectionQuality,
    reconnectAttempts: connectionState.reconnectAttempts,
    lastConnectedAt: connectionState.lastConnectedAt,
    latency: connectionState.latency,
    reconnect
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