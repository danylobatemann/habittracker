import type { IsoDateTime } from './api.models';

export interface User {
  id: string;
  email: string;
  displayName: string;
  /** Absolute URL or null — the UI falls back to initials on an accent gradient */
  avatarUrl: string | null;
  /** Hue 0–360 used for the generated avatar */
  avatarHue: number;
  timezone: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  createdAt: IsoDateTime;
}

export interface UpdateProfileRequest {
  displayName?: string;
  timezone?: string;
  avatarHue?: number;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface NotificationSettings {
  emailDigest: 'off' | 'daily' | 'weekly';
  pushReminders: boolean;
  reminderTime: string; // "HH:mm"
  friendActivity: boolean;
  streakWarnings: boolean;
}
