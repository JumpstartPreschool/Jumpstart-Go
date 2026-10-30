// Yellow is left out: white initials on it would be hard to read.
const RAINBOW = ['var(--rb-blue)', 'var(--rb-orange)', 'var(--rb-green)', 'var(--rb-red)', 'var(--rb-teal)', 'var(--rb-violet)']

/** A stable rainbow colour per child (keyed by id), so a child looks the same on every screen. */
export function childColor(key: string): string {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return RAINBOW[h % RAINBOW.length]!
}
