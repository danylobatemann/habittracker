import { DestroyRef, Directive, ElementRef, OnInit, afterNextRender, inject, input } from '@angular/core';

import { guaranteeVisible, prefersReducedMotion, useGsap } from '../../core/animations/gsap';

/**
 * Scroll-triggered reveal (GSAP + ScrollTrigger). Ported from the Sushi project.
 *
 *   <section shReveal>…</section>                       the block itself
 *   <div shReveal=".step" [revealStagger]="0.1">…</div>  children one after another
 *
 * The child selector is resolved once after the first render — for async
 * lists put the directive on each item and offset them with [revealDelay].
 */
@Directive({ selector: '[shReveal]' })
export class RevealDirective implements OnInit {
  readonly shReveal = input<string>('');
  readonly revealY = input<number>(28);
  readonly revealStagger = input<number>(0.08);
  readonly revealDelay = input<number>(0);
  readonly revealStart = input<string>('top 88%');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reduced = prefersReducedMotion();

  constructor() {
    afterNextRender(() => this.animate());
  }

  /** Hide targets before the first paint to avoid a flash of content */
  ngOnInit(): void {
    if (this.reduced) return;
    for (const el of this.targets()) el.style.opacity = '0';
  }

  private animate(): void {
    const elements = this.targets();
    const host = this.host.nativeElement;
    // Children rendered by @for appear after ngOnInit, so the host may have been hidden instead
    if (!elements.includes(host)) host.style.opacity = '';

    if (this.reduced) {
      for (const el of elements) el.style.opacity = '';
      return;
    }

    const { gsap } = useGsap();
    const tween = gsap.fromTo(
      elements,
      { opacity: 0, y: this.revealY() },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        delay: this.revealDelay(),
        ease: 'power3.out',
        stagger: this.revealStagger(),
        clearProps: 'opacity,transform',
        scrollTrigger: { trigger: host, start: this.revealStart(), once: true },
      },
    );

    const cancelFailsafe = guaranteeVisible(elements, () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      for (const el of elements) {
        el.style.opacity = '';
        el.style.transform = '';
      }
    });

    this.destroyRef.onDestroy(() => {
      cancelFailsafe();
      tween.scrollTrigger?.kill();
      tween.kill();
    });
  }

  private targets(): HTMLElement[] {
    const selector = this.shReveal();
    const host = this.host.nativeElement;
    if (!selector) return [host];
    const found = Array.from(host.querySelectorAll<HTMLElement>(selector));
    return found.length ? found : [host];
  }
}
