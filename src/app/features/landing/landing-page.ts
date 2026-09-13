import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { prefersReducedMotion, useGsap } from '../../core/animations/gsap';
import { AuthService } from '../../core/auth/auth.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { ButtonComponent } from '../../shared/components/button/button';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { ProgressRingComponent } from '../../shared/components/progress-ring/progress-ring';
import { SummitArtComponent } from '../../shared/components/summit-art/summit-art';
import { RevealDirective } from '../../shared/directives/reveal.directive';
import { SpotlightDirective } from '../../shared/directives/spotlight.directive';
import { ParticleBurstService } from '../../shared/services/particle-burst.service';
import { formatCountdown } from '../../shared/utils/time-format';

interface Feature {
  icon: IconName;
  title: string;
  text: string;
}

const DEMO_TARGET = 8;
const DEMO_COOLDOWN_MS = 12_000;

@Component({
  selector: 'sh-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    IconComponent,
    AvatarComponent,
    ProgressRingComponent,
    SummitArtComponent,
    RevealDirective,
    SpotlightDirective,
  ],
  template: `
    <!-- Hero: the summit fills the first screen -->
    <section class="hero" #hero>
      <sh-summit-art class="hero__art" #art [eager]="true" focus="62% 60%" />

      <div class="container hero__content">
        <p class="eyebrow hero__line">Habit tracking, multiplayer</p>
        <h1 class="hero__title">
          @for (word of titleWords; track $index) {
            <span class="word"><span class="word__inner" [class.accent]="word.accent">{{ word.text }}</span></span>
          }
        </h1>
        <p class="lead hero__line">
          Build streaks with friends. One invite link, a live leaderboard and cooldowns
          the server keeps honest — every check-in lights the peak a little brighter.
        </p>
        <div class="hero__cta hero__line">
          @if (auth.isAuthenticated()) {
            <a shButton size="lg" routerLink="/dashboard">Open dashboard <sh-icon name="arrow-right" /></a>
          } @else {
            <a shButton size="lg" routerLink="/register">Start climbing <sh-icon name="arrow-right" /></a>
            <a shButton variant="ghost" size="lg" routerLink="/login">I have an account</a>
          }
        </div>
        <ul class="hero__proof hero__line" aria-label="Climbing right now">
          @for (p of climbers; track p.name) {
            <li><sh-avatar [name]="p.name" [hue]="p.hue" [size]="34" /></li>
          }
          <li class="hero__proof-text"><strong>2,418</strong> check-ins today</li>
        </ul>
      </div>

      <a class="hero__scroll" href="#features" aria-label="Scroll to features">
        <sh-icon name="chevron-down" />
      </a>
    </section>

    <!-- Features -->
    <section id="features" class="container section">
      <header class="section__head" shReveal>
        <p class="eyebrow">Why it sticks</p>
        <h2>Habits are easier on a rope team</h2>
      </header>

      <div class="features" shReveal=".feature" [revealStagger]="0.12">
        @for (f of features; track f.title) {
          <article class="panel feature" shSpotlight>
            <span class="feature__icon"><sh-icon [name]="f.icon" /></span>
            <h3>{{ f.title }}</h3>
            <p>{{ f.text }}</p>
          </article>
        }
      </div>
    </section>

    <!-- Live cooldown demo -->
    <section class="container section demo">
      <div class="demo__copy" shReveal>
        <p class="eyebrow">Smart cooldowns</p>
        <h2>No spamming the button</h2>
        <p class="lead">
          Cumulative habits — like eight glasses of water — need spacing. After each check-in the button
          locks and a timer runs on <em>server</em> time, so changing your phone clock doesn’t skip it.
        </p>
        <ul class="ticks">
          <li><sh-icon name="clock" /> Countdown synced with the server clock</li>
          <li><sh-icon name="bolt" /> Optimistic UI — instant, with rollback if it fails</li>
          <li><sh-icon name="users" /> Friends see your check-in in real time</li>
        </ul>
      </div>

      <article class="panel demo__card" shSpotlight shReveal [revealDelay]="0.15" aria-label="Interactive example">
        <header class="demo__head">
          <span class="demo__icon"><sh-icon name="water" /></span>
          <div>
            <h3>Drink water</h3>
            <p class="muted">Daily · {{ demoCount() }} / {{ demoTarget }} glasses</p>
          </div>
          <span class="badge badge--ember"><sh-icon name="flame" /> 12</span>
        </header>

        <div class="demo__ring">
          <sh-progress-ring [value]="demoCount() / demoTarget" [cooldown]="demoFraction()" [size]="168" [stroke]="10">
            @if (demoCooling()) {
              <span class="mono demo__timer">{{ demoLabel() }}</span>
              <span class="muted demo__sub">cooling down</span>
            } @else {
              <span class="mono demo__timer">{{ demoPercent() }}%</span>
              <span class="muted demo__sub">{{ demoCount() >= demoTarget ? 'summit!' : 'ready' }}</span>
            }
          </sh-progress-ring>
        </div>

        <button
          #demoBtn
          shButton
          block
          [variant]="demoCooling() ? 'ghost' : 'spin'"
          [disabled]="demoCooling()"
          (click)="demoCheckIn()"
        >
          @if (demoCooling()) {
            <sh-icon name="clock" /> Next glass in {{ demoLabel() }}
          } @else if (demoCount() >= demoTarget) {
            <sh-icon name="spark" /> Again from zero
          } @else {
            <sh-icon name="plus" /> Check in
          }
        </button>
        <p class="demo__note muted">Try it — this card runs a 12-second cooldown.</p>
      </article>
    </section>

    <!-- How invites work -->
    <section class="container section">
      <header class="section__head" shReveal>
        <p class="eyebrow">Invite links</p>
        <h2>Three steps to a shared summit</h2>
      </header>
      <ol class="steps" shReveal=".step" [revealStagger]="0.14">
        @for (s of steps; track s.title; let i = $index) {
          <li class="panel step">
            <span class="step__n mono">0{{ i + 1 }}</span>
            <sh-icon [name]="s.icon" />
            <h3>{{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </li>
        }
      </ol>
    </section>

    <!-- Final CTA over the framed picture -->
    <section class="container section">
      <div class="finale" shReveal>
        <sh-summit-art class="finale__art" [framed]="true" focus="62% 40%" />
        <div class="finale__copy">
          <h2>The top is closer with company</h2>
          <p class="lead">Free, no ads, works on your phone. Bring one friend.</p>
          <a shButton size="lg" [routerLink]="auth.isAuthenticated() ? '/dashboard' : '/register'">
            {{ auth.isAuthenticated() ? 'Back to my habits' : 'Create an account' }}
            <sh-icon name="arrow-right" />
          </a>
        </div>
      </div>
    </section>

    <footer class="container footer muted">
      <span>© {{ year }} SyncHabit</span>
      <span class="mono">made for climbers</span>
    </footer>
  `,
  styles: `
    :host { display: block; }

    /* --- hero ------------------------------------------------------------------ */
    .hero {
      position: relative;
      display: grid;
      align-items: end;
      min-height: 100svh;
      padding: calc(var(--dock-h) + 3rem) 0 clamp(4rem, 10vh, 7rem);
      overflow: hidden;
    }

    .hero__art {
      position: absolute;
      inset: 0;
      z-index: 0;
    }

    .hero__content {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 1.25rem;
      justify-items: start;
    }

    .hero__title {
      max-width: 13ch;
      margin: 0;
      font-size: var(--fs-display);
      line-height: 0.98;
      letter-spacing: -0.035em;
      color: var(--heading);
      text-shadow: 0 4px 40px rgba(0, 0, 0, 0.5);
    }

    .word {
      display: inline-block;
      overflow: hidden;
      padding-bottom: 0.08em;
      margin-right: 0.22em;
      vertical-align: top;
    }

    .word__inner { display: inline-block; }

    .accent {
      background: linear-gradient(100deg, var(--gold), var(--ember) 60%, var(--ember-strong));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      filter: drop-shadow(0 0 24px rgba(var(--ember-rgb), 0.45));
    }

    .hero .lead { color: #d5dbe4; }

    .hero__cta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .hero__proof {
      display: flex;
      align-items: center;
      margin: 0.5rem 0 0;
      padding: 0;
      list-style: none;
    }

    .hero__proof li + li { margin-left: -10px; }
    .hero__proof sh-avatar { box-shadow: 0 0 0 2px #06070a; }

    .hero__proof-text {
      margin-left: 0.9rem !important;
      font-size: var(--fs-sm);
      color: #b9c1cd;
    }

    .hero__proof-text strong { color: var(--gold); font-family: var(--font-mono); }

    .hero__scroll {
      position: absolute;
      left: 50%;
      bottom: 1.25rem;
      z-index: 1;
      display: none;
      place-items: center;
      width: 44px;
      height: 44px;
      translate: -50% 0;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 50%;
      color: #d5dbe4;
      animation: bob 2.4s ease-in-out infinite;
    }

    @keyframes bob {
      50% { transform: translateY(6px); }
    }

    /* --- sections ---------------------------------------------------------------- */
    .section {
      padding-block: clamp(4rem, 3rem + 5vw, 8rem);
    }

    .section__head {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 2.25rem;
    }

    .section__head h2,
    .demo h2,
    .finale h2 {
      margin: 0;
      font-size: var(--fs-h1);
      line-height: 1.05;
      letter-spacing: -0.03em;
      max-width: 18ch;
    }

    .features {
      display: grid;
      gap: 1rem;
    }

    .feature {
      display: grid;
      gap: 0.6rem;
      padding: 1.5rem;
    }

    .feature h3, .step h3 { margin: 0.4rem 0 0; font-size: var(--fs-h3); }
    .feature p, .step p { margin: 0; color: var(--text-soft); }

    .feature__icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: rgba(var(--ember-rgb), 0.12);
      color: var(--ember);
      font-size: 1.4rem;
      box-shadow: inset 0 0 0 1px rgba(var(--ember-rgb), 0.3);
    }

    /* --- demo ----------------------------------------------------------------------- */
    .demo {
      display: grid;
      gap: 2.5rem;
      align-items: center;
    }

    .demo__copy { display: grid; gap: 1rem; justify-items: start; }

    .ticks {
      display: grid;
      gap: 0.7rem;
      margin: 0.5rem 0 0;
      padding: 0;
      list-style: none;
      color: var(--text);
    }

    .ticks li { display: flex; gap: 0.6rem; align-items: center; }
    .ticks sh-icon { color: var(--ember); }

    .demo__card {
      display: grid;
      gap: 1.5rem;
      padding: 1.5rem;
      max-width: 420px;
      width: 100%;
      justify-self: center;
    }

    .demo__head {
      display: flex;
      align-items: center;
      gap: 0.9rem;
    }

    .demo__head h3 { margin: 0; font-size: var(--fs-h3); }
    .demo__head p { margin: 0.15rem 0 0; font-size: var(--fs-sm); }
    .demo__head .badge { margin-left: auto; }

    .demo__icon {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border-radius: 14px;
      background: var(--surface-3);
      color: var(--ice);
      font-size: 1.35rem;
    }

    .demo__ring { display: grid; place-items: center; }
    .demo__timer { display: block; font-size: 1.9rem; font-weight: 700; color: var(--heading); }
    .demo__sub { font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.12em; }
    .demo__note { margin: -0.5rem 0 0; text-align: center; font-size: var(--fs-xs); }

    /* --- steps ---------------------------------------------------------------------- */
    .steps {
      display: grid;
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: grid;
      gap: 0.5rem;
      padding: 1.5rem;
    }

    .step > sh-icon { font-size: 1.6rem; color: var(--ember); }

    .step__n {
      position: absolute;
      top: 1.1rem;
      right: 1.3rem;
      color: var(--text-muted);
      font-size: var(--fs-sm);
    }

    /* --- finale --------------------------------------------------------------------- */
    .finale {
      position: relative;
      display: grid;
      min-height: 460px;
      align-items: end;
      border-radius: var(--radius-panel);
    }

    .finale__art {
      position: absolute;
      inset: 0;
    }

    .finale__copy {
      position: relative;
      display: grid;
      gap: 1rem;
      justify-items: start;
      padding: clamp(1.5rem, 1rem + 3vw, 3rem);
    }

    .finale .lead { color: #d5dbe4; }
    .finale h2 { color: #fff; }

    .footer {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding-block: 2rem 3rem;
      border-top: 1px solid var(--line);
      font-size: var(--fs-sm);
    }

    @media (min-width: 768px) {
      .features { grid-template-columns: repeat(3, 1fr); }
      .steps { grid-template-columns: repeat(3, 1fr); }
      .hero__scroll { display: grid; }
    }

    @media (min-width: 960px) {
      .demo { grid-template-columns: 1.1fr 1fr; }
      .hero { align-items: center; }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero__scroll { animation: none; }
    }
  `,
})
export class LandingPage {
  protected readonly auth = inject(AuthService);
  private readonly particles = inject(ParticleBurstService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly art = viewChild.required(SummitArtComponent, { read: ElementRef });
  private readonly demoBtn = viewChild.required('demoBtn', { read: ElementRef });

  protected readonly year = new Date().getFullYear();
  protected readonly demoTarget = DEMO_TARGET;

  protected readonly titleWords = [
    { text: 'Climb', accent: false },
    { text: 'your', accent: false },
    { text: 'habits', accent: true },
    { text: 'together.', accent: false },
  ];

  protected readonly climbers = [
    { name: 'Mira Kovac', hue: 18 },
    { name: 'Jonas Reed', hue: 205 },
    { name: 'Ayla Tan', hue: 330 },
    { name: 'Theo Park', hue: 42 },
  ];

  protected readonly features: Feature[] = [
    {
      icon: 'link',
      title: 'One link per habit',
      text: 'Share a habit with an invite link. Friends sign in, join and appear on the board instantly.',
    },
    {
      icon: 'trophy',
      title: 'Team or rivalry',
      text: 'Fill a shared progress bar together, or race each other on a live mini leaderboard.',
    },
    {
      icon: 'bolt',
      title: 'XP, levels, streaks',
      text: 'Every check-in earns XP. Keep the flame alive — streaks grow each day you hit your target.',
    },
  ];

  protected readonly steps: { icon: IconName; title: string; text: string }[] = [
    { icon: 'plus', title: 'Create a habit', text: 'Pick daily or weekly, a target and an optional cooldown.' },
    { icon: 'share', title: 'Send the invite', text: 'Copy the link or use the share sheet on your phone.' },
    { icon: 'users', title: 'Climb together', text: 'See avatars, the activity feed and who checked in last.' },
  ];

  // --- demo card (local only, no backend) -----------------------------------------------
  protected readonly demoCount = signal(3);
  private readonly demoEndsAt = signal(0);
  private readonly demoNow = signal(Date.now());
  private demoTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly demoRemaining = computed(() => Math.max(0, this.demoEndsAt() - this.demoNow()));
  protected readonly demoCooling = computed(() => this.demoRemaining() > 0);
  protected readonly demoFraction = computed(() => this.demoRemaining() / DEMO_COOLDOWN_MS);
  protected readonly demoLabel = computed(() => formatCountdown(this.demoRemaining()));
  protected readonly demoPercent = computed(() => Math.round((this.demoCount() / DEMO_TARGET) * 100));

  constructor() {
    afterNextRender(() => this.animateHero());
    this.destroyRef.onDestroy(() => this.demoTimer && clearInterval(this.demoTimer));
  }

  protected demoCheckIn(): void {
    if (this.demoCooling()) return;
    const el = this.demoBtn().nativeElement as HTMLElement;

    if (this.demoCount() >= DEMO_TARGET) {
      this.demoCount.set(0);
      return;
    }

    const next = this.demoCount() + 1;
    this.demoCount.set(next);

    if (next >= DEMO_TARGET) {
      this.particles.fromElement(el, { kind: 'confetti', label: 'Target hit!' });
      return;
    }

    this.particles.fromElement(el, { label: '+10 XP' });
    this.demoNow.set(Date.now());
    this.demoEndsAt.set(Date.now() + DEMO_COOLDOWN_MS);
    this.demoTimer ??= setInterval(() => {
      this.demoNow.set(Date.now());
      if (!this.demoCooling() && this.demoTimer) {
        clearInterval(this.demoTimer);
        this.demoTimer = null;
      }
    }, 250);
  }

  private animateHero(): void {
    if (prefersReducedMotion()) return;
    const { gsap } = useGsap();
    const hero = this.hero().nativeElement;
    const art = this.art().nativeElement as HTMLElement;

    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power4.out' } })
        .fromTo(art, { scale: 1.18, opacity: 0 }, { scale: 1.04, opacity: 1, duration: 2.2, ease: 'power2.out' })
        .from('.word__inner', { yPercent: 110, duration: 1.1, stagger: 0.08 }, 0.25)
        .from('.hero__line', { y: 24, opacity: 0, duration: 0.9, stagger: 0.1, clearProps: 'all' }, 0.6);

      // Parallax: the mountain sinks and the copy drifts up while scrolling away
      gsap.to(art, {
        yPercent: 14,
        scale: 1.12,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('.hero__content', {
        y: -80,
        opacity: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, hero);

    this.destroyRef.onDestroy(() => ctx.revert());
  }
}
