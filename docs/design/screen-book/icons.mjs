// Builds <symbol> sprites from the lucide icons installed in the app, so no icon path is drawn by hand.
import { pathToFileURL } from 'node:url'
const base = '/Users/ankitsingh/JS_APP_1/node_modules/lucide-react/dist/esm/icons/'
const map = {
  check: 'check', x: 'x', bell: 'bell', clock: 'clock', home: 'house', nav: 'navigation', users: 'users', cal: 'calendar',
  msg: 'message-square', user: 'user', chev: 'chevron-right', down: 'chevron-down', back: 'chevron-left', alert: 'triangle-alert',
  vol: 'volume-2', mute: 'volume-x', out: 'log-out', shield: 'shield-check', spark: 'sparkles', search: 'search', plus: 'plus',
  timer: 'timer', power: 'power', wifi: 'wifi', sun: 'sun', smile: 'baby', reset: 'rotate-ccw', school: 'graduation-cap',
  star: 'star', steth: 'stethoscope', cake: 'cake', thermo: 'thermometer', pencil: 'pencil', mail: 'mail', phone: 'smartphone', link: 'link',
  megaphone: 'megaphone', send: 'send', call: 'phone', gear: 'settings', audit: 'scroll-text', headset: 'headset', adduser: 'user-plus',
  lock: 'lock', trash: 'trash', chat: 'message-circle', copy: 'copy', pin: 'map-pin', key: 'key-round', login: 'log-in', inbox: 'inbox',
  swap: 'arrow-left-right', info: 'info', calx: 'calendar-x', hand: 'hand', building: 'building', done: 'circle-check', history: 'rotate-ccw-clock',
  bellring: 'bell-ring', calclock: 'calendar-clock', brick: 'shapes', puzzle: 'puzzle', book: 'book-open', househeart: 'house-heart', sprout: 'sprout', backpack: 'backpack',
  userround: 'user-round', usersround: 'users-round', grand: 'glasses', heart: 'heart', shielduser: 'shield-user', cousin: 'user-round-plus', userpen: 'user-pen', globe: 'globe', handheart: 'hand-heart',
}
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
let out = ''
for (const [id, name] of Object.entries(map)) {
  const mod = await import(pathToFileURL(base + name + ".mjs")); const __iconData = mod.__iconData; if (!__iconData) { console.error("missing", name, Object.keys(mod)); continue }
  const inner = __iconData.node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('')
  out += `    <symbol id="i-${id}" viewBox="0 0 24 24">${inner}</symbol>\n`
}
process.stdout.write(out)
