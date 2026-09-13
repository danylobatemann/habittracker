import type { IsoDateTime, WithServerTime } from './api.models';
import type { Habit, MemberRole } from './habit.models';

export interface RoomMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarHue: number;
  role: MemberRole;
  joinedAt: IsoDateTime;
  /** Progress in the current period */
  count: number;
  target: number;
  streak: number;
  /** Total check-ins since joining — leaderboard tiebreaker */
  totalCheckIns: number;
  lastCheckInAt: IsoDateTime | null;
  online: boolean;
}

export type ActivityType = 'check_in' | 'completed' | 'joined' | 'left' | 'streak_milestone';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  userId: string;
  displayName: string;
  avatarHue: number;
  createdAt: IsoDateTime;
  /** Type-specific extras, e.g. `{ streak: 7 }` for streak_milestone */
  meta: Record<string, number | string>;
}

export interface HabitRoom extends WithServerTime {
  habit: Habit;
  members: RoomMember[];
  activity: ActivityEvent[];
  /** Team mode: sum of members' counts vs. members × target */
  team: { count: number; target: number };
}

export interface InviteResponse {
  token: string;
  url: string;
  expiresAt: IsoDateTime;
}

export interface InvitePreview {
  token: string;
  habit: Pick<Habit, 'id' | 'title' | 'description' | 'icon' | 'kind' | 'frequency' | 'unit'> & {
    target: number;
    mode: 'team' | 'competitive';
  };
  invitedBy: { displayName: string; avatarHue: number };
  membersCount: number;
  memberPreview: Pick<RoomMember, 'userId' | 'displayName' | 'avatarHue' | 'avatarUrl'>[];
  expiresAt: IsoDateTime;
  alreadyMember: boolean;
}

export interface AcceptInviteResponse {
  habitId: string;
}
