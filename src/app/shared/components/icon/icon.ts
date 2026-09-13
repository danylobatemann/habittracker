import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { HabitIcon } from '../../../core/models/habit.models';

/**
 * The only icon set of the app: outline SVG on a 24×24 grid, 1.7 stroke,
 * round caps, colour inherited via currentColor.
 *
 *   <sh-icon name="flame" />             decorative, hidden from screen readers
 *   <sh-icon name="copy" label="Copy" /> when the icon stands alone and carries meaning
 */
export type UiIconName =
  | 'plus' | 'check' | 'flame' | 'users' | 'link' | 'copy' | 'logout' | 'settings' | 'home'
  | 'grid' | 'sun' | 'moon' | 'bell' | 'lock' | 'user' | 'trophy' | 'bolt' | 'clock'
  | 'arrow-right' | 'arrow-left' | 'x' | 'chevron-down' | 'menu' | 'trash' | 'share' | 'eye'
  | 'eye-off' | 'wifi-off' | 'spark' | 'alert' | 'mail' | 'target' | 'swords' | 'door';

export type IconName = UiIconName | HabitIcon;

@Component({
  selector: 'sh-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
  },
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @switch (name()) {
        <!-- Habit icons -->
        @case ('run') {
          <circle cx="14.5" cy="4.5" r="1.8" />
          <path d="m9 21 2.4-5.2 3.1 2.2V22" />
          <path d="M6.5 11.5 9.4 8.2a2 2 0 0 1 2.3-.5l2.6 1.2 1.7 3 2.5.9" />
          <path d="m11.4 15.8 1.4-4.6" />
          <path d="M8.6 13.4 5 14" />
        }
        @case ('water') {
          <path d="M5.5 3.5h13l-1.6 16a1.7 1.7 0 0 1-1.7 1.5H8.8a1.7 1.7 0 0 1-1.7-1.5Z" />
          <path d="M6.4 11.6c2-1 3.8-1 5.6 0s3.6 1 5.6 0" />
        }
        @case ('book') {
          <path d="M4 5.2A1.7 1.7 0 0 1 5.7 3.5H11v16H5.7A1.7 1.7 0 0 0 4 21.2Z" />
          <path d="M20 5.2a1.7 1.7 0 0 0-1.7-1.7H13v16h5.3a1.7 1.7 0 0 1 1.7 1.7Z" />
        }
        @case ('meditate') {
          <circle cx="12" cy="5" r="2" />
          <path d="M12 9v5" />
          <path d="M6 12.5c2 1.2 4 1.5 6 1.5s4-.3 6-1.5" />
          <path d="M4 19.5c3-2.5 5.5-3 8-3s5 .5 8 3" />
        }
        @case ('code') {
          <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5" />
          <path d="m13.5 4.5-3 15" />
        }
        @case ('sleep') {
          <path d="M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1Z" />
          <path d="M15 4h3.5L15 8h3.5" />
        }
        @case ('dumbbell') {
          <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
        }
        @case ('leaf') {
          <path d="M20.5 3.5c.9 6.6-1.2 11.2-4.5 13.2-3.3 2-7.6 1.3-9.4-1.4-1.7-2.7-.5-6 2.4-7.4 2.6-1.3 5.8-1 8-1.6 1.6-.4 2.8-1.3 3.5-2.8Z" />
          <path d="M4 21c1.4-4.3 4.4-7.7 8.5-9.8" />
        }
        @case ('mountain') {
          <path d="m2.5 20 7-12.5 4 7 2-3.2 6 8.7Z" />
          <path d="m7.4 11.3 2.1 1.4 1.6-1.5" />
        }

        <!-- UI icons -->
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('check') {
          <path d="m4.5 12.5 5 5 10-11" />
        }
        @case ('flame') {
          <path d="M12 2.5c3.4 3.1 6.5 5.9 6.5 10a6.5 6.5 0 0 1-13 0c0-1.7.6-3.1 1.7-4.4.3 1.3 1.1 2.1 2.2 2.3-.3-3.3.8-5.9 2.6-7.9Z" />
        }
        @case ('users') {
          <circle cx="9" cy="8.5" r="3.5" />
          <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
          <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6" />
          <path d="M17.8 14.2a6.2 6.2 0 0 1 3.4 5.8" />
        }
        @case ('link') {
          <path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1" />
          <path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" />
        }
        @case ('copy') {
          <rect x="8.5" y="8.5" width="12" height="12" rx="2.4" />
          <path d="M15.5 8.5V5.9a2.4 2.4 0 0 0-2.4-2.4H5.9a2.4 2.4 0 0 0-2.4 2.4v7.2a2.4 2.4 0 0 0 2.4 2.4h2.6" />
        }
        @case ('logout') {
          <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
          <path d="M10 16.5 5.5 12 10 7.5M5.5 12h10" />
        }
        @case ('settings') {
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4Z" />
        }
        @case ('home') {
          <path d="M3.5 10.5 12 3.5l8.5 7" />
          <path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9" />
        }
        @case ('grid') {
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        }
        @case ('moon') {
          <path d="M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1Z" />
        }
        @case ('bell') {
          <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z" />
          <path d="M10 21h4" />
        }
        @case ('lock') {
          <rect x="4" y="10.4" width="16" height="10.6" rx="2.4" />
          <path d="M7.8 10.4V7.6a4.2 4.2 0 0 1 8.4 0v2.8" />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
        }
        @case ('trophy') {
          <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
          <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
          <path d="M12 14v3.5M8.5 20.5h7M9.5 20.5l.5-3h4l.5 3" />
        }
        @case ('bolt') {
          <path d="M13.5 2.5 4.5 13.5h7l-1 8 9-11h-7Z" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="8.6" />
          <path d="M12 7v5.2l3.2 2" />
        }
        @case ('arrow-right') {
          <path d="M4.5 12h15M13.5 6l6 6-6 6" />
        }
        @case ('arrow-left') {
          <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />
        }
        @case ('x') {
          <path d="M6 6l12 12M18 6 6 18" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('menu') {
          <path d="M4 7h16M4 12h16M4 17h10" />
        }
        @case ('trash') {
          <path d="M4.5 7h15" />
          <path d="M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
          <path d="m6.5 7 .9 12.2a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
        }
        @case ('share') {
          <circle cx="18" cy="5.5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="18.5" r="2.5" />
          <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
        }
        @case ('eye') {
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('eye-off') {
          <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.6-1.3" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
        }
        @case ('wifi-off') {
          <path d="M3.5 3.5l17 17M8.5 16.2a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 4.2-2.3M14.8 10.3A10 10 0 0 1 19 12.6M2 9a15 15 0 0 1 4-2.4M10.5 5.6A15 15 0 0 1 22 9" />
          <path d="M12 20h.01" />
        }
        @case ('spark') {
          <path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z" />
          <path d="M18.5 16.2c.2 1.4.7 1.9 2 2.1-1.3.2-1.8.7-2 2.1-.2-1.4-.7-1.9-2-2.1 1.3-.2 1.8-.7 2-2.1Z" />
        }
        @case ('alert') {
          <path d="M10.3 4 3 16.9A2 2 0 0 0 4.7 20h14.6a2 2 0 0 0 1.7-3.1L13.7 4a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9.5v4" />
          <path d="M12 16.8h.01" />
        }
        @case ('mail') {
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m4 7.5 6.9 4.6a2 2 0 0 0 2.2 0L20 7.5" />
        }
        @case ('target') {
          <circle cx="12" cy="12" r="8.6" />
          <circle cx="12" cy="12" r="4.8" />
          <circle cx="12" cy="12" r="1.2" />
        }
        @case ('swords') {
          <path d="M14.5 17.5 3.5 6.5V3.5h3l11 11" />
          <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
          <path d="M14.5 6.5 17.5 3.5h3v3l-3 3M5 14l-2 2 3 3 2-2M3 21l2-2" />
        }
        @case ('door') {
          <path d="M5 20.5V4.5a1 1 0 0 1 1-1h9v17" />
          <path d="M15 3.5 19 5v15.5H3.5" />
          <path d="M11.5 12h.01" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      width: 1.15em;
      height: 1.15em;
      line-height: 1;
    }

    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  /** Only when the icon stands alone and carries meaning */
  readonly label = input<string>('');
}
