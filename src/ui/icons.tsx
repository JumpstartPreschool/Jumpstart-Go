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
export { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Delete, LoaderCircle, LogOut, Mail as MailLine, MailCheck, PencilLine, Play as PlayLine, Power as PowerLine, Search, X } from 'lucide-react'

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
