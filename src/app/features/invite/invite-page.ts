import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { popIn } from '../../core/animations/route-animations';
import { RoomsApi } from '../../core/api/rooms-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/http/api-error';
import type { InvitePreview } from '../../core/models/room.models';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { ButtonComponent } from '../../shared/components/button/button';
import { IconComponent } from '../../shared/components/icon/icon';
import { SummitArtComponent } from '../../shared/components/summit-art/summit-art';
import { SpotlightDirective } from '../../shared/directives/spotlight.directive';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { ParticleBurstService } from '../../shared/services/particle-burst.service';
import { HabitsStore } from '../habits/data/habits.store';

type InviteView =
  | { state: 'loading' }
  | { state: 'ready'; invite: InvitePreview }
  | { state: 'error'; error: ApiError };

/**
 * Landing spot of an invite link. authGuard already made sure the friend is
 * signed in (and brought them back here after login/registration).
 */
@Component({
  selector: 'sh-invite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, ButtonComponent, IconComponent, SummitArtComponent, SpotlightDirective, RelativeTimePipe],
  animations: [popIn],
  template: `
    <div class="page container">
      <section class="card panel" shSpotlight aria-live="polite">
        <sh-summit-art class="art" [eager]="true" focus="60% 35%" />

        <div class="content">
          @switch (view().state) {
            @case ('loading') {
              <div class="skel" aria-busy="true" aria-label="Loading invite">
                <span class="skeleton s1"></span>
                <span class="skeleton s2"></span>
                <span class="skeleton s3"></span>
                <span class="skeleton s4"></span>
              </div>
            }

            @case ('error') {
              <div class="state" role="alert" @popIn>
                <sh-icon [name]="errorCode() === 'INVITE_EXPIRED' ? 'clock' : 'link'" />
                <h1>{{ errorCode() === 'INVITE_EXPIRED' ? 'This invite has melted' : errorCode() === 'NOT_FOUND' ? 'Invite not found' : 'Couldn’t open the invite' }}</h1>
                <p class="muted">{{ errorMessage() }}</p>
                <div class="actions">
                  <a shButton variant="ghost" routerLink="/dashboard">Go to dashboard</a>
                  @if (errorCode() !== 'INVITE_EXPIRED' && errorCode() !== 'NOT_FOUND') {
                    <button shButton type="button" (click)="load()">Try again</button>
                  }
                </div>
              </div>
            }

            @case ('ready') {
              @if (invite(); as inv) {
                <div class="invite" @popIn>
                  <p class="eyebrow">You’re invited</p>
                  <div class="inviter">
                    <sh-avatar [name]="inv.invitedBy.displayName" [hue]="inv.invitedBy.avatarHue" [size]="44" [ring]="true" />
                    <p><strong>{{ inv.invitedBy.displayName }}</strong> wants you on the rope team</p>
                  </div>

                  <div class="habit">
                    <span class="tile" aria-hidden="true"><sh-icon [name]="inv.habit.icon" /></span>
                    <div>
                      <h1>{{ inv.habit.title }}</h1>
                      <p class="meta">
                        {{ inv.habit.frequency === 'daily' ? 'Daily' : 'Weekly' }}
                        · {{ inv.habit.target }} {{ inv.habit.unit || (inv.habit.target === 1 ? 'time' : 'times') }}
                        · <span class="mode"><sh-icon [name]="inv.habit.mode === 'team' ? 'users' : 'swords'" /> {{ inv.habit.mode === 'team' ? 'Team — climb together' : 'Versus — race to the top' }}</span>
                      </p>
                    </div>
                  </div>

                  @if (inv.habit.description) {
                    <p class="desc">{{ inv.habit.description }}</p>
                  }

                  <div class="members">
                    <span class="stack" aria-hidden="true">
                      @for (m of inv.memberPreview; track m.userId) {
                        <sh-avatar [name]="m.displayName" [hue]="m.avatarHue" [src]="m.avatarUrl" [size]="32" />
                      }
                    </span>
                    <span class="muted">{{ inv.membersCount }} {{ inv.membersCount === 1 ? 'member' : 'members' }} already climbing</span>
                  </div>

                  <div class="actions">
                    @if (inv.alreadyMember) {
                      <a shButton size="lg" [routerLink]="['/habits', inv.habit.id]">Open the room <sh-icon name="arrow-right" /></a>
                      <p class="muted small">You’re already a member of this room.</p>
                    } @else {
                      <button shButton size="lg" type="button" [busy]="joining()" [disabled]="joining()" (click)="join($any($event.currentTarget))">
                        <sh-icon name="bolt" /> Join as {{ auth.user()?.displayName }}
                      </button>
                      <a shButton variant="ghost" routerLink="/dashboard">Not now</a>
                    }
                  </div>

                  <p class="expires muted"><sh-icon name="clock" /> Link expires {{ inv.expiresAt | relativeTime }}</p>
                </div>
              }
            }
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }

    .page { display: grid; place-items: center; min-height: calc(100dvh - var(--page-top) - 2rem); }

    .card {
      position: relative;
      width: min(100%, 620px);
      overflow: hidden;
      border-radius: var(--radius-panel);
    }

    .art { position: absolute; inset: 0 0 auto; height: 220px; opacity: 0.75; mask-image: linear-gradient(#000 40%, transparent); }

    .content { position: relative; padding: 150px clamp(1.1rem, 0.8rem + 2vw, 2.25rem) clamp(1.25rem, 1rem + 1.5vw, 2rem); }

    .invite, .state { display: grid; gap: 1.1rem; }

    .inviter { display: flex; align-items: center; gap: 0.75rem; }
    .inviter p { margin: 0; color: var(--text-soft); }
    .inviter strong { color: var(--heading); }

    .habit { display: flex; align-items: flex-start; gap: 0.9rem; }

    .tile {
      display: grid;
      place-items: center;
      width: 58px;
      height: 58px;
      flex-shrink: 0;
      border-radius: 18px;
      background: linear-gradient(145deg, rgba(var(--ember-rgb), 0.32), rgba(var(--ember-rgb), 0.05));
      border: 1px solid rgba(var(--ember-rgb), 0.35);
      color: var(--ember-soft);
      box-shadow: var(--glow-md);
    }
    .tile sh-icon { width: 28px; height: 28px; }

    h1 { margin: 0; font-size: var(--fs-h2); letter-spacing: -0.02em; line-height: 1.1; overflow-wrap: anywhere; }

    .meta { margin: 0.35rem 0 0; font-size: var(--fs-sm); color: var(--text-soft); }
    .mode { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--ember-soft); }
    .mode sh-icon { width: 15px; height: 15px; }

    .desc { margin: 0; color: var(--text); }

    .members { display: flex; align-items: center; gap: 0.75rem; font-size: var(--fs-sm); }
    .stack { display: flex; }
    .stack sh-avatar { border-radius: 50%; box-shadow: 0 0 0 2px var(--surface-solid); }
    .stack sh-avatar + sh-avatar { margin-left: -9px; }

    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.7rem; margin-top: 0.3rem; }
    .small { margin: 0; font-size: var(--fs-sm); }

    .expires { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: var(--fs-xs); }
    .expires sh-icon { width: 13px; height: 13px; }

    .state { justify-items: center; text-align: center; }
    .state > sh-icon { width: 42px; height: 42px; color: var(--ember); }
    .state p { margin: 0; max-width: 42ch; }
    .state .actions { justify-content: center; }

    .skel { display: grid; gap: 0.9rem; }
    .skel .s1 { width: 30%; height: 12px; }
    .skel .s2 { width: 70%; height: 32px; }
    .skel .s3 { width: 90%; height: 14px; }
    .skel .s4 { width: 45%; height: 52px; border-radius: var(--radius-pill); }
  `,
})
export class InvitePage {
  /** Route param, bound by withComponentInputBinding */
  readonly token = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly api = inject(RoomsApi);
  private readonly habits = inject(HabitsStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly particles = inject(ParticleBurstService);

  protected readonly view = signal<InviteView>({ state: 'loading' });
  protected readonly joining = signal(false);

  protected readonly invite = computed(() => {
    const v = this.view();
    return v.state === 'ready' ? v.invite : null;
  });
  protected readonly errorCode = computed(() => {
    const v = this.view();
    return v.state === 'error' ? v.error.code : null;
  });
  protected readonly errorMessage = computed(() => {
    const v = this.view();
    return v.state === 'error' ? v.error.message : '';
  });

  private request: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    effect(() => {
      this.token();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.request?.unsubscribe();
    this.view.set({ state: 'loading' });
    this.request = this.api.previewInvite(this.token()).subscribe({
      next: (invite) => this.view.set({ state: 'ready', invite }),
      error: (err: unknown) => this.view.set({ state: 'error', error: ApiError.from(err) }),
    });
  }

  protected join(button: HTMLElement): void {
    const invite = this.invite();
    if (!invite || this.joining()) return;
    this.joining.set(true);

    this.request = this.api.acceptInvite(invite.token).subscribe({
      next: ({ habitId }) => {
        this.particles.fromElement(button, { kind: 'confetti' });
        this.toast.success(`You joined “${invite.habit.title}”. Let’s climb!`);
        this.habits.load(true);
        setTimeout(() => void this.router.navigate(['/habits', habitId], { replaceUrl: true }), 450);
      },
      error: (err: unknown) => {
        this.joining.set(false);
        const error = ApiError.from(err);
        if (error.code === 'ALREADY_MEMBER') {
          void this.router.navigate(['/habits', invite.habit.id], { replaceUrl: true });
        } else if (error.code === 'INVITE_EXPIRED' || error.code === 'NOT_FOUND') {
          this.view.set({ state: 'error', error });
        } else {
          this.toast.error(error.message);
        }
      },
    });
  }
}
