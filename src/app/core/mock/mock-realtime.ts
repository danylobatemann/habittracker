import type { ClientMessage, ServerEvent } from '../models/realtime.models';
import { CLOSE_UNAUTHORIZED, type RealtimeSocket, type RealtimeTransport } from '../realtime/realtime-transport';
import { mockServer } from './mock-server';

type HabitEvent = Exclude<ServerEvent, { type: 'pong' }>;

const CHANNEL = 'synchabit.mock.realtime';
const SIM_TICK_MS = 5_000;

/**
 * Fake realtime server.
 *
 * • Events published by the mock backend reach sockets in this tab and — via
 *   BroadcastChannel — in every other tab of the browser.
 * • While anyone is subscribed to a shared habit, simulated friends check in
 *   (respecting the same server cooldown rules) and drift online/offline.
 */
class MockRealtimeHub {
  private readonly sockets = new Set<MockSocket>();
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  private simTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.channel?.addEventListener('message', (e: MessageEvent<HabitEvent>) => this.deliver(e.data));
  }

  publish(event: HabitEvent | null): void {
    if (!event) return;
    this.deliver(event);
    this.channel?.postMessage(event);
  }

  attach(socket: MockSocket): void {
    this.sockets.add(socket);
    this.simTimer ??= setInterval(() => this.simulate(), SIM_TICK_MS);
  }

  detach(socket: MockSocket): void {
    this.sockets.delete(socket);
    if (this.sockets.size === 0 && this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  private deliver(event: HabitEvent): void {
    for (const socket of this.sockets) socket.push(event);
  }

  private simulate(): void {
    const topics = new Set<string>();
    for (const socket of this.sockets) for (const t of socket.topics) topics.add(t);

    for (const habitId of topics) {
      const roll = Math.random();
      try {
        if (roll < 0.34) {
          this.publish(mockServer().botCheckIn(habitId));
        } else if (roll < 0.42) {
          const presence = mockServer().botPresence(habitId);
          if (presence) {
            this.publish({
              type: 'member.presence',
              habitId,
              serverTime: new Date(mockServer().now()).toISOString(),
              ...presence,
            });
          }
        }
      } catch {
        /* habit deleted meanwhile */
      }
    }
  }
}

class MockSocket implements RealtimeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: ((code: number, reason: string) => void) | null = null;
  readonly topics = new Set<string>();
  private open = false;
  private closed = false;

  constructor(
    private readonly hub: MockRealtimeHub,
    url: string,
  ) {
    const token = new URL(url).searchParams.get('token') ?? '';
    const latency = 250 + Math.random() * 350;

    setTimeout(() => {
      if (this.closed) return;
      if (!mockServer().verifyAccess(token)) {
        this.finish(CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
      this.open = true;
      this.hub.attach(this);
      this.onopen?.();
    }, latency);
  }

  send(data: string): void {
    if (!this.open) return;
    let message: ClientMessage;
    try {
      message = JSON.parse(data) as ClientMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case 'subscribe':
        this.topics.add(message.habitId);
        break;
      case 'unsubscribe':
        this.topics.delete(message.habitId);
        break;
      case 'ping':
        setTimeout(() => this.emit({ type: 'pong', serverTime: new Date(mockServer().now()).toISOString() }), 40);
        break;
    }
  }

  push(event: HabitEvent): void {
    if (this.open && this.topics.has(event.habitId)) {
      // Simulate network latency so optimistic UI and dedupe are exercised
      setTimeout(() => this.emit(event), 60 + Math.random() * 180);
    }
  }

  close(code = 1000, reason = ''): void {
    this.finish(code, reason);
  }

  private emit(event: ServerEvent): void {
    if (this.open) this.onmessage?.(JSON.stringify(event));
  }

  private finish(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.hub.detach(this);
    setTimeout(() => this.onclose?.(code, reason), 0);
  }
}

let hub: MockRealtimeHub | null = null;
export function mockHub(): MockRealtimeHub {
  return (hub ??= new MockRealtimeHub());
}

export const mockRealtimeTransport: RealtimeTransport = (url) => new MockSocket(mockHub(), url);
