# Design System

**Status:** Started in M0 (2026-09-24). The tokens live in code, in [src/styles/tokens.css](../../src/styles/tokens.css); this page explains them.

## Direction
Calm and premium: a warm paper canvas, solid white content surfaces, one clear blue for the next action, and glass only for floating layers (bars, sheets, toasts). The rainbow colours of the Jumpstart logo stay in the logo itself, never as interface colour, so status colours keep their meaning. Light and dark are designed separately.

## Logo
- **Files:** `public/brand/logo.webp` (light), `logo-dark.webp` (dark theme, with the dotted flight path lightened so it stays visible) and `star.webp` (the smiling star). Transparent masters are in [brand/](brand/): the wordmark at 1796×584 and the star.
- **App icons:** the smiling star on white. `apple-touch-icon.png` (180, opaque, because iOS rounds the corners), `icon-192.png` and `icon-512.png`, `icon-maskable-512.png` (the star inside the 80% safe zone), and `favicon.png` (64).
- **Where it appears:** Start duty, the parent's Today header, the third person's link page (large, since a stranger opening a WhatsApp link needs to see it's really from the school), the login screen, and the school pin on maps (the star). Working screens such as the gate queue and the on-duty bar leave it out to keep attention on the children.
- **Rules:** never recolour, stretch or crop the wordmark; no busy backgrounds behind it; at least 28 px tall; clear space around it at least the height of the star.
- **Source:** file provided by the owner on 2026-09-24 (1975×796, white background, cut out for the app). A vector original is better for print if one exists.

## Foundations
- **Type:** Figtree (open source, bundled). Sizes on iPad: 34 display, 30 page title, 22 section, 17 body, 15 secondary, 13 caption. Times and codes use tabular numbers.
- **Spacing:** 4-point scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- **Radii:** 12 (medium buttons), 14–18 (large buttons, banners), 20–22 (cards and bars), 26 (dialogs).
- **Touch:** every target at least 44 pt; the main action on an iPad screen is 64 pt tall.
- **Motion:** buttons shrink to 97% when pressed and spring back when released. Reduced motion turns movement off.
- **Glass:** 72% surface with 20 px blur. Solid when the device doesn't support blur or the user asks for reduced transparency.

## Colour roles
| Role | Use | Contrast |
|---|---|---|
| `ink`, `ink-2` | Text, secondary text | ≥ 6.2:1 in both themes |
| `ink-3` | Icons and non-essential text only | — |
| `accent` | The next action | White text 6.2:1 light, 4.8:1 dark |
| `live`, `recent`, `stale` | Freshness (TRK-3), always with an icon and text | ≥ 4.8:1 on their surfaces |
| `flag` | Off-schedule, short notice, warnings | ≥ 5.1:1 |
| `danger`, `danger-strong` | Errors; `danger-strong` for filled alerts with white text | ≥ 5.6:1 |

## Components so far
- **Logo, BrandStar:** the wordmark, which switches to the dark version automatically, and the star ([src/ui/Logo.tsx](../../src/ui/Logo.tsx)).
- **Button:** primary, secondary, quiet and danger variants in md (44), lg (52) and xl (64) sizes, with hover, pressed, focus, disabled and loading states ([src/ui/Button.tsx](../../src/ui/Button.tsx)).
- **Coordinator duty screens:** Start duty checklist, sound check, the on-duty bar with clock, mute and end duty, the now-announcing strip, offline and screen-awake banners, and the end-duty confirmation.
- **FreshnessBadge:** LIVE, RECENT · age, STALE · age, UNAVAILABLE, each with its own colour, icon and text ([src/ui/FreshnessBadge.tsx](../../src/ui/FreshnessBadge.tsx)).
- **TripMap:** MapLibre with OpenFreeMap light and dark styles; travelled route solid, remaining route dotted; the traveller pulses only while LIVE, stops and turns grey when STALE, and disappears when UNAVAILABLE; Recenter after panning ([src/ui/TripMap.tsx](../../src/ui/TripMap.tsx)).
- **Sheet:** bottom sheet on the native `<dialog>`, glass with a solid fallback ([src/ui/Sheet.tsx](../../src/ui/Sheet.tsx)).
