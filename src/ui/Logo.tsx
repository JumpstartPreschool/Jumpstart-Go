/**
 * The Jumpstart wordmark (docs/design/brand). /brand/logo-dark.webp, with the dotted flight path lightened, is kept
 * for the dark theme, which is off for now (tokens.css).
 */
export function Logo({ className = 'h-8' }: { className?: string }) {
  return <img src="/brand/logo.webp" alt="Jumpstart" width={840} height={273} className={`w-auto ${className}`} decoding="async" />
}

/** The smiling star from the logo, for small marks such as the school pin on maps. */
export function BrandStar({ className = 'size-8' }: { className?: string }) {
  return <img src="/brand/star.webp" alt="" aria-hidden width={128} height={128} className={className} decoding="async" />
}

/** The smiling star, gently floating: the friendly mark for welcome, empty and success moments. Still with reduced motion. */
export function Mascot({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <img src="/brand/star.webp" alt="" aria-hidden width={size} height={size} decoding="async"
      className={`float shrink-0 drop-shadow-[0_10px_14px_rgb(22_25_58/0.16)] ${className}`} style={{ width: size, height: size }} />
  )
}
