/* eslint-disable max-lines */
import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from '../models/api.models';
import type { AuthResponse, AuthTokens } from '../models/auth.models';
import type {
  CheckInResponse,
  CreateHabitRequest,
  Habit,
  HabitFrequency,
  HabitIcon,
  HabitKind,
  HabitListResponse,
  MemberRole,
} from '../models/habit.models';
import type { MemberCheckedInEvent, MemberJoinedEvent, MemberLeftEvent } from '../models/realtime.models';
import type {
  ActivityEvent,
  ActivityType,
  HabitRoom,
  InvitePreview,
  InviteResponse,
  RoomMember,
} from '../models/room.models';
import type { NotificationSettings, User } from '../models/user.models';
import { monotonic } from '../time/server-clock.service';
import { periodKey, periodStartMs, nextPeriod, prevPeriod } from './mock-time';

/**
 * In-browser fake backend (development / demo only — excluded from the
 * production bundle through a file replacement).
 *
 * It behaves like the real API contract: validation with field errors, JWT-ish
 * access tokens with a short TTL (so the refresh flow actually runs), refresh
 * token rotation, server-enforced cooldowns (429 COOLDOWN_ACTIVE), idempotent
 * check-ins, invites and rooms. State persists in localStorage and is shared
 * by all tabs of the browser — sign in as two users in two tabs (one with
 * "Remember me" off) to watch realtime sync.
 *
 * NOTE: passwords are hashed with a toy hash. This is a mock, not security.
 */

const DB_KEY = 'synchabit.mockdb.v1';
export const ACCESS_TTL_S = 5 * 60;
const REFRESH_TTL_MS = 30 * 86_400_000;
const INVITE_TTL_MS = 7 * 86_400_000;
const ONLINE_WINDOW_MS = 90_000;

export const DEMO_EMAIL = 'demo@synchabit.app';
export const DEMO_PASSWORD = 'summit2026';
export const DEMO_INVITE_TOKEN = 'ember-peak';

// --- storage shape -------------------------------------------------------------

interface DbUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  avatarHue: number;
  timezone: string;
  totalXp: number;
  createdAt: number;
  bot: boolean;
  lastSeen: number;
}

interface DbHabit {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  icon: HabitIcon;
  kind: HabitKind;
  frequency: HabitFrequency;
  target: number;
  unit: string | null;
  cooldownSeconds: number;
  xpPerCheckIn: number;
  sharedMode: 'team' | 'competitive' | null;
  createdAt: number;
}

interface DbMember {
  habitId: string;
  userId: string;
  role: MemberRole;
  joinedAt: number;
}

interface DbCheckIn {
  id: string;
  habitId: string;
  userId: string;
  createdAt: number;
  xp: number;
}

interface DbActivity {
  id: string;
  habitId: string;
  type: ActivityType;
  userId: string;
  createdAt: number;
  meta: Record<string, number | string>;
}

interface DbInvite {
  token: string;
  habitId: string;
  createdBy: string;
  expiresAt: number;
}

interface Db {
  users: DbUser[];
  habits: DbHabit[];
  members: DbMember[];
  checkIns: DbCheckIn[];
  activity: DbActivity[];
  invites: DbInvite[];
  notifications: Record<string, NotificationSettings>;
  refreshTokens: Record<string, { userId: string; expiresAt: number }>;
  /** `${userId}:${idempotencyKey}` → checkInId */
  idempotency: Record<string, string>;
}

export class MockHttpError {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {}
}

function fail(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: { fieldErrors?: ApiFieldError[]; details?: Record<string, unknown> } = {},
): never {
  throw new MockHttpError(status, { error: { code, message, ...extra } });
}

// --- server --------------------------------------------------------------------------

export class MockServer {
  /** Server clock. Monotonic, so it can't be moved by changing the device time mid-session. */
  now(): number {
    return Math.round(monotonic());
  }

  iso(ms: number): string {
    return new Date(ms).toISOString();
  }

  // ---- persistence

  private read(): Db {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw) as Db;
    } catch {
      /* corrupted — reseed */
    }
    const db = this.seed();
    this.write(db);
    return db;
  }

  private write(db: Db): void {
    // Keep the log bounded
    if (db.checkIns.length > 6000) db.checkIns = db.checkIns.slice(-5000);
    if (db.activity.length > 1500) db.activity = db.activity.slice(-1000);
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  /** Read-modify-write in one synchronous step (safe across tabs: JS is single-threaded per tab and storage writes are atomic) */
  private tx<T>(fn: (db: Db) => T): T {
    const db = this.read();
    const result = fn(db);
    this.write(db);
    return result;
  }

  reset(): void {
    localStorage.removeItem(DB_KEY);
  }

  // ---- auth

  register(body: { displayName?: string; email?: string; password?: string; timezone?: string }): AuthResponse {
    const fieldErrors: ApiFieldError[] = [];
    const displayName = (body.displayName ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (displayName.length < 2 || displayName.length > 32) {
      fieldErrors.push({ field: 'displayName', message: 'Display name must be 2–32 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      fieldErrors.push({ field: 'email', message: 'Enter a valid email address.' });
    }
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      fieldErrors.push({ field: 'password', message: 'Use at least 8 characters with a letter and a number.' });
    }
    if (fieldErrors.length) fail(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fieldErrors });

    return this.tx((db) => {
      if (db.users.some((u) => u.email === email)) {
        fail(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
          fieldErrors: [{ field: 'email', message: 'This email is already registered. Try signing in.' }],
        });
      }
      const now = this.now();
      const user: DbUser = {
        id: uid('u'),
        email,
        displayName,
        passwordHash: toyHash(password),
        avatarHue: Math.floor(Math.random() * 360),
        timezone: validTz(body.timezone),
        totalXp: 0,
        createdAt: now,
        bot: false,
        lastSeen: now,
      };
      db.users.push(user);
      seedStarterHabits(db, user, now, false);
      return { user: this.userView(db, user), tokens: this.issueTokens(db, user.id) };
    });
  }

  login(body: { email?: string; password?: string }): AuthResponse {
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!email || !password) {
      fail(422, 'VALIDATION_FAILED', 'Email and password are required.', {
        fieldErrors: [
          ...(!email ? [{ field: 'email', message: 'Email is required.' }] : []),
          ...(!password ? [{ field: 'password', message: 'Password is required.' }] : []),
        ],
      });
    }
    return this.tx((db) => {
      const user = db.users.find((u) => u.email === email && !u.bot);
      if (!user || user.passwordHash !== toyHash(password)) {
        fail(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
      }
      user.lastSeen = this.now();
      return { user: this.userView(db, user), tokens: this.issueTokens(db, user.id) };
    });
  }

  refresh(refreshToken: string | undefined): AuthTokens {
    return this.tx((db) => {
      const record = refreshToken ? db.refreshTokens[refreshToken] : undefined;
      if (!refreshToken || !record || record.expiresAt < this.now()) {
        fail(401, 'TOKEN_INVALID', 'Your session has ended. Please sign in again.');
      }
      // Rotation: a refresh token is single-use
      delete db.refreshTokens[refreshToken];
      return this.issueTokens(db, record.userId);
    });
  }

  logout(refreshToken: string | undefined): void {
    if (!refreshToken) return;
    this.tx((db) => delete db.refreshTokens[refreshToken]);
  }

  /** Validates `Bearer` access token; returns the user id */
  authenticate(authorization: string | null): string {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const claims = token ? decodeAccess(token) : null;
    if (!claims) fail(401, 'TOKEN_INVALID', 'Please sign in.');
    if (claims.exp <= this.now()) fail(401, 'TOKEN_EXPIRED', 'Access token expired.');
    return claims.sub;
  }

  /** Same check for the realtime handshake, without throwing */
  verifyAccess(token: string): string | null {
    const claims = decodeAccess(token);
    return claims && claims.exp > this.now() ? claims.sub : null;
  }

  private issueTokens(db: Db, userId: string): AuthTokens {
    const now = this.now();
    const refreshToken = `rt_${randomId(32)}`;
    db.refreshTokens[refreshToken] = { userId, expiresAt: now + REFRESH_TTL_MS };
    // prune expired
    for (const [key, value] of Object.entries(db.refreshTokens)) if (value.expiresAt < now) delete db.refreshTokens[key];
    return {
      accessToken: encodeAccess({ sub: userId, exp: now + ACCESS_TTL_S * 1000, jti: randomId(8) }),
      refreshToken,
      expiresIn: ACCESS_TTL_S,
      tokenType: 'Bearer',
    };
  }

  // ---- profile

  me(userId: string): User {
    return this.tx((db) => {
      const user = this.user(db, userId);
      user.lastSeen = this.now();
      return this.userView(db, user);
    });
  }

  updateProfile(userId: string, body: { displayName?: string; timezone?: string; avatarHue?: number }): User {
    return this.tx((db) => {
      const user = this.user(db, userId);
      if (body.displayName !== undefined) {
        const name = body.displayName.trim();
        if (name.length < 2 || name.length > 32) {
          fail(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', {
            fieldErrors: [{ field: 'displayName', message: 'Display name must be 2–32 characters.' }],
          });
        }
        user.displayName = name;
      }
      if (body.timezone !== undefined) user.timezone = validTz(body.timezone);
      if (body.avatarHue !== undefined) user.avatarHue = Math.round(Math.abs(body.avatarHue)) % 360;
      return this.userView(db, user);
    });
  }

  changePassword(userId: string, body: { currentPassword?: string; newPassword?: string }): void {
    this.tx((db) => {
      const user = this.user(db, userId);
      if (user.passwordHash !== toyHash(body.currentPassword ?? '')) {
        fail(422, 'VALIDATION_FAILED', 'Current password is incorrect.', {
          fieldErrors: [{ field: 'currentPassword', message: 'That’s not your current password.' }],
        });
      }
      const next = body.newPassword ?? '';
      if (next.length < 8 || !/[a-z]/i.test(next) || !/\d/.test(next)) {
        fail(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', {
          fieldErrors: [{ field: 'newPassword', message: 'Use at least 8 characters with a letter and a number.' }],
        });
      }
      if (toyHash(next) === user.passwordHash) {
        fail(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', {
          fieldErrors: [{ field: 'newPassword', message: 'The new password must differ from the current one.' }],
        });
      }
      user.passwordHash = toyHash(next);
    });
  }

  notifications(userId: string): NotificationSettings {
    return this.tx((db) => (db.notifications[userId] ??= defaultNotifications()));
  }

  updateNotifications(userId: string, body: Partial<NotificationSettings>): NotificationSettings {
    return this.tx((db) => {
      const current = (db.notifications[userId] ??= defaultNotifications());
      const next: NotificationSettings = {
        emailDigest: ['off', 'daily', 'weekly'].includes(body.emailDigest ?? '') ? body.emailDigest! : current.emailDigest,
        pushReminders: typeof body.pushReminders === 'boolean' ? body.pushReminders : current.pushReminders,
        reminderTime: /^\d{2}:\d{2}$/.test(body.reminderTime ?? '') ? body.reminderTime! : current.reminderTime,
        friendActivity: typeof body.friendActivity === 'boolean' ? body.friendActivity : current.friendActivity,
        streakWarnings: typeof body.streakWarnings === 'boolean' ? body.streakWarnings : current.streakWarnings,
      };
      db.notifications[userId] = next;
      return next;
    });
  }

  // ---- habits

  listHabits(userId: string): HabitListResponse {
    return this.tx((db) => {
      const user = this.user(db, userId);
      user.lastSeen = this.now();
      const ids = new Set(db.members.filter((m) => m.userId === userId).map((m) => m.habitId));
      const items = db.habits
        .filter((h) => ids.has(h.id))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((h) => this.habitView(db, h, user));
      return { items, serverTime: this.iso(this.now()) };
    });
  }

  createHabit(userId: string, body: Partial<CreateHabitRequest>): Habit {
    const fieldErrors: ApiFieldError[] = [];
    const title = (body.title ?? '').trim();
    const kind: HabitKind = body.kind === 'cumulative' ? 'cumulative' : 'binary';
    const target = kind === 'binary' ? 1 : Math.round(Number(body.target));
    const cooldownSeconds = kind === 'binary' ? 0 : Math.round(Number(body.cooldownSeconds));

    if (title.length < 2 || title.length > 60) fieldErrors.push({ field: 'title', message: 'Title must be 2–60 characters.' });
    if (kind === 'cumulative' && !(target >= 2 && target <= 50)) {
      fieldErrors.push({ field: 'target', message: 'Target must be between 2 and 50.' });
    }
    if (kind === 'cumulative' && !(cooldownSeconds >= 0 && cooldownSeconds <= 86_400)) {
      fieldErrors.push({ field: 'cooldownSeconds', message: 'Cooldown must be between 0 and 24 hours.' });
    }
    if (fieldErrors.length) fail(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fieldErrors });

    return this.tx((db) => {
      const user = this.user(db, userId);
      const now = this.now();
      const habit: DbHabit = {
        id: uid('h'),
        ownerId: userId,
        title,
        description: (body.description ?? '').trim().slice(0, 200),
        icon: body.icon ?? 'leaf',
        kind,
        frequency: body.frequency === 'weekly' ? 'weekly' : 'daily',
        target,
        unit: kind === 'cumulative' ? (body.unit ?? '').trim().slice(0, 20) || null : null,
        cooldownSeconds,
        xpPerCheckIn: kind === 'binary' ? 25 : 10,
        sharedMode: body.shared?.mode ?? null,
        createdAt: now,
      };
      db.habits.push(habit);
      db.members.push({ habitId: habit.id, userId, role: 'owner', joinedAt: now });
      return this.habitView(db, habit, user);
    });
  }

  deleteHabit(userId: string, habitId: string): MemberLeftEvent | null {
    return this.tx((db) => {
      const habit = this.habit(db, habitId);
      const membership = this.membership(db, habitId, userId);
      if (membership.role === 'owner') {
        db.habits = db.habits.filter((h) => h.id !== habitId);
        db.members = db.members.filter((m) => m.habitId !== habitId);
        db.invites = db.invites.filter((i) => i.habitId !== habitId);
        return null;
      }
      return this.removeMember(db, habit, userId);
    });
  }

  leaveRoom(userId: string, habitId: string): MemberLeftEvent {
    return this.tx((db) => {
      const habit = this.habit(db, habitId);
      const membership = this.membership(db, habitId, userId);
      if (membership.role === 'owner') fail(403, 'FORBIDDEN', 'Owners can’t leave their own habit — delete it instead.');
      return this.removeMember(db, habit, userId);
    });
  }

  checkIn(
    userId: string,
    habitId: string,
    idempotencyKey: string | null,
  ): { response: CheckInResponse; event: MemberCheckedInEvent | null } {
    return this.tx((db) => {
      const user = this.user(db, userId);
      const habit = this.habit(db, habitId);
      this.membership(db, habitId, userId);
      const now = this.now();
      user.lastSeen = now;

      // Idempotent replay: same key → same result, no second check-in
      const idemKey = idempotencyKey ? `${userId}:${idempotencyKey}` : null;
      const existingId = idemKey ? db.idempotency[idemKey] : undefined;
      const existing = existingId ? db.checkIns.find((c) => c.id === existingId) : undefined;
      if (existing) {
        const view = this.habitView(db, habit, user);
        return {
          response: {
            habit: view,
            checkIn: { id: existing.id, habitId, userId, createdAt: this.iso(existing.createdAt), xpAwarded: existing.xp },
            completed: view.progress.completedAt !== null,
            levelUp: null,
            serverTime: this.iso(now),
          },
          event: null,
        };
      }

      const before = this.habitView(db, habit, user);
      if (before.progress.count >= before.progress.target) {
        fail(409, 'DAILY_TARGET_REACHED', `You’ve already hit today’s target for “${habit.title}”.`);
      }
      if (before.cooldownEndsAt) {
        fail(429, 'COOLDOWN_ACTIVE', 'Easy there — this habit is cooling down.', {
          details: { cooldownEndsAt: before.cooldownEndsAt, serverTime: this.iso(now) },
        });
      }

      return this.recordCheckIn(db, habit, user, now, idemKey);
    });
  }

  /** Used by the realtime simulator: a bot member checks in if the server rules allow it */
  botCheckIn(habitId: string): MemberCheckedInEvent | null {
    return this.tx((db) => {
      const habit = db.habits.find((h) => h.id === habitId);
      if (!habit?.sharedMode) return null;
      const now = this.now();
      const candidates = db.members
        .filter((m) => m.habitId === habitId)
        .map((m) => db.users.find((u) => u.id === m.userId))
        .filter((u): u is DbUser => !!u?.bot)
        .filter((bot) => {
          const view = this.habitView(db, habit, bot);
          return view.progress.count < view.progress.target && !view.cooldownEndsAt;
        });
      if (candidates.length === 0) return null;
      const bot = candidates[Math.floor(Math.random() * candidates.length)];
      return this.recordCheckIn(db, habit, bot, now, null).event;
    });
  }

  /** Bots drifting online/offline — returns the new state */
  botPresence(habitId: string): { userId: string; online: boolean } | null {
    return this.tx((db) => {
      const bots = db.members
        .filter((m) => m.habitId === habitId)
        .map((m) => db.users.find((u) => u.id === m.userId))
        .filter((u): u is DbUser => !!u?.bot);
      if (bots.length === 0) return null;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const online = !this.isOnline(bot);
      bot.lastSeen = online ? this.now() : 0;
      return { userId: bot.id, online };
    });
  }

  private recordCheckIn(
    db: Db,
    habit: DbHabit,
    user: DbUser,
    now: number,
    idemKey: string | null,
  ): { response: CheckInResponse; event: MemberCheckedInEvent | null } {
    const before = this.habitView(db, habit, user);
    const willComplete = before.progress.count + 1 >= before.progress.target;
    const xp = habit.xpPerCheckIn + (willComplete ? habit.xpPerCheckIn : 0);
    const levelBefore = levelFor(user.totalXp).level;

    const checkIn: DbCheckIn = { id: uid('c'), habitId: habit.id, userId: user.id, createdAt: now, xp };
    db.checkIns.push(checkIn);
    if (idemKey) db.idempotency[idemKey] = checkIn.id;
    user.totalXp += xp;
    user.lastSeen = now;

    const after = this.habitView(db, habit, user);
    const activity = this.addActivity(db, habit.id, willComplete ? 'completed' : 'check_in', user.id, now, {
      count: after.progress.count,
      target: after.progress.target,
    });
    if (willComplete && after.streak.current > 0 && after.streak.current % 5 === 0) {
      this.addActivity(db, habit.id, 'streak_milestone', user.id, now + 1, { streak: after.streak.current });
    }
    const levelAfter = levelFor(user.totalXp).level;

    const event: MemberCheckedInEvent | null = habit.sharedMode
      ? {
          type: 'member.checked_in',
          habitId: habit.id,
          serverTime: this.iso(now),
          member: this.memberView(db, habit, user.id),
          activity: this.activityView(db, activity),
          team: this.teamProgress(db, habit),
        }
      : null;

    return {
      response: {
        habit: after,
        checkIn: { id: checkIn.id, habitId: habit.id, userId: user.id, createdAt: this.iso(now), xpAwarded: xp },
        completed: willComplete,
        levelUp: levelAfter > levelBefore ? { level: levelAfter } : null,
        serverTime: this.iso(now),
      },
      event,
    };
  }

  // ---- rooms & invites

  room(userId: string, habitId: string): HabitRoom {
    return this.tx((db) => {
      const user = this.user(db, userId);
      const habit = this.habit(db, habitId);
      this.membership(db, habitId, userId);
      user.lastSeen = this.now();
      return {
        habit: this.habitView(db, habit, user),
        members: db.members.filter((m) => m.habitId === habitId).map((m) => this.memberView(db, habit, m.userId)),
        activity: db.activity
          .filter((a) => a.habitId === habitId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 30)
          .map((a) => this.activityView(db, a)),
        team: this.teamProgress(db, habit),
        serverTime: this.iso(this.now()),
      };
    });
  }

  createInvite(userId: string, habitId: string, origin: string): InviteResponse {
    return this.tx((db) => {
      const habit = this.habit(db, habitId);
      this.membership(db, habitId, userId);
      habit.sharedMode ??= 'team';
      const now = this.now();
      let invite = db.invites.find((i) => i.habitId === habitId && i.createdBy === userId && i.expiresAt - now > 86_400_000);
      if (!invite) {
        invite = { token: randomId(10), habitId, createdBy: userId, expiresAt: now + INVITE_TTL_MS };
        db.invites.push(invite);
      }
      return { token: invite.token, url: `${origin}/invite/${invite.token}`, expiresAt: this.iso(invite.expiresAt) };
    });
  }

  previewInvite(userId: string, token: string): InvitePreview {
    return this.tx((db) => {
      const invite = this.invite(db, token);
      const habit = this.habit(db, invite.habitId);
      const inviter = db.users.find((u) => u.id === invite.createdBy);
      const members = db.members.filter((m) => m.habitId === habit.id);
      return {
        token,
        habit: {
          id: habit.id,
          title: habit.title,
          description: habit.description,
          icon: habit.icon,
          kind: habit.kind,
          frequency: habit.frequency,
          unit: habit.unit,
          target: habit.target,
          mode: habit.sharedMode ?? 'team',
        },
        invitedBy: { displayName: inviter?.displayName ?? 'A friend', avatarHue: inviter?.avatarHue ?? 24 },
        membersCount: members.length,
        memberPreview: members.slice(0, 5).map((m) => {
          const u = this.user(db, m.userId);
          return { userId: u.id, displayName: u.displayName, avatarHue: u.avatarHue, avatarUrl: null };
        }),
        expiresAt: this.iso(invite.expiresAt),
        alreadyMember: members.some((m) => m.userId === userId),
      };
    });
  }

  acceptInvite(userId: string, token: string): { habitId: string; event: MemberJoinedEvent | null } {
    return this.tx((db) => {
      const invite = this.invite(db, token);
      const habit = this.habit(db, invite.habitId);
      if (db.members.some((m) => m.habitId === habit.id && m.userId === userId)) {
        return { habitId: habit.id, event: null };
      }
      const now = this.now();
      habit.sharedMode ??= 'team';
      db.members.push({ habitId: habit.id, userId, role: 'member', joinedAt: now });
      const activity = this.addActivity(db, habit.id, 'joined', userId, now, {});
      return {
        habitId: habit.id,
        event: {
          type: 'member.joined',
          habitId: habit.id,
          serverTime: this.iso(now),
          member: this.memberView(db, habit, userId),
          activity: this.activityView(db, activity),
        },
      };
    });
  }

  // ---- views

  private userView(_db: Db, user: DbUser): User {
    const { level, xp, xpToNextLevel } = levelFor(user.totalXp);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: null,
      avatarHue: user.avatarHue,
      timezone: user.timezone,
      level,
      xp,
      xpToNextLevel,
      createdAt: this.iso(user.createdAt),
    };
  }

  private habitView(db: Db, habit: DbHabit, viewer: DbUser): Habit {
    const now = this.now();
    const tz = viewer.timezone;
    const mine = db.checkIns.filter((c) => c.habitId === habit.id && c.userId === viewer.id);
    const current = periodKey(now, habit.frequency, tz);
    const inPeriod = mine.filter((c) => periodKey(c.createdAt, habit.frequency, tz) === current);
    const count = Math.min(inPeriod.length, habit.target);
    const last = mine.reduce<DbCheckIn | null>((acc, c) => (!acc || c.createdAt > acc.createdAt ? c : acc), null);
    const completedAt = count >= habit.target ? inPeriod[habit.target - 1]?.createdAt ?? null : null;

    const cooldownEnd = last ? last.createdAt + habit.cooldownSeconds * 1000 : 0;
    const cooldownEndsAt =
      habit.cooldownSeconds > 0 && count < habit.target && cooldownEnd > now ? this.iso(cooldownEnd) : null;

    const members = db.members.filter((m) => m.habitId === habit.id);
    const role = members.find((m) => m.userId === viewer.id)?.role ?? 'member';

    return {
      id: habit.id,
      title: habit.title,
      description: habit.description,
      icon: habit.icon,
      kind: habit.kind,
      frequency: habit.frequency,
      unit: habit.unit,
      cooldownSeconds: habit.cooldownSeconds,
      progress: {
        periodStart: current,
        count,
        target: habit.target,
        completedAt: completedAt ? this.iso(completedAt) : null,
      },
      streak: this.streak(mine, habit, tz, now),
      lastCheckInAt: last ? this.iso(last.createdAt) : null,
      cooldownEndsAt,
      xpPerCheckIn: habit.xpPerCheckIn,
      shared: {
        enabled: habit.sharedMode !== null,
        mode: habit.sharedMode ?? 'team',
        membersCount: members.length,
        role,
      },
      createdAt: this.iso(habit.createdAt),
    };
  }

  private streak(checkIns: DbCheckIn[], habit: DbHabit, tz: string, now: number): Habit['streak'] {
    const counts = new Map<string, number>();
    for (const c of checkIns) {
      const key = periodKey(c.createdAt, habit.frequency, tz);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const done = new Set([...counts].filter(([, n]) => n >= habit.target).map(([k]) => k));
    const current = periodKey(now, habit.frequency, tz);

    let cursor = done.has(current) ? current : prevPeriod(current, habit.frequency);
    let run = 0;
    while (done.has(cursor)) {
      run++;
      cursor = prevPeriod(cursor, habit.frequency);
    }

    let best = 0;
    for (const key of done) {
      if (done.has(prevPeriod(key, habit.frequency))) continue; // not a run start
      let len = 0;
      let k = key;
      while (done.has(k)) {
        len++;
        k = nextPeriod(k, habit.frequency);
      }
      best = Math.max(best, len);
    }

    let expiresAt: string | null = null;
    if (run > 0) {
      // Streak survives until the end of the period after the last completed one
      const lastDone = done.has(current) ? current : prevPeriod(current, habit.frequency);
      const deadline = nextPeriod(nextPeriod(lastDone, habit.frequency), habit.frequency);
      expiresAt = this.iso(periodStartMs(deadline, tz, now));
    }
    return { current: run, best: Math.max(best, run), expiresAt };
  }

  private memberView(db: Db, habit: DbHabit, userId: string): RoomMember {
    const user = this.user(db, userId);
    const membership = db.members.find((m) => m.habitId === habit.id && m.userId === userId);
    const view = this.habitView(db, habit, user);
    return {
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: null,
      avatarHue: user.avatarHue,
      role: membership?.role ?? 'member',
      joinedAt: this.iso(membership?.joinedAt ?? habit.createdAt),
      count: view.progress.count,
      target: view.progress.target,
      streak: view.streak.current,
      totalCheckIns: db.checkIns.filter((c) => c.habitId === habit.id && c.userId === userId).length,
      lastCheckInAt: view.lastCheckInAt,
      online: this.isOnline(user),
    };
  }

  private activityView(db: Db, a: DbActivity): ActivityEvent {
    const user = db.users.find((u) => u.id === a.userId);
    return {
      id: a.id,
      type: a.type,
      userId: a.userId,
      displayName: user?.displayName ?? 'Someone',
      avatarHue: user?.avatarHue ?? 0,
      createdAt: this.iso(a.createdAt),
      meta: a.meta,
    };
  }

  private teamProgress(db: Db, habit: DbHabit): { count: number; target: number } {
    const members = db.members.filter((m) => m.habitId === habit.id);
    const count = members.reduce((sum, m) => sum + this.habitView(db, habit, this.user(db, m.userId)).progress.count, 0);
    return { count, target: members.length * habit.target };
  }

  private addActivity(
    db: Db,
    habitId: string,
    type: ActivityType,
    userId: string,
    createdAt: number,
    meta: Record<string, number | string>,
  ): DbActivity {
    const activity: DbActivity = { id: uid('a'), habitId, type, userId, createdAt, meta };
    db.activity.push(activity);
    return activity;
  }

  private removeMember(db: Db, habit: DbHabit, userId: string): MemberLeftEvent {
    db.members = db.members.filter((m) => !(m.habitId === habit.id && m.userId === userId));
    const now = this.now();
    const activity = this.addActivity(db, habit.id, 'left', userId, now, {});
    return {
      type: 'member.left',
      habitId: habit.id,
      serverTime: this.iso(now),
      userId,
      activity: this.activityView(db, activity),
    };
  }

  private isOnline(user: DbUser): boolean {
    return this.now() - user.lastSeen < ONLINE_WINDOW_MS;
  }

  // ---- lookups

  private user(db: Db, id: string): DbUser {
    return db.users.find((u) => u.id === id) ?? fail(401, 'TOKEN_INVALID', 'Account not found. Please sign in again.');
  }

  private habit(db: Db, id: string): DbHabit {
    return db.habits.find((h) => h.id === id) ?? fail(404, 'NOT_FOUND', 'This habit doesn’t exist anymore.');
  }

  private membership(db: Db, habitId: string, userId: string): DbMember {
    return (
      db.members.find((m) => m.habitId === habitId && m.userId === userId) ??
      fail(403, 'FORBIDDEN', 'You’re not a member of this habit.')
    );
  }

  private invite(db: Db, token: string): DbInvite {
    const invite = db.invites.find((i) => i.token === token) ?? fail(404, 'NOT_FOUND', 'This invite link is invalid.');
    if (invite.expiresAt < this.now()) fail(410, 'INVITE_EXPIRED', 'This invite link has expired. Ask for a new one.');
    return invite;
  }

  // ---- seed

  private seed(): Db {
    const now = this.now();
    const db: Db = {
      users: [],
      habits: [],
      members: [],
      checkIns: [],
      activity: [],
      invites: [],
      notifications: {},
      refreshTokens: {},
      idempotency: {},
    };
    const tz = validTz(Intl.DateTimeFormat().resolvedOptions().timeZone);

    for (const [id, displayName, avatarHue] of BOTS) {
      db.users.push({
        id,
        email: `${id}@bots.synchabit.app`,
        displayName,
        passwordHash: '',
        avatarHue,
        timezone: tz,
        totalXp: 400 + Math.floor(Math.random() * 2400),
        createdAt: now - 90 * 86_400_000,
        bot: true,
        lastSeen: Math.random() < 0.6 ? now : 0,
      });
    }

    const demo: DbUser = {
      id: 'u_demo',
      email: DEMO_EMAIL,
      displayName: 'Alex Summit',
      passwordHash: toyHash(DEMO_PASSWORD),
      avatarHue: 24,
      timezone: tz,
      totalXp: 0,
      createdAt: now - 40 * 86_400_000,
      bot: false,
      lastSeen: now,
    };
    db.users.push(demo);
    seedStarterHabits(db, demo, now, true);

    // A shared habit the demo user is *not* in — reachable through the demo invite link
    const cold = addHabit(db, {
      ownerId: 'u_maya',
      title: 'Cold shower club',
      description: '60 seconds of cold water. Every morning. No excuses.',
      icon: 'meditate',
      kind: 'binary',
      frequency: 'daily',
      target: 1,
      unit: null,
      cooldownSeconds: 0,
      sharedMode: 'competitive',
      createdAt: now - 20 * 86_400_000,
    });
    joinAll(db, cold, ['u_maya', 'u_kenji', 'u_omar'], now);
    seedHistory(db, cold, ['u_maya', 'u_kenji', 'u_omar'], now, 0.85);
    db.invites.push({ token: DEMO_INVITE_TOKEN, habitId: cold.id, createdBy: 'u_maya', expiresAt: now + 365 * 86_400_000 });

    return db;
  }
}

// --- seed helpers ---------------------------------------------------------------------------

const BOTS: [string, string, number][] = [
  ['u_maya', 'Maya Chen', 12],
  ['u_kenji', 'Kenji Sato', 205],
  ['u_lena', 'Lena Park', 318],
  ['u_omar', 'Omar Haddad', 150],
  ['u_sasha', 'Sasha Ivanova', 42],
];

type NewHabit = Omit<DbHabit, 'id' | 'xpPerCheckIn'>;

function addHabit(db: Db, input: NewHabit): DbHabit {
  const habit: DbHabit = { ...input, id: uid('h'), xpPerCheckIn: input.kind === 'binary' ? 25 : 10 };
  db.habits.push(habit);
  return habit;
}

function joinAll(db: Db, habit: DbHabit, userIds: string[], now: number): void {
  userIds.forEach((userId, i) => {
    db.members.push({
      habitId: habit.id,
      userId,
      role: userId === habit.ownerId ? 'owner' : 'member',
      joinedAt: userId === habit.ownerId ? habit.createdAt : Math.min(now, habit.createdAt + (i + 1) * 3_600_000),
    });
    if (userId !== habit.ownerId) {
      db.activity.push({
        id: uid('a'),
        habitId: habit.id,
        type: 'joined',
        userId,
        createdAt: Math.min(now - 1, habit.createdAt + (i + 1) * 3_600_000),
        meta: {},
      });
    }
  });
}

/** Starter set: private cumulative + binary habits, a team room and a competitive room */
function seedStarterHabits(db: Db, user: DbUser, now: number, withHistory: boolean): void {
  const since = withHistory ? now - 18 * 86_400_000 : now;

  const water = addHabit(db, {
    ownerId: user.id,
    title: 'Drink 3 glasses of water',
    description: 'One glass at a time — the cooldown keeps you honest.',
    icon: 'water',
    kind: 'cumulative',
    frequency: 'daily',
    target: 3,
    unit: 'glasses',
    cooldownSeconds: 45,
    sharedMode: null,
    createdAt: since,
  });
  const run = addHabit(db, {
    ownerId: user.id,
    title: 'Morning run',
    description: 'Any distance counts. Shoes on, door open.',
    icon: 'run',
    kind: 'binary',
    frequency: 'daily',
    target: 1,
    unit: null,
    cooldownSeconds: 0,
    sharedMode: null,
    createdAt: since + 1,
  });
  const focus = addHabit(db, {
    ownerId: user.id,
    title: 'Deep work sprints',
    description: 'Four focused sprints. Phone in another room.',
    icon: 'code',
    kind: 'cumulative',
    frequency: 'daily',
    target: 4,
    unit: 'sprints',
    cooldownSeconds: 25 * 60,
    sharedMode: null,
    createdAt: since + 2,
  });
  const squad = addHabit(db, {
    ownerId: user.id,
    title: 'Summit squad: stretch breaks',
    description: 'Five stretch breaks a day. The whole squad climbs together.',
    icon: 'mountain',
    kind: 'cumulative',
    frequency: 'daily',
    target: 5,
    unit: 'breaks',
    cooldownSeconds: 60,
    sharedMode: 'team',
    createdAt: since + 3,
  });
  const duel = addHabit(db, {
    ownerId: 'u_omar',
    title: 'Reading duel',
    description: 'Three chapters a day. Loser buys the next book.',
    icon: 'book',
    kind: 'cumulative',
    frequency: 'daily',
    target: 3,
    unit: 'chapters',
    cooldownSeconds: 120,
    sharedMode: 'competitive',
    createdAt: since + 4,
  });

  for (const h of [water, run, focus]) db.members.push({ habitId: h.id, userId: user.id, role: 'owner', joinedAt: h.createdAt });
  joinAll(db, squad, [user.id, 'u_maya', 'u_kenji', 'u_lena'], now);
  joinAll(db, duel, ['u_omar', user.id, 'u_sasha'], now);

  if (withHistory) {
    seedHistory(db, water, [user.id], now, 0.9);
    seedHistory(db, run, [user.id], now, 0.75);
    seedHistory(db, focus, [user.id], now, 0.6);
    seedHistory(db, squad, [user.id, 'u_maya', 'u_kenji', 'u_lena'], now, 0.8);
    seedHistory(db, duel, [user.id, 'u_omar', 'u_sasha'], now, 0.8);
    user.totalXp = db.checkIns.filter((c) => c.userId === user.id).reduce((s, c) => s + c.xp, 0);
  } else {
    // Brand-new account: friends already have some progress today, the user starts at zero
    seedHistory(db, squad, ['u_maya', 'u_kenji', 'u_lena'], now, 0.8);
    seedHistory(db, duel, ['u_omar', 'u_sasha'], now, 0.8);
  }
  db.notifications[user.id] = defaultNotifications();
}

/**
 * Past check-ins for streaks & leaderboards. The most recent days are always
 * completed for the owner (so streaks are non-trivial); today is partial.
 */
function seedHistory(db: Db, habit: DbHabit, userIds: string[], now: number, rate: number): void {
  const rand = mulberry32(hash(habit.id));
  const dayMs = 86_400_000;
  const tz = db.users.find((u) => u.id === userIds[0])?.timezone ?? 'UTC';
  const today = periodKey(now, 'daily', tz);
  const startOfToday = periodStartMs(today, tz, now);
  const days = Math.max(0, Math.floor((now - habit.createdAt) / dayMs));

  for (const userId of userIds) {
    const bot = BOTS.some(([id]) => id === userId);
    for (let d = days; d >= 1; d--) {
      const complete = d <= 5 || rand() < rate;
      const count = complete ? habit.target : Math.floor(rand() * habit.target);
      const dayStart = startOfToday - d * dayMs;
      for (let i = 0; i < count; i++) {
        const at = dayStart + 7 * 3_600_000 + i * Math.max(habit.cooldownSeconds * 1000 * 1.5, 40 * 60_000) + Math.floor(rand() * 600_000);
        db.checkIns.push({ id: uid('c'), habitId: habit.id, userId, createdAt: at, xp: habit.xpPerCheckIn });
      }
    }

    // Today: bots are somewhere mid-way; humans start fresh so the demo has buttons to press
    if (bot && habit.sharedMode) {
      const todayCount = Math.min(habit.target - 1, Math.floor(rand() * habit.target));
      for (let i = 0; i < todayCount; i++) {
        const at = now - (todayCount - i) * Math.max(habit.cooldownSeconds * 1000 + 30_000, 11 * 60_000);
        if (at <= startOfToday) continue;
        db.checkIns.push({ id: uid('c'), habitId: habit.id, userId, createdAt: at, xp: habit.xpPerCheckIn });
        db.activity.push({
          id: uid('a'),
          habitId: habit.id,
          type: 'check_in',
          userId,
          createdAt: at,
          meta: { count: i + 1, target: habit.target },
        });
      }
    }
  }
  db.checkIns.sort((a, b) => a.createdAt - b.createdAt);
}

function defaultNotifications(): NotificationSettings {
  return { emailDigest: 'weekly', pushReminders: true, reminderTime: '08:30', friendActivity: true, streakWarnings: true };
}

// --- tiny utils ----------------------------------------------------------------------------

function levelFor(totalXp: number): { level: number; xp: number; xpToNextLevel: number } {
  let level = 1;
  let remaining = totalXp;
  let need = 100;
  while (remaining >= need) {
    remaining -= need;
    level++;
    need = 100 + (level - 1) * 40;
  }
  return { level, xp: remaining, xpToNextLevel: need };
}

function uid(prefix: string): string {
  return `${prefix}_${randomId(12)}`;
}

function randomId(length: number): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function toyHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a:${(h >>> 0).toString(16)}`;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validTz(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

interface AccessClaims {
  sub: string;
  exp: number;
  jti: string;
}

function encodeAccess(claims: AccessClaims): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.mock`;
}

function decodeAccess(token: string): AccessClaims | null {
  try {
    const [, payload, sig] = token.split('.');
    if (sig !== 'mock' || !payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as AccessClaims;
    return typeof claims.sub === 'string' && typeof claims.exp === 'number' ? claims : null;
  } catch {
    return null;
  }
}

let instance: MockServer | null = null;
export function mockServer(): MockServer {
  return (instance ??= new MockServer());
}
