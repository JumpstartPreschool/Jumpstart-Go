import { normalizeEmail, normalizeMobile } from '../../domain/contact'
import type { GuardianKind, PersonInput } from './api'

/**
 * Who can be on a child's record (PRD D26): parents (mother, father, legal guardian) and family who can collect.
 * Grandparents, aunts and uncles can say which side of the family. Anyone else is a third person with a one-trip link.
 */
export const RELATION_GROUPS = [
  { title: 'Parents', relations: ['Mother', 'Father', 'Legal guardian'] },
  { title: 'Grandparents', relations: ['Grandmother', 'Grandfather'] },
  { title: 'Aunts and uncles', relations: ['Aunt', 'Uncle'] },
  { title: 'Brothers and sisters', relations: ['Elder sister', 'Elder brother'] },
  { title: 'Other family', relations: ['Cousin', 'Other relative'] },
] as const
export type Relation = (typeof RELATION_GROUPS)[number]['relations'][number]
export const PARENT_RELATIONS: readonly string[] = RELATION_GROUPS[0].relations
export const SIDED: readonly string[] = ['Grandmother', 'Grandfather', 'Aunt', 'Uncle']
export type Side = '' | "mother's side" | "father's side"

/** Parent or family, from the relation ("Aunt, father's side" is family). */
export const kindOf = (relation: string): GuardianKind => (PARENT_RELATIONS.includes(relation.split(',')[0]!.trim()) ? 'parent' : 'family')

/** "Grandmother, mother's side", or the relation as typed for Other relative. */
export function relationLabel(relation: string, side: Side = '', other = ''): string {
  const base = relation === 'Other relative' ? other.trim() : relation
  return SIDED.includes(relation) && side ? `${base}, ${side}` : base
}

/** Someone being added to a child's record, before it's saved. */
export interface PersonDraft {
  key: string
  /** Set when linking someone already here (then only the relation is ours to choose). */
  linkedId?: string
  linkedNote?: string
  name: string
  email: string
  phone: string
  abroad: boolean
  appAccess: boolean
  relation: string
}

export const blankPerson = (relation: string): PersonDraft => ({ key: crypto.randomUUID(), name: '', email: '', phone: '', abroad: false, appAccess: true, relation })

/**
 * Field errors for one person (keys: name, email, phone), with the email already taken by someone else on the list or
 * at the school reported as "link them instead".
 */
export function personErrors(p: PersonDraft, emailTaken: (email: string) => boolean): Partial<Record<'name' | 'email' | 'phone', string>> {
  if (p.linkedId) return {}
  const e: Partial<Record<'name' | 'email' | 'phone', string>> = {}
  if (p.name.trim().split(/\s+/).filter(Boolean).length < 2) e.name = 'First and last name.'
  const email = p.email.trim() ? normalizeEmail(p.email) : null
  if (p.appAccess && !email) e.email = p.email.trim() ? 'Check the email address.' : 'An email is needed for app access.'
  else if (p.email.trim() && !email) e.email = 'Check the email address.'
  else if (email && emailTaken(email)) e.email = 'Already here. Use Link someone already here.'
  if (p.phone.trim() && !normalizeMobile(p.phone)) e.phone = p.abroad ? 'Start with + and the country code.' : '10-digit mobile, or + and a country code.'
  if (!p.appAccess && !p.phone.trim()) e.phone = 'Add a mobile, or turn on app access.'
  return e
}

/** The record as the database takes it (admin_save_child, admin_add_guardian). */
export function toInput(p: PersonDraft): PersonInput {
  const kind = kindOf(p.relation)
  if (p.linkedId) return { id: p.linkedId, relation: p.relation, kind }
  return {
    full_name: p.name.trim().replace(/\s+/g, ' '),
    email: p.email.trim() ? normalizeEmail(p.email) : null,
    phone: p.phone.trim() ? normalizeMobile(p.phone) : null,
    abroad: kind === 'parent' && p.abroad,
    app_access: p.appAccess,
    relation: p.relation,
    kind,
  }
}

/** At least one person who lives in India must be able to collect from the gate. */
export const someoneHere = (people: PersonDraft[]) => people.some((p) => p.linkedId || !p.abroad || kindOf(p.relation) === 'family')
