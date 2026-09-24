import { describe, expect, it } from 'vitest'
import { blankPerson, kindOf, personErrors, relationLabel, someoneHere, toInput } from './family'

const person = (over: Partial<ReturnType<typeof blankPerson>>) => ({ ...blankPerson('Mother'), ...over })
const none = () => false

describe('who is on a child record', () => {
  it('tells parents from family, with the side of the family in the label', () => {
    expect(kindOf('Legal guardian')).toBe('parent')
    expect(kindOf("Grandmother, mother's side")).toBe('family')
    expect(relationLabel('Aunt', "father's side")).toBe("Aunt, father's side")
    expect(relationLabel('Cousin', "father's side")).toBe('Cousin')
    expect(relationLabel('Other relative', '', ' Great-aunt ')).toBe('Great-aunt')
  })
  it('needs a full name, and an email for app access', () => {
    expect(personErrors(person({ name: 'Sneha' }), none).name).toBeTruthy()
    expect(personErrors(person({ name: 'Sneha Kulkarni' }), none).email).toBe('An email is needed for app access.')
    expect(personErrors(person({ name: 'Sneha Kulkarni', email: 'sneha@example.com' }), none)).toEqual({})
  })
  it('keeps someone without the app as a contact with a mobile', () => {
    expect(personErrors(person({ name: 'Asha Kulkarni', appAccess: false }), none).phone).toBe('Add a mobile, or turn on app access.')
    expect(personErrors(person({ name: 'Asha Kulkarni', appAccess: false, phone: '98765 43210' }), none)).toEqual({})
  })
  it('points to linking when the email is already here', () => {
    expect(personErrors(person({ name: 'Sneha Kulkarni', email: 'SNEHA@example.com' }), (e) => e === 'sneha@example.com').email).toMatch(/Link someone already here/)
  })
  it('asks for the country code from abroad', () => {
    expect(personErrors(person({ name: 'Nisha Rao', email: 'n@example.com', abroad: true, phone: '5550123' }), none).phone).toBe('Start with + and the country code.')
    expect(toInput(person({ name: ' Nisha  Rao ', email: 'N@Example.com', abroad: true, phone: '+1 415 555 0123' }))).toEqual({
      full_name: 'Nisha Rao', email: 'n@example.com', phone: '+14155550123', abroad: true, app_access: true, relation: 'Mother', kind: 'parent',
    })
  })
  it('needs someone here to collect: a parent abroad alone is not enough', () => {
    expect(someoneHere([person({ abroad: true })])).toBe(false)
    expect(someoneHere([person({ abroad: true }), person({ relation: 'Grandmother' })])).toBe(true)
    expect(someoneHere([person({ abroad: true, linkedId: 'x' })])).toBe(true)
  })
})
