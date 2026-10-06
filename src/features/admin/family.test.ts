import { describe, expect, it } from 'vitest'
import { blankPerson, kindOf, linkByMobile, personErrors, relationLabel, someoneHere, toInput } from './family'

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
  it('needs a full name, and a mobile for app access', () => {
    expect(personErrors(person({ name: 'Sneha' }), none).name).toBeTruthy()
    expect(personErrors(person({ name: 'Sneha Kulkarni' }), none).phone).toBe('A mobile is needed for app access.')
    expect(personErrors(person({ name: 'Sneha Kulkarni', phone: '98765 43210' }), none)).toEqual({})
  })
  it('keeps someone without the app as a contact with a mobile', () => {
    expect(personErrors(person({ name: 'Asha Kulkarni', appAccess: false }), none).phone).toBe('Add a mobile, or turn on app access.')
    expect(personErrors(person({ name: 'Asha Kulkarni', appAccess: false, phone: '98765 43210' }), none)).toEqual({})
  })
  it('points to linking when the mobile is already here, however it is typed', () => {
    expect(personErrors(person({ name: 'Sneha Kulkarni', phone: '098765-43210' }), (n) => n === '+919876543210').phone).toMatch(/Link someone already here/)
  })
  it('asks for the country code from abroad', () => {
    expect(personErrors(person({ name: 'Nisha Rao', abroad: true, phone: '5550123' }), none).phone).toBe('Start with + and the country code.')
    expect(toInput(person({ name: ' Nisha  Rao ', abroad: true, phone: '+1 415 555 0123' }))).toEqual({
      full_name: 'Nisha Rao', phone: '+14155550123', abroad: true, app_access: true, relation: 'Mother', kind: 'parent',
    })
  })
  it('needs someone here to collect: a parent abroad alone is not enough', () => {
    expect(someoneHere([person({ abroad: true })])).toBe(false)
    expect(someoneHere([person({ abroad: true }), person({ relation: 'Grandmother' })])).toBe(true)
    expect(someoneHere([person({ abroad: true, linkedId: 'x' })])).toBe(true)
  })
  it('links a staff member typed in with their own mobile, so one person holds both roles', () => {
    const staff = [{ id: 's1', full_name: 'Priya Deshpande', phone: '+919876543210', active: true }, { id: 's2', full_name: 'Rohan Joshi', phone: '+919812345678', active: false }]
    const linked = linkByMobile(person({ name: 'Priya D', phone: '98765 43210' }), staff)
    expect(toInput(linked)).toEqual({ id: 's1', relation: 'Mother', kind: 'parent', app_access: true })
    expect(linked.name).toBe('Priya Deshpande')
    // Someone turned off: their number moves to the new person instead (0049).
    expect(linkByMobile(person({ name: 'Rohan J', phone: '98123 45678' }), staff).linkedId).toBeUndefined()
    expect(linkByMobile(person({ name: 'Sneha K', phone: '99887 76655' }), staff).linkedId).toBeUndefined()
  })
})
