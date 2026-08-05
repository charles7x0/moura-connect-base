'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws';

interface WsMessage {
  type: string;
  payload: any;
}

export function useWebSocket(token: string | null) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[ws] Conectado');
    };

    ws.onmessage = (event) => {
      try {
        const data: WsMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev.slice(-200), data]);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconexão automática em 3s
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, connected, clearMessages };
}
