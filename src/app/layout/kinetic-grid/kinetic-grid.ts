import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';

import { prefersReducedMotion } from '../../core/animations/gsap';
import { ThemeService } from '../../core/services/theme.service';

interface Point {
  x: number;
  y: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  born: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const CELL_SIZE = 55;
const INFLUENCE_RADIUS = 260;
const MAX_WARP = 24;
const DOT_SPACING = 28;
const LERP_SPEED = 0.08;
const NODE_BASE_RADIUS = 1.8;
const NODE_ACTIVE_RADIUS = 3.2;
const RIPPLE_WAVE_WIDTH = 55;
/** Stop the loop once the eased cursor is this close to its target */
const SETTLE_EPSILON = 0.3;
const OFFSCREEN = -9999;

/**
 * Kinetic grid background — Angular/canvas port of `background.txt`
 * (a React component). The grid warps away from the cursor and ripples on
 * click; colors come from CSS tokens (`--ember-rgb`, `--ink-rgb`, `--grid-bg`)
 * so it follows the theme.
 *
 * Differences from the original, for production:
 *   • DPR-aware canvas (capped at 1.5×), work buffers reused between frames;
 *   • the rAF loop sleeps when nothing moves (no idle CPU/battery drain);
 *   • inactive segments are batched into a single path — ~1 stroke per frame
 *     instead of ~1400;
 *   • the static dot texture is pre-rendered once per resize;
 *   • pointer-events: none, touch taps ripple too, reduced motion → static frame;
 *   • paused while the tab is hidden.
 */
@Component({
  selector: 'sh-kinetic-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--z-grid);
      pointer-events: none;
      background: var(--grid-bg);
      transition: background-color 300ms ease;
    }

    canvas {
      width: 100%;
      height: 100%;
    }

    /* Soft vignette so content panels stay readable over the lines */
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(120% 80% at 50% 0%, transparent 40%, var(--grid-bg) 100%),
        linear-gradient(to bottom, transparent 60%, var(--grid-bg));
      opacity: 0.85;
    }
  `,
})
export class KineticGridComponent {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  private ctx: CanvasRenderingContext2D | null = null;
  private dots: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private frame = 0;
  private readonly reduced = prefersReducedMotion();

  private readonly mouse: Point = { x: OFFSCREEN, y: OFFSCREEN };
  private readonly target: Point = { x: OFFSCREEN, y: OFFSCREEN };
  private readonly ripples: Ripple[] = [];

  /** Per-frame work buffers, reused — no garbage while the cursor moves */
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);
  private pr = new Float32Array(0);
  private readonly active: number[] = [];

  private accent: Rgb = { r: 255, g: 122, b: 26 };
  private ink: Rgb = { r: 255, g: 255, b: 255 };
  private inkAlpha = 0.13;

  constructor() {
    afterNextRender(() => this.setup());

    // Theme switch → re-read tokens and repaint once
    effect(() => {
      this.theme.theme();
      untracked(() => {
        if (!this.ctx) return;
        // Wait one frame so the new [data-theme] styles are computed
        requestAnimationFrame(() => {
          this.readColors();
          this.renderDots();
          this.wake();
        });
      });
    });
  }

  private setup(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;

    this.readColors();
    this.resize();

    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

    const onResize = () => {
      this.resize();
      this.wake();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      this.target.x = e.clientX;
      this.target.y = e.clientY;
      if (this.mouse.x === OFFSCREEN) {
        // First contact: start at the cursor instead of flying in from the corner
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      }
      this.wake();
    };
    const onLeave = () => {
      this.target.x = OFFSCREEN;
      this.target.y = OFFSCREEN;
      this.mouse.x = OFFSCREEN;
      this.mouse.y = OFFSCREEN;
      this.wake();
    };
    const onDown = (e: PointerEvent) => {
      if (this.reduced) return;
      this.ripples.push({ x: e.clientX, y: e.clientY, radius: 0, opacity: 1, born: performance.now() });
      this.wake();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.sleep();
      else this.wake();
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (fine && !this.reduced) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }

    this.wake();

    this.destroyRef.onDestroy(() => {
      this.sleep();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  // --- loop ---------------------------------------------------------------------

  private wake(): void {
    if (this.frame || !this.ctx) return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private sleep(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick(now: number): void {
    this.frame = 0;

    const m = this.mouse;
    const t = this.target;
    if (t.x !== OFFSCREEN) {
      m.x += (t.x - m.x) * LERP_SPEED;
      m.y += (t.y - m.y) * LERP_SPEED;
    }

    this.draw(now);

    const moving = t.x !== OFFSCREEN && (Math.abs(t.x - m.x) > SETTLE_EPSILON || Math.abs(t.y - m.y) > SETTLE_EPSILON);
    if (moving || this.ripples.length > 0) this.wake();
  }

  // --- drawing ------------------------------------------------------------------

  private draw(now: number): void {
    const ctx = this.ctx!;
    const W = this.width;
    const H = this.height;
    const mouse = this.mouse;
    const ripples = this.ripples;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!W || !H) return; // hidden / minimised window: nothing to draw into
    if (this.dots?.width && this.dots.height) ctx.drawImage(this.dots, 0, 0, W, H);

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const age = (now - r.born) / 1000;
      r.radius = Math.max(0, age * 400);
      r.opacity = Math.max(0, 1 - age * 1.2);
      if (r.opacity <= 0) ripples.splice(i, 1);
    }

    const cols = Math.max(2, Math.ceil(W / CELL_SIZE)) + 1;
    const rows = Math.max(2, Math.ceil(H / CELL_SIZE)) + 1;
    const cellW = W / (cols - 1);
    const cellH = H / (rows - 1);

    const { xs, ys, pr } = this.buffers(cols * rows);
    const active = this.active;
    active.length = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        this.warp(col * cellW, row * cellH, col, row, cols, rows, mouse, ripples, xs, ys, pr, i);
      }
    }

    const { r: ir, g: ig, b: ib } = this.ink;
    const { r: ar, g: ag, b: ab } = this.accent;
    const baseStroke = `rgba(${ir},${ig},${ib},${this.inkAlpha})`;

    // Pass 1: every calm segment in one path
    ctx.beginPath();
    ctx.lineCap = 'butt';
    const segment = (a: number, b: number) => {
      if (pr[a] > 0.001 || pr[b] > 0.001) {
        active.push(a, b);
        return;
      }
      ctx.moveTo(xs[a], ys[a]);
      ctx.lineTo(xs[b], ys[b]);
    };
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        if (col < cols - 1) segment(i, i + 1);
        if (row < rows - 1) segment(i, i + cols);
      }
    }
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Pass 2: segments near the cursor get their own color/width
    for (let k = 0; k < active.length; k += 2) {
      const a = active[k];
      const b = active[k + 1];
      const avg = (pr[a] + pr[b]) / 2;
      const s = avg * avg * (3 - 2 * avg);
      ctx.beginPath();
      ctx.moveTo(xs[a], ys[a]);
      ctx.lineTo(xs[b], ys[b]);
      ctx.strokeStyle = rgba(this.ink, this.inkAlpha, this.accent, 0.9, s);
      ctx.lineWidth = 0.8 + 0.7 * s;
      ctx.stroke();
    }

    // Nodes: calm ones batched, active ones with glow
    ctx.beginPath();
    const count = cols * rows;
    for (let i = 0; i < count; i++) {
      if (pr[i] > 0.001) continue;
      ctx.moveTo(xs[i] + NODE_BASE_RADIUS, ys[i]);
      ctx.arc(xs[i], ys[i], NODE_BASE_RADIUS, 0, Math.PI * 2);
    }
    ctx.fillStyle = `rgba(${ir},${ig},${ib},${this.inkAlpha * 1.5})`;
    ctx.fill();

    for (let i = 0; i < count; i++) {
      const p = pr[i];
      if (p <= 0.001) continue;
      const s = p * p * (3 - 2 * p);
      const radius = NODE_BASE_RADIUS + (NODE_ACTIVE_RADIUS - NODE_BASE_RADIUS) * s;

      if (s > 0.3) {
        // Flat translucent halo — a radial gradient per node per frame was the costliest part of the loop
        ctx.beginPath();
        ctx.arc(xs[i], ys[i], radius + 4 * ((s - 0.3) / 0.7), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${(s * 0.14).toFixed(3)})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(xs[i], ys[i], radius, 0, Math.PI * 2);
      ctx.fillStyle = rgba(this.ink, this.inkAlpha * 1.5, this.accent, 1, s);
      ctx.fill();
    }

    for (const r of ripples) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0, r.radius), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(r.opacity * 0.32).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /** Same displacement model as the original: cursor bell falloff + ripple wave, edges pinned */
  private warp(
    gx: number,
    gy: number,
    col: number,
    row: number,
    cols: number,
    rows: number,
    mouse: Point,
    ripples: Ripple[],
    xs: Float32Array,
    ys: Float32Array,
    pr: Float32Array,
    i: number,
  ): void {
    const edgeMargin = 1.5;
    const colPin = Math.min(col / edgeMargin, (cols - 1 - col) / edgeMargin, 1);
    const rowPin = Math.min(row / edgeMargin, (rows - 1 - row) / edgeMargin, 1);
    const pin = colPin * colPin * rowPin * rowPin;

    const dx = gx - mouse.x;
    const dy = gy - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    pr[i] = Math.max(0, 1 - dist / INFLUENCE_RADIUS) * pin;

    let rx = 0;
    let ry = 0;
    for (const r of ripples) {
      const rdx = gx - r.x;
      const rdy = gy - r.y;
      const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
      const diff = rdist - r.radius;
      if (Math.abs(diff) < RIPPLE_WAVE_WIDTH) {
        const strength = (1 - Math.abs(diff) / RIPPLE_WAVE_WIDTH) * r.opacity * 18 * pin;
        const angle = Math.atan2(rdy, rdx);
        const sign = diff < 0 ? 1 : -1;
        rx += Math.cos(angle) * strength * sign;
        ry += Math.sin(angle) * strength * sign;
      }
    }

    if (dist < INFLUENCE_RADIUS && dist > 0 && pin > 0) {
      const t = dist / INFLUENCE_RADIUS;
      const eased = t < 0.01 ? 0 : (1 - t) * (1 - t) * Math.min(1, dist / 60);
      const amount = eased * MAX_WARP * pin;
      const angle = Math.atan2(dy, dx);
      xs[i] = gx - Math.cos(angle) * amount + rx;
      ys[i] = gy - Math.sin(angle) * amount + ry;
      return;
    }

    xs[i] = gx + rx;
    ys[i] = gy + ry;
  }

  private buffers(size: number): { xs: Float32Array; ys: Float32Array; pr: Float32Array } {
    if (this.xs.length < size) {
      this.xs = new Float32Array(size);
      this.ys = new Float32Array(size);
      this.pr = new Float32Array(size);
    }
    return { xs: this.xs, ys: this.ys, pr: this.pr };
  }

  // --- sizing & colors --------------------------------------------------------------

  private resize(): void {
    const canvas = this.canvasRef().nativeElement;
    // Thin faint lines under a vignette: 1.5× is visually the same as 2× and ~45% fewer pixels
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    canvas.width = Math.round(this.width * this.dpr);
    canvas.height = Math.round(this.height * this.dpr);
    this.renderDots();
  }

  private renderDots(): void {
    const off = document.createElement('canvas');
    off.width = Math.round(this.width * this.dpr);
    off.height = Math.round(this.height * this.dpr);
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.scale(this.dpr, this.dpr);
    const { r, g, b } = this.ink;
    ctx.fillStyle = `rgba(${r},${g},${b},0.05)`;
    ctx.beginPath();
    for (let x = DOT_SPACING / 2; x < this.width; x += DOT_SPACING) {
      for (let y = DOT_SPACING / 2; y < this.height; y += DOT_SPACING) {
        ctx.moveTo(x + 0.7, y);
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    this.dots = off;
  }

  private readColors(): void {
    const style = getComputedStyle(document.documentElement);
    this.accent = parseRgb(style.getPropertyValue('--ember-rgb')) ?? this.accent;
    this.ink = parseRgb(style.getPropertyValue('--ink-rgb')) ?? this.ink;
    // Dark ink on a light background needs a lighter touch
    this.inkAlpha = this.ink.r + this.ink.g + this.ink.b < 200 ? 0.09 : 0.13;
  }
}

function parseRgb(value: string): Rgb | null {
  const parts = value.split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function rgba(base: Rgb, baseA: number, active: Rgb, activeA: number, t: number): string {
  const r = Math.round(base.r + (active.r - base.r) * t);
  const g = Math.round(base.g + (active.g - base.g) * t);
  const b = Math.round(base.b + (active.b - base.b) * t);
  const a = baseA + (activeA - baseA) * t;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
