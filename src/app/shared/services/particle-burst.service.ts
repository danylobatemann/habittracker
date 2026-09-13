import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { prefersReducedMotion, useGsap } from '../../core/animations/gsap';

export interface BurstOptions {
  /** Number of particles; the completion burst uses more */
  count?: number;
  /** Floating label, e.g. "+10 XP" */
  label?: string;
  /** 'spark' = small check-in burst, 'confetti' = target completed */
  kind?: 'spark' | 'confetti';
}

const COLORS = ['#ff7a1a', '#ffc766', '#ffb27a', '#ffffff', '#e25a00'];
const CONFETTI_COLORS = ['#ff7a1a', '#ffc766', '#b8c4d4', '#ffffff', '#ff5364', '#ffb27a'];

/**
 * Particle / confetti bursts on check-in, rendered as a handful of fixed
 * elements driven by GSAP (velocity + gravity) and removed afterwards.
 * Cheap enough for mobile: ≤ 48 nodes, transform/opacity only.
 */
@Injectable({ providedIn: 'root' })
export class ParticleBurstService {
  private readonly doc = inject(DOCUMENT);

  /** Burst from the centre of an element */
  fromElement(el: Element, options: BurstOptions = {}): void {
    const rect = el.getBoundingClientRect();
    this.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
  }

  burst(x: number, y: number, { count, label, kind = 'spark' }: BurstOptions = {}): void {
    if (label) this.floatLabel(x, y, label);
    if (prefersReducedMotion()) return;

    const { gsap } = useGsap();
    const confetti = kind === 'confetti';
    const total = count ?? (confetti ? 44 : 18);
    const palette = confetti ? CONFETTI_COLORS : COLORS;
    const nodes: HTMLElement[] = [];

    for (let i = 0; i < total; i++) {
      const p = this.doc.createElement('span');
      p.className = 'particle';
      const size = confetti ? 6 + Math.random() * 6 : 3 + Math.random() * 4;
      const color = palette[i % palette.length];
      Object.assign(p.style, {
        width: `${size}px`,
        height: `${confetti ? size * 0.45 : size}px`,
        borderRadius: confetti ? '2px' : '50%',
        background: color,
        boxShadow: confetti ? 'none' : `0 0 ${size * 2}px ${color}`,
      });
      this.doc.body.appendChild(p);
      nodes.push(p);

      const angle = confetti ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 : Math.random() * Math.PI * 2;
      const speed = confetti ? 260 + Math.random() * 320 : 70 + Math.random() * 130;
      const duration = confetti ? 1.4 + Math.random() * 0.6 : 0.7 + Math.random() * 0.35;

      gsap.set(p, { x, y, xPercent: -50, yPercent: -50, opacity: 1, rotation: Math.random() * 360 });

      // Ballistic flight: position = v·t + ½·g·t², with a little air drag
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const gravity = confetti ? 720 : 240;
      const setX = gsap.quickSetter(p, 'x', 'px');
      const setY = gsap.quickSetter(p, 'y', 'px');
      const flight = { t: 0 };
      gsap.to(flight, {
        t: duration,
        duration,
        ease: 'none',
        onUpdate: () => {
          const t = flight.t;
          const drag = 1 - Math.min(0.6, t * 0.35);
          setX(x + vx * t * drag);
          setY(y + vy * t * drag + 0.5 * gravity * t * t);
        },
      });
      gsap.to(p, { rotation: `+=${(Math.random() - 0.5) * 720}`, duration, ease: 'none' });
      gsap.to(p, {
        duration: duration * 0.45,
        delay: duration * 0.55,
        opacity: 0,
        scale: confetti ? 1 : 0.2,
        ease: 'power1.in',
        onComplete: () => p.remove(),
      });
    }

    // Hard cleanup if a tween is killed or the tab is backgrounded
    setTimeout(() => nodes.forEach((n) => n.remove()), 2600);
  }

  private floatLabel(x: number, y: number, text: string): void {
    const el = this.doc.createElement('span');
    el.className = 'particle particle--label';
    el.textContent = text;
    this.doc.body.appendChild(el);

    if (prefersReducedMotion()) {
      Object.assign(el.style, { transform: `translate(${x}px, ${y - 40}px) translate(-50%, -50%)` });
      setTimeout(() => el.remove(), 900);
      return;
    }

    const { gsap } = useGsap();
    gsap.fromTo(
      el,
      { x, y: y - 10, xPercent: -50, yPercent: -50, opacity: 0, scale: 0.6 },
      {
        y: y - 70,
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(2)',
        onComplete: () => {
          gsap.to(el, { y: y - 100, opacity: 0, duration: 0.6, delay: 0.25, ease: 'power1.in', onComplete: () => el.remove() });
        },
      },
    );
    setTimeout(() => el.remove(), 2400);
  }
}
