import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { prefersReducedMotion } from '../../core/animations/gsap';

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  restDelta: number;
}

const DEFAULT_SPRING: SpringConfig = { stiffness: 400, damping: 45, mass: 1, restDelta: 0.001 };
/** px per ms — below this the arrow keeps its heading */
const TURN_SPEED = 0.1;
const PRESS_SCALE = 0.95;
const SETTLE_MS = 150;
/** Integration step; springs this stiff blow up with a plain 16 ms Euler step */
const STEP_S = 1 / 240;
const ROOT_CLASS = 'has-smooth-cursor';

/**
 * Custom arrow cursor that trails the mouse on springs and turns toward the
 * direction of travel. Angular port of the `SmoothCursor` React component
 * (motion/react `useSpring`): same spring settings, same velocity → heading
 * logic, without React or motion in the bundle.
 *
 *   <sh-smooth-cursor />
 *   <sh-smooth-cursor [spring]="{ stiffness: 300, damping: 40, mass: 1, restDelta: 0.001 }">
 *     <svg>…your own cursor…</svg>
 *   </sh-smooth-cursor>
 *
 * Mouse only: on touch devices and with reduced motion nothing renders and the
 * native cursor stays. The native cursor is hidden via `html.has-smooth-cursor`
 * (styles.css) — except while a modal <dialog> is open, since dialogs live in
 * the top layer above any z-index.
 * One rAF loop writes a single transform and sleeps once every spring settles.
 */
@Component({
  selector: 'sh-smooth-cursor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cursor" #cursor aria-hidden="true">
      <ng-content>
        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="27" viewBox="0 0 50 54" fill="none">
          <g filter="url(#sh-cursor-shadow)">
            <path
              d="M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z"
              fill="black"
            />
            <path
              d="M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z"
              stroke="white"
              stroke-width="2.25825"
            />
          </g>
          <defs>
            <filter
              id="sh-cursor-shadow"
              x="0.602397"
              y="0.952444"
              width="49.0584"
              height="52.428"
              filterUnits="userSpaceOnUse"
              color-interpolation-filters="sRGB"
            >
              <feFlood flood-opacity="0" result="BackgroundImageFix" />
              <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
              <feOffset dy="2.25825" />
              <feGaussianBlur stdDeviation="2.25825" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
              <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
              <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
            </filter>
          </defs>
        </svg>
      </ng-content>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      z-index: var(--z-cursor);
      display: none;
      pointer-events: none;
    }

    @media (hover: hover) and (pointer: fine) {
      :host { display: block; }
    }

    @media (prefers-reduced-motion: reduce) {
      :host { display: none; }
    }

    .cursor {
      position: absolute;
      top: 0;
      left: 0;
      display: grid;
      place-items: center;
      opacity: 0;
      transition: opacity 200ms ease;
      will-change: transform;
    }

    .cursor.is-visible { opacity: 1; }

    .cursor > :first-child { display: block; }
  `,
})
export class SmoothCursorComponent {
  /** Position spring; rotation and scale derive from it like in the original */
  readonly spring = input<SpringConfig>(DEFAULT_SPRING);

  private readonly cursorRef = viewChild.required<ElementRef<HTMLElement>>('cursor');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.start());
  }

  private start(): void {
    if (prefersReducedMotion()) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const el = this.cursorRef().nativeElement;
    const cfg = this.spring();
    const x = new Spring(0, cfg);
    const y = new Spring(0, cfg);
    const rotation = new Spring(0, { ...cfg, damping: 60, stiffness: 300 });
    const scale = new Spring(1, { ...cfg, stiffness: 500, damping: 35 });
    // Pop-in when the cursor first appears (initial scale 0 → 1)
    const appear = new Spring(0, { ...cfg, stiffness: 400, damping: 30 });

    let frame = 0;
    let lastFrame = 0;
    let visible = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let previousAngle = 0;
    let accumulatedRotation = 0;

    const render = () => {
      const s = scale.value * appear.value;
      el.style.transform =
        `translate3d(${x.value}px, ${y.value}px, 0) translate(-50%, -50%) ` +
        `rotate(${rotation.value}deg) scale(${s})`;
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.064, (now - lastFrame) / 1000);
      lastFrame = now;
      const springs = [x, y, rotation, scale, appear];
      let moving = false;
      for (const spring of springs) moving = spring.step(dt) || moving;
      render();
      if (moving) wake();
    };

    const wake = () => {
      if (frame) return;
      lastFrame = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const now = performance.now();
      const cx = event.clientX;
      const cy = event.clientY;

      if (!visible) {
        visible = true;
        el.classList.add('is-visible');
        // Appear under the pointer instead of flying in from the corner
        x.jump(cx);
        y.jump(cy);
        lastX = cx;
        lastY = cy;
        lastTime = now;
        appear.target = 1;
        wake();
        return;
      }

      const elapsed = now - lastTime;
      if (elapsed > 0) {
        const vx = (cx - lastX) / elapsed;
        const vy = (cy - lastY) / elapsed;
        if (Math.hypot(vx, vy) > TURN_SPEED) {
          const angle = (Math.atan2(vy, vx) * 180) / Math.PI + 90;
          let diff = angle - previousAngle;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          accumulatedRotation += diff;
          previousAngle = angle;
          rotation.target = accumulatedRotation;

          scale.target = PRESS_SCALE;
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            scale.target = 1;
            wake();
          }, SETTLE_MS);
        }
      }
      lastX = cx;
      lastY = cy;
      lastTime = now;

      x.target = cx;
      y.target = cy;
      wake();
    };

    const onLeave = () => {
      visible = false;
      el.classList.remove('is-visible');
      appear.jump(0);
    };

    const root = document.documentElement;
    root.classList.add(ROOT_CLASS);
    window.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      root.classList.remove(ROOT_CLASS);
      window.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    });
  }
}

/** Damped harmonic spring, the same model as motion's `useSpring` */
class Spring {
  value: number;
  target: number;
  private velocity = 0;

  constructor(
    initial: number,
    private readonly cfg: SpringConfig,
  ) {
    this.value = initial;
    this.target = initial;
  }

  jump(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  /** Advances by `dt` seconds; returns false once at rest */
  step(dt: number): boolean {
    const { stiffness, damping, mass, restDelta } = this.cfg;
    for (let t = 0; t < dt; t += STEP_S) {
      const h = Math.min(STEP_S, dt - t);
      const force = -stiffness * (this.value - this.target) - damping * this.velocity;
      this.velocity += (force / mass) * h;
      this.value += this.velocity * h;
    }
    // restDelta is tuned for motion values in px/deg; keep a sane floor for velocity too
    if (Math.abs(this.target - this.value) < Math.max(restDelta, 0.01) && Math.abs(this.velocity) < 0.05) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}
