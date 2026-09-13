import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

import { prefersReducedMotion, useGsap } from '../../core/animations/gsap';

/** Glow intensifies over these */
const INTERACTIVE = 'a, button, [role="button"], input, select, textarea, label, summary';

/**
 * Glow that follows the cursor: ember halo with a gold core, like light on the
 * summit. Ported from the Sushi project and recolored.
 *
 * Mouse only — on touch devices and with reduced motion nothing is rendered and
 * no listeners are attached. Inertia comes from gsap.quickTo.
 */
@Component({
  selector: 'sh-cursor-glow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="glow" #glow aria-hidden="true">
      <span class="glow__halo" #halo></span>
      <span class="glow__core" #core></span>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--z-cursor);
      pointer-events: none;
      display: none;
    }

    @media (hover: hover) and (pointer: fine) {
      :host { display: block; }
    }

    @media (prefers-reduced-motion: reduce) {
      :host { display: none; }
    }

    .glow {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      opacity: 0;
      mix-blend-mode: screen;
      will-change: transform;
    }

    :host-context([data-theme='light']) .glow { mix-blend-mode: multiply; }

    .glow__halo,
    .glow__core {
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 50%;
      translate: -50% -50%;
    }

    .glow__halo {
      width: 460px;
      height: 460px;
      opacity: 0.75;
      background: radial-gradient(
        circle,
        rgba(var(--ember-rgb), 0.22) 0%,
        rgba(var(--ember-rgb), 0.1) 34%,
        rgba(var(--ember-rgb), 0.04) 58%,
        transparent 72%
      );
      filter: blur(24px);
    }

    .glow__core {
      width: 110px;
      height: 110px;
      opacity: 0.7;
      background: radial-gradient(
        circle,
        rgba(var(--gold-rgb), 0.32) 0%,
        rgba(var(--gold-rgb), 0.12) 45%,
        transparent 70%
      );
      filter: blur(10px);
    }
  `,
})
export class CursorGlowComponent {
  private readonly glow = viewChild.required<ElementRef<HTMLElement>>('glow');
  private readonly halo = viewChild.required<ElementRef<HTMLElement>>('halo');
  private readonly core = viewChild.required<ElementRef<HTMLElement>>('core');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.follow());
  }

  private follow(): void {
    if (prefersReducedMotion()) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const { gsap } = useGsap();
    const el = this.glow().nativeElement;
    const halo = this.halo().nativeElement;
    const core = this.core().nativeElement;

    const toX = gsap.quickTo(el, 'x', { duration: 0.55, ease: 'power3' });
    const toY = gsap.quickTo(el, 'y', { duration: 0.55, ease: 'power3' });

    let visible = false;
    let active = false;

    const setActive = (next: boolean) => {
      if (next === active) return;
      active = next;
      gsap.to(halo, { scale: next ? 1.18 : 1, opacity: next ? 1 : 0.75, duration: 0.4, ease: 'power2.out' });
      gsap.to(core, { scale: next ? 1.6 : 1, opacity: next ? 1 : 0.7, duration: 0.35, ease: 'power2.out' });
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;

      if (!visible) {
        visible = true;
        // First frame without easing, otherwise the glow flies in from the corner
        gsap.set(el, { x: event.clientX, y: event.clientY });
        gsap.to(el, { opacity: 1, duration: 0.45, ease: 'power2.out' });
      }

      toX(event.clientX);
      toY(event.clientY);

      const target = event.target instanceof Element ? event.target : null;
      setActive(!!target?.closest(INTERACTIVE));
    };

    const onLeave = () => {
      visible = false;
      setActive(false);
      gsap.to(el, { opacity: 0, duration: 0.3 });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      gsap.killTweensOf([el, halo, core]);
    });
  }
}
