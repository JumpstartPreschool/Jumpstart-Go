import type { CSSProperties, SVGProps } from 'react'

/**
 * The app's icons: Microsoft's Fluent UI System Color icons (MIT licence, github.com/microsoft/fluentui-system-icons),
 * flat and multi-coloured, as SVG files in public/iconsc (one file each, so their gradients never clash). Each is drawn inside an <svg>, so every existing rule that sizes or places icons (`[&_svg]:size-5`,
 * `.btn svg`) keeps working. Decorative by default (hidden from screen readers), like the icons they replace; pass
 * aria-label for an icon that means something on its own. The loading spinner stays a line spinner: it has to spin.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { strokeWidth?: number | string; size?: number | string; style?: CSSProperties }

function icon(file: string, name: string) {
  function Icon({ className = '', strokeWidth: _stroke, size, width, height, 'aria-label': label, ...rest }: IconProps) {
    const w = size ?? width ?? 24
    const h = size ?? height ?? 24
    return (
      <svg viewBox="0 0 24 24" width={w} height={h} className={`iconc ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" {...rest}>
        <image href={`/iconsc/${file}.svg`} width="24" height="24" preserveAspectRatio="xMidYMid meet" />
      </svg>
    )
  }
  Icon.displayName = name
  return Icon
}

// Controls, not pictures: arrows, chevrons, close, backspace, sign out and the search glass stay thin line glyphs, like system UI.
export { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Delete, LoaderCircle, LogOut, PencilLine, Play as PlayLine, Power as PowerLine, Search, X } from 'lucide-react'

export const AudioLines = icon('mic', 'AudioLines')
export const Baby = icon('person-heart', 'Baby')
export const Backpack = icon('notebook', 'Backpack')
export const Bell = icon('alert', 'Bell')
export const BellOff = icon('alert', 'BellOff')
export const BellRing = icon('alert-badge', 'BellRing')
export const BookOpen = icon('book-open', 'BookOpen')
export const CalendarClock = icon('calendar-clock', 'CalendarClock')
export const CalendarDays = icon('calendar', 'CalendarDays')
export const CalendarHeart = icon('calendar-people', 'CalendarHeart')
export const CalendarX = icon('calendar-cancel', 'CalendarX')
export const Check = icon('checkmark-circle', 'Check')
export const CircleAlert = icon('error-circle', 'CircleAlert')
export const CircleCheck = icon('checkmark-circle', 'CircleCheck')
export const CircleSlash = icon('dismiss-circle', 'CircleSlash')
export const Clock = icon('clock', 'Clock')
export const Clock3 = icon('clock', 'Clock3')
export const Copy = icon('clipboard', 'Copy')
export const DoorOpen = icon('checkbox-person', 'DoorOpen')
export const Download = icon('arrow-square-down', 'Download')
export const Eye = icon('content-view', 'Eye')
export const FileSpreadsheet = icon('table', 'FileSpreadsheet')
export const FlaskConical = icon('molecule', 'FlaskConical')
export const Glasses = icon('people-home', 'Glasses')
export const Globe = icon('globe', 'Globe')
export const GraduationCap = icon('library', 'GraduationCap')
export const Hand = icon('flag', 'Hand')
export const HandHeart = icon('heart', 'HandHeart')
export const Headset = icon('headset', 'Headset')
export const Heart = icon('heart', 'Heart')
export const HeartHandshake = icon('people-interwoven', 'HeartHandshake')
export const History = icon('history', 'History')
export const House = icon('home', 'House')
export const HouseHeart = icon('people-home', 'HouseHeart')
export const Info = icon('lightbulb', 'Info')
export const KeyRound = icon('lock-shield', 'KeyRound')
export const Link2 = icon('link', 'Link2')
export const LocateFixed = icon('location-ripple', 'LocateFixed')
export const Lock = icon('lock-closed', 'Lock')
export const LogIn = icon('person-available', 'LogIn')
export const Mail = icon('mail', 'Mail')
export const MapPin = icon('location-ripple', 'MapPin')
export const MapPinOff = icon('dismiss-circle', 'MapPinOff')
export const MapPinned = icon('location-ripple', 'MapPinned')
export const Megaphone = icon('megaphone-loud', 'Megaphone')
export const MessageCircle = icon('chat', 'MessageCircle')

// The WhatsApp mark (Simple Icons, CC0): the brand's green glyph on a white disc, so it reads on any button. Used only
// where the action really goes through WhatsApp.
const WHATSAPP_GLYPH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'
export function WhatsApp({ className = '', strokeWidth: _stroke, size, width, height, 'aria-label': label, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size ?? width ?? 24} height={size ?? height ?? 24} className={`iconc ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" {...rest}>
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <path d={WHATSAPP_GLYPH} fill="#25D366" stroke="none" transform="translate(2.6 2.6) scale(0.783)" />
    </svg>
  )
}
export const MessageSquare = icon('comment', 'MessageSquare')
export const MessageSquareText = icon('chat-more', 'MessageSquareText')
export const MessagesSquare = icon('chat-multiple', 'MessagesSquare')
export const MonitorSmartphone = icon('phone-laptop', 'MonitorSmartphone')
export const Navigation = icon('send', 'Navigation')
export const Pencil = icon('edit', 'Pencil')
export const Phone = icon('phone', 'Phone')
export const Play = icon('fast-forward-circle', 'Play')
export const Plus = icon('add-circle', 'Plus')
export const Power = icon('shifts', 'Power')
export const Puzzle = icon('puzzle-piece', 'Puzzle')
export const RotateCcw = icon('arrow-sync', 'RotateCcw')
export const Save = icon('checkmark-circle', 'Save')
export const School = icon('building-people', 'School')
export const ScrollText = icon('document-text', 'ScrollText')
export const Send = icon('send', 'Send')
export const Settings = icon('settings', 'Settings')
export const Shapes = icon('design-ideas', 'Shapes')
export const ShieldAlert = icon('warning', 'ShieldAlert')
export const ShieldCheck = icon('shield-checkmark', 'ShieldCheck')
export const ShieldOff = icon('dismiss-circle', 'ShieldOff')
export const ShieldUser = icon('shield', 'ShieldUser')
export const Smartphone = icon('phone', 'Smartphone')
export const Sparkles = icon('premium', 'Sparkles')
export const Sprout = icon('reward', 'Sprout')
export const Star = icon('star', 'Star')
export const Sun = icon('weather-sunny-low', 'Sun')
export const Sunrise = icon('weather-sunny-low', 'Sunrise')
export const Tablet = icon('phone-laptop', 'Tablet')
export const Timer = icon('clock-alarm', 'Timer')
export const Trash2 = icon('dismiss-circle', 'Trash2')
export const TriangleAlert = icon('warning', 'TriangleAlert')
export const Upload = icon('document-add', 'Upload')
export const User = icon('person', 'User')
export const UserCheck = icon('shield-checkmark', 'UserCheck')
export const UserMinus = icon('person-warning', 'UserMinus')
export const UserPen = icon('person-edit', 'UserPen')
export const UserPlus = icon('person-add', 'UserPlus')
export const UserRound = icon('person', 'UserRound')
export const UserRoundPlus = icon('person-add', 'UserRoundPlus')
export const UserX = icon('person-warning', 'UserX')
export const Users = icon('people', 'Users')
export const UsersRound = icon('people-community', 'UsersRound')
export const Utensils = icon('food', 'Utensils')
export const Volume2 = icon('headphones', 'Volume2')
export const Wifi = icon('wifi', 'Wifi')
export const WifiOff = icon('wifi-warning', 'WifiOff')
export const XCircle = icon('dismiss-circle', 'XCircle')
