# Design System

**Status:** Rebuilt 2026-09-24 to match the owner-approved Screen Book v3. The tokens live in code, in [src/styles/tokens.css](../../src/styles/tokens.css) and the Tailwind theme in [src/styles/app.css](../../src/styles/app.css); this page explains them. Every screen in the app uses these tokens and the components below. Pages don't define their own colours, sizes or buttons.

## Direction
**Calm, solid and warm** (owner's corrections, 2026-09-24, replacing the earlier "rainbow glass"):
- Solid, readable surfaces on a warm canvas. The logo's rainbow shows only as a faint whisper behind the page, on child avatars and on the handoff-code tiles.
- **No gradients, glow or shine.** Buttons are solid with a darker lip that presses down; hover is a real colour change.
- **Icons, not colours**, tell roles and class levels apart (the same lucide icons as the Screen Book). Colour is never the only signal.
- **Plus Jakarta Sans only**, with emphasis in bold or italic of the same font.
- Floating layers only (the top bar, toasts, the on-duty bar) are lightly frosted. Content cards are solid. Blur turns solid when it isn't supported or when Reduce Transparency is on.
- Light and dark are designed separately. Dark is a calm night sky, with surfaces that step lighter as they rise.
- The red smiling star from the logo (owner, 2026-09-26: back to red) is the friendly mark for welcome, empty and loading moments, the map pin and the app icons. The wordmark keeps its own small stars.

## Logo
- **Files:** `public/brand/logo.webp` (light), `logo-dark.webp` (dark theme, with the dotted flight path lightened so it stays visible) and `star.webp` (the smiling star). Transparent masters are in [brand/](brand/): the wordmark at 1796×584 and the star.
- **App icons:** the red smiling star on white. `apple-touch-icon.png` (180, opaque, because iOS rounds the corners), `icon-192.png` and `icon-512.png`, `icon-maskable-512.png` (the star inside the 80% safe zone), and `favicon.png` (64).
- **Where it appears:** every top bar, Start duty, the login screen, the third person's link page (large, since a stranger opening a WhatsApp link needs to see it's really from the school), and the school pin on maps (the star).
- **Rules:** never recolour, stretch or crop the wordmark; no busy backgrounds behind it; at least 28 px tall; clear space around it at least the height of the star.

## Colour roles
Semantic tokens; components use only these. Light values shown; dark has its own set in the same file.

| Token | Use | Contrast (checked) |
|---|---|---|
| `canvas`, `surface`, `elevated`, `sunken` | Page, cards and inputs, sheets, tracks and tiles inside cards | |
| `ink`, `ink-2` | Primary and secondary text | 15.9:1 and 7.8:1 on `surface`; dark 15.6:1 and 9.3:1 |
| `ink-3` | Icons, placeholders, non-essential text only | 3.2:1 (non-text) |
| `line`, `line-2` | Dividers and card edges; input edges and button lips | |
| `accent` (+ `-hover`, `-lip`, `-soft`, `-ink`) | Primary: the one next action on a screen; selected state | White text 5.7:1 (dark 4.7:1); `accent-ink` 7.3:1 |
| `secondary` | Area chips and solid labels (ink in light, near-white in dark) | |
| `sun` (+ `-hover`, `-lip`, `-ink`) | Warm accent: friendly secondary actions such as Unmute or Running late | Dark text 11:1 |
| `success` | Success actions ("Yes, I heard it") | White text 5.1:1 |
| `live`, `recent`, `stale` | Freshness (TRK-3), always with an icon and words | ≥ 4.7:1 on their tints |
| `warning` | Off-schedule, short notice, "No coordinator" | ≥ 4.6:1 on `warning-soft` |
| `danger`, `danger-strong` | Errors; `danger-strong` for filled alerts with white text | ≥ 4.8:1 |
| `info` | Informational notices | 7.3:1 on `info-soft` |
| `focus` | The focus ring on every control | |
| `rb-*` rainbow | Child avatars (`childColor`), code tiles, small accents; never text on its own | |

## Type
One family, Plus Jakarta Sans (variable, bundled, Latin and Latin Extended cached for offline). Every text style is a Tailwind class from this scale. Headings balance their line breaks; paragraphs avoid orphans.

| Class | Size | Weight | Use |
|---|---|---|---|
| `text-display` | 36 → 56 px (fluid) | 800, −0.04em | Hero moments (Start duty) |
| `text-h1` | 30 → 42 px (fluid) | 800, −0.035em | Page titles |
| `text-h2` | 22 → 28 px (fluid) | 800, −0.03em | Sheet titles, card headings |
| `text-h3` | 19 px | 800 | List item names, choice titles |
| `text-h4` | 17 px | 750 | Small headings, choice labels |
| `text-lead` | 17 px | 500 | Page descriptions |
| `text-body` | 16 px | 500 | Body text |
| `text-small` | 14 px | | Details, field labels |
| `text-caption` | 13 px | | Pills, hints |
| `text-label` / `kicker` | 12 px | 750, uppercase, +0.08em | Section labels |
| `text-nav` | 12 px | 700 | Tab bar labels |
| `text-numeral` | 22 px | 800, tabular | Times and counts |

Nothing is smaller than 12 px. Inputs use 17 px so iOS never zooms in on focus. Times, codes and counts use tabular figures.

## Space, shape and depth
- **Spacing:** Tailwind's 4-point scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Groups use `gap`, not margins between siblings.
- **Layout:** side gutter 16 / 24 / 32 px (phone / tablet / desktop), which also clears the notch in landscape (`gutter` utility). Content is at most 1180 px wide and centred on wide and ultra-wide screens. Lists are one column on phones and two from 768 px.
- **Radii:** `xs` 8, `sm` 12, `md` 16 (buttons, inputs), `lg` 20 (choices, tiles), `xl` 24 (cards, top bar), `2xl` 32 (large cards, sheets).
- **Elevation:** `shadow-card` for content, `shadow-float` for floating bars and toasts, `shadow-lift` for sheets. Nothing else casts a shadow.
- **Touch:** every target is at least 44 × 44 pt (checked by the QA sweep); the main action of an iPad screen is 64 pt tall.

## Motion
Motion confirms what happened; nobody ever waits for it.
- **Durations:** press 80 ms, hover and colour 150 ms, small entrances 220 ms, sheets and pages 360 ms.
- **Easing:** `ease-standard` for almost everything, `ease-exit` for leaving, `ease-spring` only for small things (the selected-choice tick, toasts).
- **What moves:** buttons and choices press down onto their lip; new pages and sheet steps settle in (fade and rise 8 px); sheets slide up on phones and scale in on iPad; toasts rise in; the star floats; the on-duty dot pulses; the traveller on the map pulses only while LIVE.
- Only `transform` and `opacity` are animated. Hover styles apply only on devices that can hover, so nothing sticks on touch.
- **Reduced motion:** every animation and transition becomes instant; everything still works.

## Components
All in [src/ui](../../src/ui):
- **Button:** primary, secondary, sunshine, success, quiet and danger; md (44), lg (52) and xl (64); icon-only buttons are square. States: hover, pressed, focus, disabled, and loading (keeps its colour, shows a spinner and ignores presses so a double tap can't send twice).
- **TextField, SelectField, SearchField:** label, optional icon, hint or announced error, invalid and disabled states.
- **Tabs:** segmented, with arrow keys, Home and End. On phones it becomes an even two-column grid, so no tab hides off the edge. The area page tabs in AreaShell use the same look.
- **Choice (`.choice`):** pressable tile for roles, classes, levels and programmes; the chosen one gets the accent edge and a tick.
- **Pill:** tags and statuses in neutral, accent, live, warning, danger, recent, stale and solid, with an icon.
- **Avatar:** a person's or child's initial on their own stable colour, or an icon.
- **ListRow:** avatar, name, detail, tags and an action that drops under the text on narrow phones.
- **Sheet and SheetFooter:** native `<dialog>` (focus trap, Escape, backdrop tap). It is a bottom sheet on phones and a centred card on iPad and desktop, with a fixed header and the main action pinned to the bottom.
- **Toast:** confirmations and background news, read out by screen readers. Toasts with an action stay until used.
- **EmptyState, ErrorState, SkeletonList, Notice:** every data screen shows a skeleton while loading, says what is empty and what to do next, and explains errors in plain words with Try again. ErrorState recognises when the device is offline.
- **AreaShell:** skip link, floating top bar (logo, area chip with its icon, account), offline notice, page tabs, then the title with its description and actions.
- **Logo, BrandStar, Mascot; CodeTiles; FreshnessBadge; TripMap; AppNav** (phone tab bar and iPad side rail, used by the design preview).

## Responsive behaviour
Checked automatically on every page and sheet in light and dark at 320, 360, 375, 390, 414 and 430 (phones), 667×375, 844×390 and 932×430 (phones in landscape), 600, 768, 820, 834, 1024 and 1180 (tablets, both orientations), and 1280 to 2560 (desktop). The checks cover horizontal overflow, text under 12 px, targets under 40 px and clipped text.
- Phones: compact top bar (the area label becomes icon-only under 375 px, and the account shows just the avatar), tabs in a two-column grid, one-column lists, bottom sheets with the action pinned in thumb reach.
- iPad: two-column lists, centred sheets, and Start duty in two columns in landscape.
- Desktop and wide: the same layout, centred at a readable width.

## Installed app (PWA)
- Manifest with name, short name, description, standalone display, any orientation, theme and background colours, 192, 512 and maskable icons; iOS Home Screen tags, a translucent status bar and safe-area padding on every screen.
- The service worker caches only the app shell (code, styles, fonts, icons), so the app opens offline and says so. School data always comes live from the server and is never served from a cache.
- **Safe updates:** a new version never reloads the app by itself. A toast offers Update, so a coordinator's iPad is never interrupted during gate duty. Long-running iPads check for a new version every hour.
- Each staff area loads on first use, so a parent's phone doesn't download the admin or duty screens.
