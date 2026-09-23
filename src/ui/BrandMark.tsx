/** The star from the Jumpstart logo. Interim mark until the owner's original logo files arrive. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M16 3.2l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L16 22.3l-7.4 3.9L10 17.9 4 12l8.3-1.2z"
        fill="var(--brand-orange)"
        stroke="var(--brand-red)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
