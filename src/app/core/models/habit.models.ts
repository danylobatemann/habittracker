import type { IsoDate, IsoDateTime, WithServerTime } from './api.models';

export type HabitKind =
  /** Done / not done once per period ("Morning run") */
  | 'binary'
  /** Several check-ins per period ("Drink 3 glasses of water") — cooldown applies between them */
  | 'cumulative';

export type HabitIcon =
  | 'run' | 'water' | 'book' | 'meditate' | 'code' | 'sleep' | 'dumbbell' | 'leaf' | 'mountain';

export type HabitFrequency = 'daily' | 'weekly';

export type MemberRole = 'owner' | 'member';

export interface HabitProgress {
  /** Period the counters belong to (user's timezone) */
  periodStart: IsoDate;
  count: number;
  target: number;
  completedAt: IsoDateTime | null;
}

export interface HabitStreak {
  current: number;
  best: number;
  /** Streak survives until this moment without a completion */
  expiresAt: IsoDateTime | null;
}

export interface Habit {
  id: string;
  title: string;
  description: string;
  icon: HabitIcon;
  kind: HabitKind;
  frequency: HabitFrequency;
  /** e.g. "glasses", "pages" — only for cumulative habits */
  unit: string | null;
  /** Minimum gap between two check-ins, enforced by the server */
  cooldownSeconds: number;
  progress: HabitProgress;
  streak: HabitStreak;
  lastCheckInAt: IsoDateTime | null;
  /** Computed by the server; null when no cooldown is running */
  cooldownEndsAt: IsoDateTime | null;
  xpPerCheckIn: number;
  shared: {
    enabled: boolean;
    mode: 'team' | 'competitive';
    membersCount: number;
    role: MemberRole;
  };
  createdAt: IsoDateTime;
}

export interface HabitListResponse extends WithServerTime {
  items: Habit[];
}

export interface CreateHabitRequest {
  title: string;
  description?: string;
  icon: HabitIcon;
  kind: HabitKind;
  frequency: HabitFrequency;
  target: number;
  unit?: string | null;
  cooldownSeconds: number;
  shared?: { mode: 'team' | 'competitive' } | null;
}

export type UpdateHabitRequest = Partial<Omit<CreateHabitRequest, 'kind'>>;

export interface CheckIn {
  id: string;
  habitId: string;
  userId: string;
  createdAt: IsoDateTime;
  xpAwarded: number;
}

export interface CheckInResponse extends WithServerTime {
  habit: Habit;
  checkIn: CheckIn;
  /** Set when this check-in completed the period target */
  completed: boolean;
  levelUp: { level: number } | null;
}

/** Details payload of a COOLDOWN_ACTIVE (HTTP 429) error */
export interface CooldownErrorDetails {
  cooldownEndsAt: IsoDateTime;
  serverTime: IsoDateTime;
}
