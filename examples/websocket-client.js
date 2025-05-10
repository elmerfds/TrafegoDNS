/**
 * WebSocket Client Example for TrafegoDNS
 * 
 * This is a reference implementation for frontend developers
 * to connect to the real-time WebSocket API.
 * 
 * Usage:
 * 1. Install socket.io-client: npm install socket.io-client
 * 2. Adjust API_URL and TOKEN to match your environment
 * 3. Run with Node.js: node websocket-client.js
 */

const { io } = require('socket.io-client');

// Configuration
const API_URL = 'http://localhost:3000'; // Change to your API URL
const TOKEN = 'your-jwt-token'; // Get this from /api/v1/auth/login endpoint

/**
 * Connect to the WebSocket server
 */
function connect() {
  console.log('Connecting to TrafegoDNS WebSocket server...');
  
  // Create socket connection with authentication
  const socket = io(API_URL, {
    auth: {
      token: TOKEN
    },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  // Connection events
  socket.on('connect', () => {
    console.log('Connected to WebSocket server');
    
    // Subscribe to events you're interested in
    subscribeToEvents(socket);
  });
  
  socket.on('welcome', (data) => {
    console.log('Received welcome message:', data);
  });
  
  // Error handling
  socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Disconnected from WebSocket server:', reason);
  });
  
  return socket;
}

/**
 * Subscribe to events
 * @param {Object} socket - Socket.IO socket
 */
function subscribeToEvents(socket) {
  // Subscribe to all events (use with caution in production)
  // socket.emit('subscribe', '*');
  
  // Subscribe to specific events
  socket.emit('subscribe', 'dns:record:created');
  socket.emit('subscribe', 'dns:record:updated');
  socket.emit('subscribe', 'dns:record:deleted');
  socket.emit('subscribe', 'container:started');
  socket.emit('subscribe', 'container:stopped');
  
  // Handle events
  socket.on('event', (eventData) => {
    const { type, data } = eventData;
    
    console.log(`Received event: ${type}`);
    console.log('Event data:', data);
    
    // Handle specific event types
    switch (type) {
      case 'dns:record:created':
        console.log('A new DNS record was created!');
        // Update UI accordingly
        break;
        
      case 'dns:record:deleted':
        console.log('A DNS record was deleted!');
        // Update UI accordingly
        break;
        
      case 'container:started':
        console.log(`Container started: ${data.name || data.id}`);
        // Update UI accordingly
        break;
        
      default:
        // Handle other events
        break;
    }
  });
}

/**
 * Main function
 */
function main() {
  // Connect to WebSocket server
  const socket = connect();
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Disconnecting from WebSocket server...');
    socket.disconnect();
    process.exit();
  });
}

// Run the example
main();

/**
 * React Example (for documentation purposes)
 * 
 * import { useEffect, useState } from 'react';
 * import { io } from 'socket.io-client';
 * 
 * function useWebSocket(token) {
 *   const [socket, setSocket] = useState(null);
 *   const [connected, setConnected] = useState(false);
 *   const [events, setEvents] = useState([]);
 * 
 *   useEffect(() => {
 *     if (!token) return;
 * 
 *     // Create socket
 *     const newSocket = io('http://localhost:3000', {
 *       auth: { token },
 *       reconnection: true
 *     });
 * 
 *     // Connection events
 *     newSocket.on('connect', () => {
 *       setConnected(true);
 *       console.log('WebSocket connected');
 *       
 *       // Subscribe to events
 *       newSocket.emit('subscribe', 'dns:record:created');
 *       newSocket.emit('subscribe', 'dns:record:updated');
 *     });
 * 
 *     newSocket.on('disconnect', () => {
 *       setConnected(false);
 *       console.log('WebSocket disconnected');
 *     });
 * 
 *     // Handle events
 *     newSocket.on('event', (eventData) => {
 *       setEvents(prev => [...prev, eventData]);
 *     });
 * 
 *     setSocket(newSocket);
 * 
 *     // Cleanup
 *     return () => {
 *       newSocket.disconnect();
 *     };
 *   }, [token]);
 * 
 *   return { socket, connected, events };
 * }
 * 
 * // Usage in a component
 * function DnsMonitor({ token }) {
 *   const { connected, events } = useWebSocket(token);
 * 
 *   return (
 *     <div>
 *       <div>Connection status: {connected ? 'Connected' : 'Disconnected'}</div>
 *       <h2>Real-time Events:</h2>
 *       <ul>
 *         {events.map((event, index) => (
 *           <li key={index}>
 *             {event.type}: {JSON.stringify(event.data)}
 *           </li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 */