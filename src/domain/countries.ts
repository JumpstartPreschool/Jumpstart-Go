/**
 * Every country's calling code, for the sign-in number (ITU E.164). Countries that share +1 or +7 with an area code of
 * their own (the Caribbean, Guam) carry it, so people type only the rest. Names come from the browser (Intl), in English.
 */
const CODES =
  'AF93 AX358 AL355 DZ213 AS1684 AD376 AO244 AI1264 AG1268 AR54 AM374 AW297 AU61 AT43 AZ994 BS1242 BH973 BD880 BB1246 ' +
  'BY375 BE32 BZ501 BJ229 BM1441 BT975 BO591 BA387 BW267 BR55 IO246 VG1284 BN673 BG359 BF226 BI257 KH855 CM237 CA1 ' +
  'CV238 BQ599 KY1345 CF236 TD235 CL56 CN86 CX61 CC61 CO57 KM269 CG242 CD243 CK682 CR506 CI225 HR385 CU53 CW599 CY357 ' +
  'CZ420 DK45 DJ253 DM1767 DO1809 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FK500 FO298 FJ679 FI358 FR33 GF594 ' +
  'PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1473 GP590 GU1671 GT502 GG44 GN224 GW245 GY592 HT509 HN504 ' +
  'HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IM44 IL972 IT39 JM1876 JP81 JE44 JO962 KZ7 KE254 KI686 XK383 KW965 ' +
  'KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 ' +
  'MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1664 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 ' +
  'NI505 NE227 NG234 NU683 NF672 KP850 MK389 MP1670 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 ' +
  'PT351 PR1787 QA974 RE262 RO40 RU7 RW250 BL590 SH290 KN1869 LC1758 MF590 PM508 VC1784 WS685 SM378 ST239 SA966 SN221 ' +
  'RS381 SC248 SL232 SG65 SX1721 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 LK94 SD249 SR597 SJ47 SE46 CH41 SY963 ' +
  'TW886 TJ992 TZ255 TH66 TL670 TG228 TK690 TO676 TT1868 TN216 TR90 TM993 TC1649 TV688 VI1340 UG256 UA380 AE971 GB44 ' +
  'US1 UY598 UZ998 VU678 VA39 VE58 VN84 WF681 EH212 YE967 ZM260 ZW263'

export interface Country { iso: string; dial: string; name: string; flag: string }

const names = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
// Two regional-indicator letters make the flag emoji.
const flagOf = (iso: string) => String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)))

export const COUNTRIES: readonly Country[] = CODES.split(' ')
  .map((entry) => {
    const iso = entry.slice(0, 2)
    return { iso, dial: entry.slice(2), name: names?.of(iso) ?? iso, flag: flagOf(iso) }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export const INDIA: Country = COUNTRIES.find((c) => c.iso === 'IN')!

/** The full number (+ and digits) from a country and the digits typed after its code, or null if it can't be one. */
export function fullNumber(country: Country, typed: string): string | null {
  const digits = typed.replace(/\D/g, '').replace(/^0+/, '')
  if (country.iso === 'IN') return /^[6-9][0-9]{9}$/.test(digits) ? `+91${digits}` : null
  const all = country.dial + digits
  return digits.length >= 4 && /^[1-9][0-9]{7,14}$/.test(all) ? `+${all}` : null
}

// The main country for a code several share (+1 United States, +44 United Kingdom).
const MAIN = ['US', 'RU', 'GB', 'IT', 'NO', 'AU', 'MA', 'RE', 'FI', 'GP', 'CW']

/** A stored number split back into its country and the rest (the longest matching code wins; +91 is India). */
export function splitNumber(e164: string): { country: Country; rest: string } {
  const digits = e164.replace(/\D/g, '')
  if (digits.startsWith('91')) return { country: INDIA, rest: digits.slice(2) }
  const country = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length || +MAIN.includes(b.iso) - +MAIN.includes(a.iso)).find((c) => digits.startsWith(c.dial))
  return country ? { country, rest: digits.slice(country.dial.length) } : { country: INDIA, rest: '' }
}

/** "98765 43210" for India; other countries' digits as typed. */
export const formatRest = (country: Country, rest: string) =>
  country.iso === 'IN' && rest.length > 5 ? `${rest.slice(0, 5)} ${rest.slice(5)}` : rest
