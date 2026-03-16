/**
 * Socket.IO connection and optional logs subscription.
 * Use in App or any component that needs real-time log stream.
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.DEV ? (typeof window !== 'undefined' ? window.location.origin : '') : '';

export function useSocket() {
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    return { socketRef, connected };
}

/**
 * Socket plus logs state: subscribes to 'log' events and returns [logs, setLogs, clearLogs].
 * Pass initialLogs from GET /api/logs if desired.
 */
export function useSocketLogs(initialLogs = []) {
    const [logs, setLogs] = useState(initialLogs);
    const socketRef = useRef(null);

    useEffect(() => {
        const socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        socket.on('log', (message) => {
            setLogs((prev) => [...prev, { id: Date.now(), time: new Date().toISOString(), message: String(message) }]);
        });
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const clearLogs = () => setLogs([]);
    return [logs, setLogs, clearLogs];
}
