import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Game } from '@workspace/api-client-react';

export function useGameWebSocket(roomCode: string | undefined, playerId: string | null) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!roomCode || !playerId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?roomCode=${roomCode}&playerId=${playerId}`;
    
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    
    const connect = () => {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Assuming the server broadcasts the full Game object on any update
          if (data && data.roomCode) {
            queryClient.setQueryData([`/api/games/${roomCode}`], data as Game);
          }
        } catch (e) {
          console.error('[WS] Failed to parse message', e);
        }
      };

      wsRef.current.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);
        // Basic reconnect logic
        reconnectTimeout = setTimeout(connect, 3000);
      };
      
      wsRef.current.onerror = (e) => {
        console.error('[WS] Error', e);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomCode, playerId, queryClient]);

  return { connected };
}
