# SyncHabit

Геймифицированный трекер привычек «для компании»: зовёшь друзей по инвайт-ссылке, отмечаетесь вместе, соревнуетесь в мини-лидерборде и видите прогресс друг друга в реальном времени.

**Angular 22** (standalone, Signals, zoneless, OnPush) · чистый CSS (mobile-first, CSS-переменные, тёмная/светлая тема) · `@angular/animations` + **GSAP**.

## Возможности

- **Комнаты привычек** — у каждой привычки есть инвайт-ссылка. Друг логинится (или регистрируется), попадает обратно на инвайт и вступает. Режимы *Team* (общий прогресс к вершине) и *Versus* (гонка в лидерборде).
- **Умные кулдауны** — таймер считается по **серверному** времени (синхронизация сдвига часов), кнопка «Check in» блокируется до конца кулдауна. Сервер валидирует повторно (`COOLDOWN_ACTIVE`), check-in идемпотентен (`Idempotency-Key`).
- **Realtime** — WebSocket с автопереподключением (экспоненциальный backoff с jitter), пинг, повторная подписка на комнаты и сверка состояния при возврате во вкладку. Лидерборд переставляется FLIP-анимацией, лента активности обновляется вживую.
- **Optimistic UI с откатом** — check-in, создание/удаление привычек, настройки уведомлений применяются мгновенно и откатываются при ошибке.
- **HTTP-слой** — интерцепторы: JWT, refresh по 401 (одна очередь на все параллельные запросы), глобальная обработка ошибок с тостами.
- **Дизайн** — глубокая тёмная тема в палитре ночной горы (звёздное небо, снег, оранжевая вершина на закате), неоновое свечение за курсором, фон KineticGrid, кнопки SpinningBorder, верхняя панель FloatingDock, skeleton-лоадеры, stagger, переходы между роутами, конфетти.

## Страницы

| Путь | Что там |
| --- | --- |
| `/` | Лендинг |
| `/login`, `/register` | Авторизация |
| `/dashboard` | Круговой прогресс, стрики, таймеры кулдаунов, создание привычек |
| `/habits/:habitId` | Комната: аватары онлайн, лидерборд, лента, командный прогресс |
| `/invite/:token` | Превью приглашения и вступление |
| `/profile` | Аккаунт, уведомления, тема, смена пароля |

## Структура

```
src/app/
  core/       api, auth (guards, tokens), http (interceptors, ApiError), realtime,
              time (синхронизация серверных часов), models, mock (in-browser backend)
  features/   landing, auth, dashboard, habits (store + компоненты), room, invite, profile, not-found
  layout/     kinetic-grid, floating-dock, cursor-glow, toast-outlet
  shared/     components, directives, pipes, services, utils
```

Вся логика в сервисах/сторах (`HabitsStore`, `RoomStore`, `AuthService`, `RealtimeService`…), компоненты только отображают состояние.

## Запуск

```bash
npm install
npm start          # http://localhost:4200 — dev, с mock-бэкендом
npm run build:demo # статическая сборка с mock-бэкендом (GitHub Pages / Netlify)
npm run build      # продакшен-сборка для реального бэкенда (mock вырезан из бандла)
```

### Демо-режим (mock-бэкенд)

В dev и demo-сборках все REST- и WebSocket-вызовы обслуживает эмулятор в браузере (`core/mock`) — с задержками, валидацией, кулдаунами и «друзьями», которые сами отмечаются. Данные хранятся в `localStorage`.

- Демо-аккаунт: **demo@synchabit.app** / **summit2026** (кнопка «Use demo account» на странице входа)
- Демо-инвайт: `/invite/ember-peak`
- Проверка синхронизации: откройте одну комнату в двух вкладках
- Chaos-режим (случайные сетевые/серверные ошибки для проверки отката):
  `localStorage.setItem('synchabit.mock.chaos', '0.3')`, выключить — `removeItem`

### Реальный бэкенд

`src/environments/environment.ts`:

```ts
apiUrl: '/api/v1',   // базовый REST URL
wsUrl: '/ws',        // WebSocket (относительный путь → текущий хост, ws/wss)
useMockApi: false,
appUrl: '',          // origin для инвайт-ссылок, пусто = location.origin
```

В продакшен-конфигурации `angular.json` подменяет `mock.providers.ts` на пустой `mock.providers.off.ts`, так что код эмулятора не попадает в бандл.

## Контракт API

Ошибки: `{ "error": { "code", "message", "fieldErrors?": [{ "field", "message" }], "details?" } }`
Коды: `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `FORBIDDEN`, `NOT_FOUND`, `COOLDOWN_ACTIVE`, `INVITE_EXPIRED`, `ALREADY_MEMBER` и др. (`core/models/api.models.ts`).

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/time` | Серверное время (синхронизация часов) |
| POST | `/auth/login`, `/auth/register` | → `{ user, tokens }` |
| POST | `/auth/refresh` | `{ refreshToken }` → новые токены |
| POST | `/auth/logout` | Отзыв refresh-токена |
| GET / PATCH | `/me` | Профиль |
| PUT | `/me/password` | `{ currentPassword, newPassword }` |
| GET / PUT | `/me/notifications` | Настройки уведомлений |
| GET / POST | `/habits` | Список / создание |
| DELETE | `/habits/:id` | Удаление (владелец) |
| POST | `/habits/:id/check-ins` | Check-in, заголовок `Idempotency-Key` |
| POST | `/habits/:id/invites` | Создать инвайт-ссылку |
| GET | `/rooms/:habitId` | Комната: участники, активность |
| DELETE | `/rooms/:habitId/members/me` | Выйти из комнаты |
| GET | `/invites/:token` | Превью инвайта |
| POST | `/invites/:token/accept` | Вступить → `{ habitId }` |

Токены: `Authorization: Bearer <accessToken>`. Access-токен живёт в памяти, refresh — в `localStorage` («запомнить меня») или `sessionStorage`.

**WebSocket** `wsUrl?token=<accessToken>`, JSON-фреймы:

- клиент → сервер: `subscribe { habitId }`, `unsubscribe { habitId }`, `ping`
- сервер → клиент: `member.checked_in`, `member.joined`, `member.left`, `member.presence`, `habit.updated`, `pong` — каждое событие несёт `serverTime`

Полные типы — `src/app/core/models/*.ts`.

## Фото горы

Герой-блоки используют `public/images/mountain.jpg`; если файла нет, подставляется векторная `mountain.svg`. Положите своё фото по этому пути, чтобы включить его.
