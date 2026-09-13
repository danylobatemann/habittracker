import { InjectionToken } from '@angular/core';

/** Minimal socket surface the RealtimeService needs — satisfied by WebSocket and the mock hub */
export interface RealtimeSocket {
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeTransport = (url: string) => RealtimeSocket;

/** Close code the server uses for an expired / invalid access token */
export const CLOSE_UNAUTHORIZED = 4401;

export const webSocketTransport: RealtimeTransport = (url) => {
  const ws = new WebSocket(url);
  const socket: RealtimeSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => ws.readyState === WebSocket.OPEN && ws.send(data),
    close: (code, reason) => ws.close(code, reason),
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (e: MessageEvent) => socket.onmessage?.(typeof e.data === 'string' ? e.data : '');
  ws.onclose = (e: CloseEvent) => socket.onclose?.(e.code, e.reason);
  return socket;
};

export const REALTIME_TRANSPORT = new InjectionToken<RealtimeTransport>('REALTIME_TRANSPORT', {
  providedIn: 'root',
  factory: () => webSocketTransport,
});
