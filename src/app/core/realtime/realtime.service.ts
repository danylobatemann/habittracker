import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, filter, firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { TokenStorage } from '../auth/token-storage.service';
import type { ClientMessage, ConnectionState, ServerEvent } from '../models/realtime.models';
import { ServerClock } from '../time/server-clock.service';
import { CLOSE_UNAUTHORIZED, REALTIME_TRANSPORT, type RealtimeSocket } from './realtime-transport';

type HabitEvent = Exclude<ServerEvent, { type: 'pong' }>;

const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 800;
const BACKOFF_MAX_MS = 20_000;
/** Keep the socket around briefly after the last subscriber leaves (route hops) */
const IDLE_DISCONNECT_MS = 8_000;

/**
 * Realtime channel for shared habits.
 *
 * • Lazy & ref-counted: `habitEvents(id)` opens the socket on first use and
 *   sends `subscribe`; the last unsubscribe sends `unsubscribe` and, after a
 *   short idle period, closes the socket.
 * • Resilient: exponential backoff with jitter, resubscribes every topic on
 *   reconnect, heartbeat detects half-open connections, pauses while the
 *   browser is offline.
 * • Authenticated: the access token travels in the URL (browsers can't set
 *   WebSocket headers); an auth close (4401) triggers a token refresh first.
 * • Every event carries `serverTime`, which keeps ServerClock warm.
 *
 * After a reconnect consumers should refetch their snapshot — events missed
 * while offline are not replayed. `reconnected` signals that moment.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly transport = inject(REALTIME_TRANSPORT);
  private readonly tokens = inject(TokenStorage);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(ServerClock);
  private readonly doc = inject(DOCUMENT);

  private socket: RealtimeSocket | null = null;
  private readonly events$ = new Subject<HabitEvent>();
  private readonly topics = new Map<string, number>();
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;
  private hadOpened = false;

  private readonly _state = signal<ConnectionState>('idle');
  private readonly _reconnects = signal(0);

  readonly state = this._state.asReadonly();
  readonly isLive = computed(() => this._state() === 'open');
  /** Increments after every successful *re*connect — refetch snapshots when it changes */
  readonly reconnects = this._reconnects.asReadonly();

  habitEvents(habitId: string): Observable<HabitEvent> {
    return new Observable<HabitEvent>((subscriber) => {
      const sub = this.events$.pipe(filter((e) => e.habitId === habitId)).subscribe(subscriber);
      this.retain(habitId);
      return () => {
        sub.unsubscribe();
        this.release(habitId);
      };
    });
  }

  // --- topics -------------------------------------------------------------

  private retain(habitId: string): void {
    const count = this.topics.get(habitId) ?? 0;
    this.topics.set(habitId, count + 1);
    this.clearIdle();
    if (count === 0) this.send({ type: 'subscribe', habitId });
    this.ensureConnected();
  }

  private release(habitId: string): void {
    const count = (this.topics.get(habitId) ?? 1) - 1;
    if (count > 0) {
      this.topics.set(habitId, count);
      return;
    }
    this.topics.delete(habitId);
    this.send({ type: 'unsubscribe', habitId });
    if (this.topics.size === 0) {
      this.clearIdle();
      this.idleTimer = setTimeout(() => this.disconnect(), IDLE_DISCONNECT_MS);
    }
  }

  // --- connection -----------------------------------------------------------

  private ensureConnected(): void {
    this.listen();
    if (this.socket || this.reconnectTimer) return;
    if (!navigator.onLine) {
      this._state.set('offline');
      return;
    }
    void this.connect();
  }

  private async connect(): Promise<void> {
    this._state.set(this.attempt === 0 ? 'connecting' : 'reconnecting');

    if (this.tokens.isAccessExpiring()) {
      try {
        await firstValueFrom(this.auth.refreshTokens());
      } catch {
        if (!this.auth.isAuthenticated()) return this.disconnect();
        return this.scheduleReconnect();
      }
    }
    if (this.topics.size === 0) return this.disconnect();

    const socket = this.transport(this.buildUrl(this.tokens.access ?? ''));
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      const wasReconnect = this.hadOpened;
      this.attempt = 0;
      this._state.set('open');
      for (const habitId of this.topics.keys()) this.send({ type: 'subscribe', habitId });
      this.startHeartbeat();
      if (wasReconnect) this._reconnects.update((n) => n + 1);
      this.hadOpened = true;
    };

    socket.onmessage = (data) => {
      if (this.socket !== socket) return;
      const event = parse(data);
      if (!event) return;
      this.clock.addPushSample(event.serverTime);
      if (event.type === 'pong') {
        this.clearPong();
        return;
      }
      this.events$.next(event);
    };

    socket.onclose = (code) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      if (this.topics.size === 0) {
        this._state.set('idle');
        return;
      }
      if (code === CLOSE_UNAUTHORIZED) this.tokens.markAccessExpired();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (!navigator.onLine) {
      this._state.set('offline');
      return;
    }
    this._state.set('reconnecting');
    const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    const delay = exp / 2 + Math.random() * (exp / 2);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private disconnect(): void {
    this.clearIdle();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'idle');
    this.attempt = 0;
    this._state.set('idle');
  }

  private send(message: ClientMessage): void {
    if (this._state() === 'open') this.socket?.send(JSON.stringify(message));
  }

  // --- heartbeat --------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
      this.clearPong();
      this.pongTimer = setTimeout(() => this.dropHalfOpen(), PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.clearPong();
  }

  private clearPong(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  /** No pong: the TCP connection is probably dead without a close frame */
  private dropHalfOpen(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    this.stopHeartbeat();
    socket.close(4000, 'heartbeat timeout');
    this.scheduleReconnect();
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  // --- environment ----------------------------------------------------------------

  private listen(): void {
    if (this.listening) return;
    this.listening = true;

    window.addEventListener('offline', () => {
      if (this.topics.size === 0) return;
      this.socket?.close(4001, 'offline');
      this.socket = null;
      this.stopHeartbeat();
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this._state.set('offline');
    });

    window.addEventListener('online', () => {
      if (this.topics.size === 0 || this.socket) return;
      this.attempt = Math.max(this.attempt, 1);
      void this.connect();
    });

    // A socket may have silently died while the tab was frozen in background
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible' && this.topics.size > 0 && this._state() === 'open') {
        this.send({ type: 'ping' });
        this.clearPong();
        this.pongTimer = setTimeout(() => this.dropHalfOpen(), PONG_TIMEOUT_MS);
      }
    });
  }

  private buildUrl(token: string): string {
    const url = new URL(environment.wsUrl, this.doc.baseURI);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    url.searchParams.set('token', token);
    return url.toString();
  }
}

function parse(data: string): ServerEvent | null {
  try {
    const value = JSON.parse(data) as ServerEvent;
    return typeof value?.type === 'string' && typeof value.serverTime === 'string' ? value : null;
  } catch {
    return null;
  }
}
