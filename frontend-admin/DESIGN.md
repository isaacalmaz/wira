# Tenun Laut: Wira Admin design system

Wira Admin is the staff console: operations, finance, customer service. It
is used on a desktop browser (1280–1600px) for hours at a time. It should
feel calm, dense and precise, like a well-made back-office tool rather than
a marketing page.

It uses the same system as the customer app (`frontend-user/DESIGN.md`).
The tokens and UI kit are copied into this app. What differs:

- **Desktop first.** Pages sit in the main column next to the sidebar, with
  max width around `max-w-7xl`. It still has to work at 1024px, and tables
  scroll horizontally inside their card, never the page.
- **Page anatomy:**
  1. `PageHeader` (title + one-line subtitle + actions on the right);
  2. an optional row of `Stat`s;
  3. a filter bar (`Segmented` / search `Input` / `Select`);
  4. the content card or `Table`.
- **Tables** use `Table` from `components/ui` (or `.data-table`):
  - uppercase muted headers;
  - hairline rows;
  - numbers and money in `font-mono`, right-aligned;
  - status as `Badge` with `dot`;
  - row actions as `ghost` / `secondary` `sm` buttons, with destructive
    ones as `danger-soft`.
- **Density:** body `text-[13.5px]`–`text-sm`, `sm` buttons in tables, and
  `md` elsewhere. Use `gap-6` between page sections.
- **Money** (finance, top-ups, payouts) uses `Money` / mono, and gold `pay`
  tones only for money.
- **Destructive actions** always confirm through `ConfirmModal` (a Sheet) or
  a `Sheet` with `tone="danger"`.
- `components/common/UIComponents.jsx` (FormField, Pagination,
  ConfirmModal, StatusBadge) is now a set of wrappers over the kit.
- Extra kit pieces here: `Stat` (label + big mono value + icon) and `Table`.

## Shared foundation (same as the customer app)

Wira's customer app should look like it was designed for Lombok. It should
not look like a generic template. The palette comes from the sea around the
island. The one ornament is the diagonal weave of Sasak tenun cloth, used
sparingly.

## 1. Colour: use semantic classes only

Colours are CSS variables (`src/index.css`) exposed as Tailwind colours
(`tailwind.config.js`). Every semantic class is already correct in dark mode.
Do not add `dark:` variants for colours, except for a real exception such as
the map filter.

| Role | Class | Notes |
|---|---|---|
| Page ground | `bg-ground` | warm off-white / deep sea |
| Surface | `bg-card` | cards, sheets content, inputs |
| Recessed | `bg-sunken` | segmented control track, hover rows, disabled |
| Hairline | `border-line` | the default separator |
| Strong line | `border-line-strong` | inputs, secondary buttons |
| Text | `text-ink` | body and headings |
| Secondary text | `text-ink-muted` | captions, meta, placeholders |
| Brand | `bg-brand` / `hover:bg-brand-hover` / `text-brand-ink` | primary action, links, active nav |
| Brand soft | `bg-brand-soft` + `border-brand-line` | service tiles, selected states |
| Money / WiraPay | `pay`, `pay-ink`, `pay-soft`, `pay-line` | gold, **only for money** (balance, top-up, pay) |
| Error / destructive | `danger`, `danger-ink`, `danger-soft`, `danger-line` | |
| Success | `success`, `success-ink`, `success-soft`, `success-line` | money in, completed |
| Warning | `warning`, `warning-ink`, `warning-soft`, `warning-line` | pending, attention |

Rules:
- **Never** use Tailwind stock colours (`slate-*`, `gray-*`, `blue-*`,
  `cyan-*`, `amber-*`, `orange-*`, `red-*`, `green-*`, `emerald-*`, `rose-*`,
  `yellow-*`, `indigo-*`, `purple-*`, `pink-*`). Map them:
  - `slate`/`gray` → `ink` / `ink-muted` / `line` / `card` / `ground` / `sunken`
  - `blue`/`cyan`/`primary` → `brand`
  - `amber`/`yellow`/`orange` → `pay` (when it is money) or `warning`
  - `red`/`rose` → `danger`
  - `green`/`emerald` → `success`
- `laut-*` / `emas-*` / `bara-*` are fixed raw colours. Use them only on a
  surface that is always the same in both themes, such as the WiraPay card,
  which is always `bg-laut-700`.
- No gradients as fills. No coloured glows. No `shadow-md`/`shadow-lg` on
  cards. A card is separated by its hairline border. Shadows are only for
  things that float (`shadow-sheet`, `shadow-pop`).

## 2. Type

- `font-sans` is Plus Jakarta Sans, and it is already the body default.
- `font-mono` is IBM Plex Mono with tabular digits. Use it for **every amount
  of money**, and for codes, order IDs, phone numbers, times and distances.
  Use `<Money value={n} />` for rupiah.
- Scale (keep to it):

| Size | Use |
|---|---|
| `text-[22px]`–`text-2xl font-extrabold tracking-tight` | page title (via `PageHeader`) |
| `text-[15px] font-bold` | section heading (via `SectionHeader`) |
| `text-[14px] font-semibold` | row titles |
| `text-sm` / `text-[13px]` | body |
| `text-xs` / `text-[11.5px]` | meta |
| `text-[11px] font-semibold uppercase tracking-[0.1em]` | eyebrow labels |

- Headings get `text-balance`. Avoid `font-black`. Avoid all-caps except
  eyebrows.

## 3. Shape and spacing

- Radius:
  - `rounded-card` (16px) for cards
  - `rounded-control` (12px) for inputs and buttons
  - `rounded-tile` (15px) for service tiles
  - `rounded-sheet` (24px) for sheets
  - `rounded-full` only for pills and avatars
- Lay out with `flex`/`grid` + `gap-*`, not margins between siblings.
- Page rhythm: `gap-6` between sections, `gap-3` inside a section.
- Touch targets must be at least 44px (`min-h-11`).

## 4. Components (`src/components/ui`, import from `'../components/ui'`)

- `Button`
  - Variants: `primary | secondary | ghost | danger | danger-soft | pay | on-brand | on-brand-outline`
  - Sizes: `sm | md | lg`; `block` makes it full width
  - Other props: `isLoading`, `leftIcon`, `rightIcon`
  - It uses `min-h`, not a fixed height, and wraps long labels, so a label
    can never be cut in half. Never put fixed `h-*` plus `whitespace-nowrap`
    on a button.
- `Card`
  - `padding`: `none | sm | md | lg`
  - `as` / `onClick` for tappable cards
- `Sheet`: **the only modal**. Replace every hand-made `fixed inset-0`
  overlay with it.
  - It is a bottom sheet on phones and a centred dialog on desktop, with
    focus handling, Esc and scroll lock.
  - Props: `open`, `onClose`, `title`, `description`, `icon`, `tone`,
    `footer`, `size`, `dismissible`, `closeLabel`
  - Put the actions in `footer`, with the primary action **last** in source
    order. On phones the buttons stack full-width with the primary on top
    (as in the approved Modal mockup). On desktop they sit in a row with the
    primary on the right.
- `Field` + `Input` / `Textarea` / `Select`: a label is always visible; do
  not rely on the placeholder as the label. Errors go through `error`.
- `Badge`: status pills
  - `tone`: `neutral | brand | pay | success | warning | danger`
  - `dot` adds a leading status dot
- `Money`: rupiah, mono
  - `sign`: `plus | minus`
  - `tone`: `in | pay | muted`
  - `plain` drops the "Rp" prefix
- `IconTile`: a soft square holding a lucide icon
  - `tone`: `brand | pay | danger | success | neutral`
  - `size`: `sm | md | lg`
- `ListRow`: leading + title + subtitle + trailing
  - `chevron` shows a trailing arrow for navigation rows
  - `as={Link}` makes the row a link
- `PageHeader`: `title`, `subtitle`, `eyebrow`, `back` (true or a path),
  `actions`
- `SectionHeader`: `title` + `action` (e.g. a "see all" link)
- `EmptyState`: `icon`, `title`, `description`, `action`
- `Segmented`: tabs, or filter pills with `scroll`
- `Notice`: an inline info/warning/danger/success box
- `Spinner`
- `components/common/Button` and `Card` are legacy re-exports of the above.
  Either path works.

Icons: `lucide-react`, 18–22px, default stroke. Never use emoji as icons or
decoration.

## 5. Signature details

- **WiraPay card**: `bg-laut-700 text-white rounded-card overflow-hidden`,
  with a `h-2.5 tenun-band` strip on top, and the balance in `font-mono`.
  Actions use `on-brand` / `on-brand-outline` buttons.
- **Service tiles**: the same `brand` soft tile for every service. Pay (and
  anything wallet) gets the `pay` tile. No rainbow of colours per service.
- **Order status**: a `Badge` with a `dot`. Tones:
  - searching or pending = `warning`
  - active or on the way = `brand`
  - completed = `success`
  - cancelled = `danger`
- **Bottom booking panel** (ride/send): `bg-ground rounded-t-sheet shadow-sheet`
  above the map, with a drag handle.

## 6. Copy and behaviour

- This portal has no i18n layer: its text is plain Indonesian in the JSX.
  Keep the existing wording. You may fix an obvious typo, but do not rewrite
  the copy.
- Do not change data fetching, Supabase calls, state logic, routing or
  business rules. This is a visual pass.
