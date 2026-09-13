import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Cursor spotlight on a card: writes the pointer position into `--mx/--my`
 * and toggles `--spot-o`. The look lives in styles.css (`.spotlight`).
 * Mouse only; one rAF-coalesced write per frame.
 *
 *   <article class="panel" shSpotlight>…</article>
 */
@Directive({
  selector: '[shSpotlight]',
  host: { class: 'spotlight' },
})
export class SpotlightDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

      let frame = 0;
      let x = 0;
      let y = 0;

      const onMove = (event: PointerEvent) => {
        x = event.clientX;
        y = event.clientY;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const rect = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${x - rect.left}px`);
          el.style.setProperty('--my', `${y - rect.top}px`);
        });
      };
      const onEnter = () => el.style.setProperty('--spot-o', '1');
      const onLeave = () => el.style.setProperty('--spot-o', '0');

      el.addEventListener('pointermove', onMove, { passive: true });
      el.addEventListener('pointerenter', onEnter);
      el.addEventListener('pointerleave', onLeave);

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointerleave', onLeave);
      });
    });
  }
}
