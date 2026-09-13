import type { IsoDateTime } from './api.models';
import type { Habit } from './habit.models';
import type { ActivityEvent, RoomMember } from './room.models';

/**
 * Realtime protocol (JSON frames over WebSocket).
 *
 * Client → server:
 *   { type: 'subscribe',   habitId }
 *   { type: 'unsubscribe', habitId }
 *   { type: 'ping' }
 *
 * Server → client: `ServerEvent` below. Every event carries the server clock so
 * the client can keep its offset fresh without extra requests.
 */
export type ClientMessage =
  | { type: 'subscribe'; habitId: string }
  | { type: 'unsubscribe'; habitId: string }
  | { type: 'ping' };

interface EventBase {
  habitId: string;
  serverTime: IsoDateTime;
}

export interface MemberCheckedInEvent extends EventBase {
  type: 'member.checked_in';
  member: RoomMember;
  activity: ActivityEvent;
  team: { count: number; target: number };
}

export interface MemberJoinedEvent extends EventBase {
  type: 'member.joined';
  member: RoomMember;
  activity: ActivityEvent;
}

export interface MemberLeftEvent extends EventBase {
  type: 'member.left';
  userId: string;
  activity: ActivityEvent;
}

export interface PresenceEvent extends EventBase {
  type: 'member.presence';
  userId: string;
  online: boolean;
}

export interface HabitUpdatedEvent extends EventBase {
  type: 'habit.updated';
  habit: Habit;
}

export type ServerEvent =
  | MemberCheckedInEvent
  | MemberJoinedEvent
  | MemberLeftEvent
  | PresenceEvent
  | HabitUpdatedEvent
  | { type: 'pong'; serverTime: IsoDateTime };

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'offline';
