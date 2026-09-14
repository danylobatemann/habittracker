import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';

import { prefersReducedMotion } from '../../core/animations/gsap';

/** Share of the remaining distance covered per 60 Hz frame */
const DOT_SMOOTHNESS = 0.2;
const RING_SMOOTHNESS = 0.1;
/** px — below this both circles count as caught up and the loop sleeps */
const REST_DISTANCE = 0.1;
const INTERACTIVE = 'a, button, img, input, textarea, select, label, [role="button"]';

/**
 * A dot and a thin ring that trail the mouse at different speeds; the ring
 * grows over interactive elements. Angular port of Cursify's `SmoothFollower`
 * (React), with the native cursor kept as in the original.
 *
 *   <sh-cursor-follower />
 *
 * Mouse only: on touch devices and with reduced motion nothing renders.
 * Differences from the original, for performance: positions are written as
 * transforms straight to the DOM (no re-render per frame), the lerp is scaled
 * by frame time so 120 Hz screens feel the same, the loop sleeps once both
 * circles catch up, and hover uses one delegated listener so elements added
 * after navigation work too.
 */
@Component({
  selector: 'sh-cursor-follower',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dot" #dot aria-hidden="true"></div>
    <div class="ring" #ring aria-hidden="true"><span class="ring__circle"></span></div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
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

    .dot,
    .ring {
      position: absolute;
      top: 0;
      left: 0;
      opacity: 0;
      transition: opacity 200ms ease;
      will-change: transform;
    }

    :host(.is-visible) .dot,
    :host(.is-visible) .ring { opacity: 1; }

    .dot {
      width: 8px;
      height: 8px;
      margin: -4px 0 0 -4px;
      border-radius: 50%;
      background: var(--heading);
    }

    /* The wrapper moves, the inner circle resizes — so the size transition never fights the transform */
    .ring__circle {
      position: absolute;
      top: 0;
      left: 0;
      width: 28px;
      height: 28px;
      border: 1px solid var(--heading);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: width 0.3s, height 0.3s;
    }

    :host(.is-hovering) .ring__circle {
      width: 44px;
      height: 44px;
    }
  `,
})
export class CursorFollowerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dotRef = viewChild.required<ElementRef<HTMLElement>>('dot');
  private readonly ringRef = viewChild.required<ElementRef<HTMLElement>>('ring');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.start());
  }

  private start(): void {
    if (prefersReducedMotion()) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const host = this.host.nativeElement;
    const dotEl = this.dotRef().nativeElement;
    const ringEl = this.ringRef().nativeElement;

    const mouse = { x: 0, y: 0 };
    const dot = { x: 0, y: 0 };
    const ring = { x: 0, y: 0 };

    let frame = 0;
    let lastFrame = 0;
    let visible = false;
    let hovering = false;

    const render = () => {
      dotEl.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0)`;
      ringEl.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0)`;
    };

    /** Moves `p` toward the mouse; returns true while still noticeably away */
    const follow = (p: { x: number; y: number }, smoothness: number, frames: number): boolean => {
      const factor = 1 - Math.pow(1 - smoothness, frames);
      p.x += (mouse.x - p.x) * factor;
      p.y += (mouse.y - p.y) * factor;
      if (Math.abs(mouse.x - p.x) < REST_DISTANCE && Math.abs(mouse.y - p.y) < REST_DISTANCE) {
        p.x = mouse.x;
        p.y = mouse.y;
        return false;
      }
      return true;
    };

    const tick = (now: number) => {
      frame = 0;
      const frames = Math.min(4, ((now - lastFrame) / 1000) * 60);
      lastFrame = now;
      const dotMoving = follow(dot, DOT_SMOOTHNESS, frames);
      const ringMoving = follow(ring, RING_SMOOTHNESS, frames);
      render();
      if (dotMoving || ringMoving) wake();
    };

    const wake = () => {
      if (frame) return;
      lastFrame = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const setHovering = (value: boolean) => {
      if (value === hovering) return;
      hovering = value;
      host.classList.toggle('is-hovering', value);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      mouse.x = event.clientX;
      mouse.y = event.clientY;

      if (!visible) {
        visible = true;
        host.classList.add('is-visible');
        // Appear under the pointer instead of flying in from the corner
        dot.x = ring.x = mouse.x;
        dot.y = ring.y = mouse.y;
        render();
      }
      wake();
    };

    const onOver = (event: PointerEvent) => {
      const target = event.target;
      setHovering(target instanceof Element && target.closest(INTERACTIVE) !== null);
    };

    const onLeave = () => {
      visible = false;
      host.classList.remove('is-visible');
      setHovering(false);
    };

    const root = document.documentElement;
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    root.addEventListener('pointerleave', onLeave);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerleave', onLeave);
    });
  }
}
