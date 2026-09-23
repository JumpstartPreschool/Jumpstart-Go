# Design System

**Status:** Started in M0 (2026-09-24). The tokens live in code, in [src/styles/tokens.css](../../src/styles/tokens.css); this page explains them.

## Direction
**Playful rainbow glass** (owner's direction, 2026-09-24): a preschool app that feels joyful but stays simple and easy to read.
- The logo's rainbow (red, orange, yellow, green, teal, blue, plus violet) drives the decoration: soft glowing backgrounds, a colour for each child, coloured navigation icons, rainbow progress bars and the handoff-code tiles.
- **Frosted glass** for cards (80% opaque, so text reads clearly) and lighter glass for floating bars, sheets and panels, over soft rainbow glows. Everything turns solid when blur isn't supported or reduced transparency is on.
- **Pill buttons with a glow** for the next action; a warm "sunshine" button for friendly secondary actions such as Running late.
- **The smiling star** from the logo is the mascot for hero spots (Start duty, the link page, success states) and the school pin on maps.
- **Status colours keep their meaning.** Live, recent, stale, flags and errors always pair their colour with an icon and words, so the decorative rainbow never changes what they say.
- Light is warm cream; dark is a night sky with twinkling stars. Each is designed separately.
- Layouts are built for iPad first: side rail navigation, two columns in landscape and one in portrait, and floating map panels. Phones get a bottom tab bar and bottom sheets.

## Logo
- **Files:** `public/brand/logo.webp` (light), `logo-dark.webp` (dark theme, with the dotted flight path lightened so it stays visible) and `star.webp` (the smiling star). Transparent masters are in [brand/](brand/): the wordmark at 1796×584 and the star.
- **App icons:** the smiling star on white. `apple-touch-icon.png` (180, opaque, because iOS rounds the corners), `icon-192.png` and `icon-512.png`, `icon-maskable-512.png` (the star inside the 80% safe zone), and `favicon.png` (64).
- **Where it appears:** Start duty, the parent's Today header, the third person's link page (large, since a stranger opening a WhatsApp link needs to see it's really from the school), the login screen, and the school pin on maps (the star). Working screens such as the gate queue and the on-duty bar leave it out to keep attention on the children.
- **Rules:** never recolour, stretch or crop the wordmark; no busy backgrounds behind it; at least 28 px tall; clear space around it at least the height of the star.
- **Source:** file provided by the owner on 2026-09-24 (1975×796, white background, cut out for the app). A vector original is better for print if one exists.

## Foundations
- **Type:** Baloo 2 for headings and big numbers (rounded and playful; made by Ek Type in India, with Devanagari for Hindi and Marathi later), Nunito for body text (rounded, very readable). Both open source and bundled. iPad sizes: 48 hero, 36 page title, 26–28 section, 17–18 body, 15 secondary, 12–13 labels. Times and codes use tabular numbers.
- **Spacing:** 4-point scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- **Radii:** full pills for buttons; 20–26 for tiles and inner panels; 28–36 for cards, bars and sheets.
- **Touch:** every target at least 44 pt; the main action on an iPad screen is 64 pt tall; action tiles are 88 pt.
- **Motion:** buttons squeeze to 95% and spring back; stars twinkle; the mascot floats. Reduced motion turns it all off.
- **Home Screen app:** translucent status bar with safe-area padding on every screen, no rubber-band scrolling, no double-tap zoom or long-press callouts on controls, portrait and landscape.

## Colour roles
| Role | Use | Contrast (checked) |
|---|---|---|
| `ink`, `ink-2` | Text, secondary text | ≥ 7:1 on cards in both themes |
| `ink-3` | Icons and non-essential text only | — |
| `accent` → `accent-2` | The next action (gradient with glow) | White text ≥ 4.6:1 across the whole gradient |
| Sunshine (`rb-yellow` → `rb-orange`) | Friendly secondary actions | Dark brown text ≥ 5.9:1 |
| `rb-*` rainbow | Decoration, child colours, nav icons, code tiles | Never used alone for text |
| `live`, `recent`, `stale` | Freshness (TRK-3), always with an icon and text | ≥ 4.7:1 on their tints |
| `flag` | Off-schedule, short notice, warnings | ≥ 4.6:1 |
| `danger`, `danger-strong` | Errors; `danger-strong` for filled alerts with white text | ≥ 4.8:1 |

## Components so far
- **Logo, BrandStar:** the wordmark, which switches to the dark version automatically, and the star ([src/ui/Logo.tsx](../../src/ui/Logo.tsx)).
- **Backdrop, Mascot:** twinkling rainbow stars and the dotted flight path behind every screen; the floating smiling star ([src/ui/Backdrop.tsx](../../src/ui/Backdrop.tsx)).
- **Button:** primary (blue glow), secondary (glass), sunshine, quiet and danger, in md (44), lg (56) and xl (64); circles when icon-only; hover, pressed, focus, disabled and loading states ([src/ui/Button.tsx](../../src/ui/Button.tsx)).
- **AppNav:** bottom tab bar on phones, floating side rail on iPad, each section in its own rainbow colour ([src/ui/AppNav.tsx](../../src/ui/AppNav.tsx)).
- **CodeTiles:** the 4-digit handoff code, one soft rainbow tile per digit, in three sizes ([src/ui/CodeTiles.tsx](../../src/ui/CodeTiles.tsx)).
- **childColor:** one stable rainbow colour per child, used for avatars and card glows on every screen ([src/ui/childColor.ts](../../src/ui/childColor.ts)).
- **FreshnessBadge:** LIVE, RECENT · age, STALE · age, UNAVAILABLE, each with its own colour, icon and text ([src/ui/FreshnessBadge.tsx](../../src/ui/FreshnessBadge.tsx)).
- **TripMap:** MapLibre with OpenFreeMap light and dark styles; travelled route solid, remaining route dotted; the traveller pulses only while LIVE, stops and turns grey when STALE, and disappears when UNAVAILABLE; the smiling star marks the school; Recenter after panning ([src/ui/TripMap.tsx](../../src/ui/TripMap.tsx)).
- **Sheet:** frosted `<dialog>`: a bottom sheet on phones, a centred floating card on iPad ([src/ui/Sheet.tsx](../../src/ui/Sheet.tsx)).
- **Coordinator duty screens:** Start duty (two columns on iPad landscape), rainbow sound check, the on-duty bar with clock, mute and end duty, the now-announcing strip, offline and screen-awake banners, and the end-duty confirmation.
