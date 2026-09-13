import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Generated avatar: initials on a hue-based gradient, optional presence dot */
@Component({
  selector: 'sh-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--av-size.px]': 'size()',
    '[style.--av-hue]': 'hue()',
    '[attr.title]': 'name()',
    '[class.has-ring]': 'ring()',
  },
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" width="64" height="64" />
    } @else {
      <span class="initials" aria-hidden="true">{{ initials() }}</span>
      <span class="visually-hidden">{{ name() }}</span>
    }
    @if (online() !== null) {
      <span class="dot" [class.is-online]="online()" aria-hidden="true"></span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      width: var(--av-size);
      height: var(--av-size);
      border-radius: 50%;
      background:
        radial-gradient(120% 120% at 30% 20%, hsl(var(--av-hue) 90% 68% / 0.95), transparent 60%),
        linear-gradient(145deg, hsl(var(--av-hue) 70% 42%), hsl(calc(var(--av-hue) + 40) 60% 18%));
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
      color: #fff;
      font-family: var(--font-display);
      font-size: calc(var(--av-size) * 0.36);
      font-weight: 600;
      letter-spacing: -0.02em;
      user-select: none;
    }

    :host(.has-ring) {
      box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--ember), var(--glow-sm);
    }

    img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }

    .initials { line-height: 1; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }

    .dot {
      position: absolute;
      right: 0;
      bottom: 0;
      width: max(9px, calc(var(--av-size) * 0.26));
      height: max(9px, calc(var(--av-size) * 0.26));
      border-radius: 50%;
      background: var(--text-muted);
      box-shadow: 0 0 0 2px var(--surface-solid);
      transition: background-color 300ms ease, box-shadow 300ms ease;
    }

    .dot.is-online {
      background: #3ddc84;
      box-shadow: 0 0 0 2px var(--surface-solid), 0 0 8px rgba(61, 220, 132, 0.8);
    }
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly hue = input(24);
  readonly src = input<string | null>(null);
  readonly size = input(40);
  /** null → no presence dot */
  readonly online = input<boolean | null>(null);
  readonly ring = input(false);

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join(''),
  );
}
