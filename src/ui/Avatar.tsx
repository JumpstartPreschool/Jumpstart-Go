import type { ReactNode } from 'react'

const sizes = { sm: 'size-10', md: 'size-12', lg: 'size-14' }

/** Which 3D figure stands for someone (D39): a child by their boy or girl, an adult by their relation. */
export type PersonKind = 'boy' | 'girl' | 'child' | 'man' | 'woman' | 'old-man' | 'old-woman' | 'person'
const FILE: Record<PersonKind, string> = {
  boy: 'boy', girl: 'girl', child: 'child', man: 'man', woman: 'woman', 'old-man': 'old-man', 'old-woman': 'old-woman', person: 'person',
}

/** A child's figure: boy, girl, or a friendly neutral child when the school hasn't said. */
export const childKind = (gender?: string | null): PersonKind => (gender === 'boy' ? 'boy' : gender === 'girl' ? 'girl' : 'child')

// Relations as families write them, in English and the words used at home in Pune (Aaji, Ajoba, Mausi…).
const OLD_WOMAN = /\b(grand ?mother|grandma|granny|nani|dadi|aaji|aji|ajji|amma ?amma)\b/i
const OLD_MAN = /\b(grand ?father|grandpa|nana|dada|ajoba|aajoba|thatha)\b/i
const WOMAN = /\b(mother|mom|mum|mummy|aai|aunt|aunty|auntie|sister|didi|mausi|maushi|bua|atya|kaki|chachi|mami|wife|nanny|maid|lady|woman|female)\b/i
const MAN = /\b(father|dad|daddy|papa|baba|uncle|brother|bhaiya|dada ji|kaka|chacha|mama|mamu|husband|man|male)\b/i

/** An adult's figure from how they're related to the child; a neutral person when that doesn't say (drivers, staff). */
export function adultKind(relation?: string | null): PersonKind {
  const r = relation ?? ''
  if (OLD_WOMAN.test(r)) return 'old-woman'
  if (OLD_MAN.test(r)) return 'old-man'
  if (WOMAN.test(r)) return 'woman'
  if (MAN.test(r)) return 'man'
  return 'person'
}

/**
 * A person or child as a 3D figure (Fluent Emoji, MIT) on a soft tint of their own stable colour (childColor), or an
 * icon for a role. Decorative: the name is always written next to it.
 */
export function Avatar({ name, color, kind, icon, size = 'md' }: { name: string; color: string; kind?: PersonKind; icon?: ReactNode; size?: keyof typeof sizes }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full shadow-[0_0_0_3px_var(--surface),0_6px_14px_-8px_rgb(22_25_58/0.45)] [&_svg]:size-[55%] ${sizes[size]}`}
      style={{ background: `color-mix(in oklab, ${color} 22%, var(--surface))` }}
      aria-hidden
      title={name}
    >
      {icon ?? <img src={`/icons3d/${FILE[kind ?? 'person']}.webp`} alt="" width={96} height={96} className="size-[78%] translate-y-[6%] object-contain drop-shadow-[0_2px_2px_rgb(22_25_58/0.18)]" draggable={false} />}
    </span>
  )
}
