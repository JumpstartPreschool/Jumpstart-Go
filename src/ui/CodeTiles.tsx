const TILE_COLORS = ['var(--rb-red)', 'var(--rb-orange)', 'var(--rb-green)', 'var(--rb-blue)']

/**
 * The 4-digit handoff code, one soft rainbow tile per digit. Dark digits on light tints stay easy to read
 * at arm's length; the digits are also read out as one label for screen readers.
 */
export function CodeTiles({ code, size = 'lg' }: { code: string; size?: 'md' | 'lg' | 'xl' }) {
  const box = size === 'xl' ? 'h-24 w-20 text-[56px] rounded-[26px]' : size === 'lg' ? 'h-16 w-14 text-[36px] rounded-[20px]' : 'h-12 w-10 text-[26px] rounded-[16px]'
  return (
    <div className="flex justify-center gap-2.5" role="img" aria-label={`Handoff code ${code.split('').join(' ')}`}>
      {code.split('').map((digit, i) => (
        <span
          key={i}
          className={`grid place-items-center font-display font-bold leading-none tabular-nums text-ink ${box}`}
          style={{
            background: `color-mix(in oklab, ${TILE_COLORS[i % 4]} 20%, var(--glass-strong))`,
            boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${TILE_COLORS[i % 4]} 45%, transparent)`,
          }}
        >
          {digit}
        </span>
      ))}
    </div>
  )
}
