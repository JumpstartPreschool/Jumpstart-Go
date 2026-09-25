import type { CSSProperties, SVGProps } from 'react'

/**
 * The app's icons: Microsoft Fluent Emoji in 3D (MIT licence, github.com/microsoft/fluentui-emoji), 96 px WebP in
 * public/icons3d. Each is drawn inside an <svg>, so every existing rule that sizes or places icons (`[&_svg]:size-5`,
 * `.btn svg`) keeps working. Decorative by default (hidden from screen readers), like the icons they replace; pass
 * aria-label for an icon that means something on its own. The loading spinner stays a line spinner: it has to spin.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { strokeWidth?: number | string; size?: number | string; style?: CSSProperties }

function icon3d(file: string, name: string) {
  function Icon({ className = '', strokeWidth: _stroke, size, width, height, 'aria-label': label, ...rest }: IconProps) {
    const w = size ?? width ?? 24
    const h = size ?? height ?? 24
    return (
      <svg viewBox="0 0 24 24" width={w} height={h} className={`icon3d ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" {...rest}>
        <image href={`/icons3d/${file}.webp`} width="24" height="24" preserveAspectRatio="xMidYMid meet" />
      </svg>
    )
  }
  Icon.displayName = name
  return Icon
}

// Arrows and chevrons are direction, not pictures: thin line glyphs read cleaner than 3D ones at any size.
export { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'

export const AudioLines = icon3d('studio-microphone', 'AudioLines')
export const Baby = icon3d('baby', 'Baby')
export const Backpack = icon3d('backpack', 'Backpack')
export const Bell = icon3d('bell', 'Bell')
export const BellOff = icon3d('bell-with-slash', 'BellOff')
export const BellRing = icon3d('bell', 'BellRing')
export const BookOpen = icon3d('open-book', 'BookOpen')
export const CalendarClock = icon3d('tear-off-calendar', 'CalendarClock')
export const CalendarDays = icon3d('calendar', 'CalendarDays')
export const CalendarHeart = icon3d('calendar', 'CalendarHeart')
export const CalendarX = icon3d('spiral-calendar', 'CalendarX')
export const Check = icon3d('check-mark', 'Check')
export const CircleAlert = icon3d('red-exclamation-mark', 'CircleAlert')
export const CircleCheck = icon3d('check-mark', 'CircleCheck')
export const CircleSlash = icon3d('prohibited', 'CircleSlash')
export const Clock = icon3d('mantelpiece-clock', 'Clock')
export const Clock3 = icon3d('mantelpiece-clock', 'Clock3')
export const Copy = icon3d('clipboard', 'Copy')
export const Delete = icon3d('cross-mark-button', 'Delete')
export const DoorOpen = icon3d('door', 'DoorOpen')
export const Download = icon3d('inbox-tray', 'Download')
export const Eye = icon3d('eye', 'Eye')
export const FileSpreadsheet = icon3d('bar-chart', 'FileSpreadsheet')
export const FlaskConical = icon3d('test-tube', 'FlaskConical')
export const Glasses = icon3d('glasses', 'Glasses')
export const Globe = icon3d('globe-with-meridians', 'Globe')
export const GraduationCap = icon3d('graduation-cap', 'GraduationCap')
export const Hand = icon3d('raised-hand', 'Hand')
export const HandHeart = icon3d('heart-hands', 'HandHeart')
export const Headset = icon3d('headphone', 'Headset')
export const Heart = icon3d('red-heart', 'Heart')
export const HeartHandshake = icon3d('handshake', 'HeartHandshake')
export const History = icon3d('hourglass-done', 'History')
export const House = icon3d('house', 'House')
export const HouseHeart = icon3d('house-with-garden', 'HouseHeart')
export const Info = icon3d('information', 'Info')
export const KeyRound = icon3d('key', 'KeyRound')
export const Link2 = icon3d('link', 'Link2')
export const LocateFixed = icon3d('compass', 'LocateFixed')
export const Lock = icon3d('locked', 'Lock')
export const LogIn = icon3d('unlocked', 'LogIn')
export const LogOut = icon3d('waving-hand', 'LogOut')
export const Mail = icon3d('envelope', 'Mail')
export const MapPin = icon3d('round-pushpin', 'MapPin')
export const MapPinOff = icon3d('prohibited', 'MapPinOff')
export const MapPinned = icon3d('world-map', 'MapPinned')
export const Megaphone = icon3d('megaphone', 'Megaphone')
export const MessageCircle = icon3d('speech-balloon', 'MessageCircle')
export const MessageSquare = icon3d('left-speech-bubble', 'MessageSquare')
export const MessageSquareText = icon3d('mobile-phone-with-arrow', 'MessageSquareText')
export const MessagesSquare = icon3d('speech-balloon', 'MessagesSquare')
export const MonitorSmartphone = icon3d('mobile-phone', 'MonitorSmartphone')
export const Navigation = icon3d('automobile', 'Navigation')
export const Pencil = icon3d('pencil', 'Pencil')
export const Phone = icon3d('telephone-receiver', 'Phone')
export const Play = icon3d('play-button', 'Play')
export const Plus = icon3d('plus', 'Plus')
export const Power = icon3d('rocket', 'Power')
export const Puzzle = icon3d('puzzle-piece', 'Puzzle')
export const RotateCcw = icon3d('counterclockwise-arrows-button', 'RotateCcw')
export const Save = icon3d('floppy-disk', 'Save')
export const School = icon3d('school', 'School')
export const ScrollText = icon3d('scroll', 'ScrollText')
export const Search = icon3d('magnifying-glass-tilted-left', 'Search')
export const Send = icon3d('envelope-with-arrow', 'Send')
export const Settings = icon3d('gear', 'Settings')
export const Shapes = icon3d('teddy-bear', 'Shapes')
export const ShieldAlert = icon3d('warning', 'ShieldAlert')
export const ShieldCheck = icon3d('shield', 'ShieldCheck')
export const ShieldOff = icon3d('no-entry', 'ShieldOff')
export const ShieldUser = icon3d('shield', 'ShieldUser')
export const Smartphone = icon3d('mobile-phone', 'Smartphone')
export const Sparkles = icon3d('sparkles', 'Sparkles')
export const Sprout = icon3d('seedling', 'Sprout')
export const Star = icon3d('star', 'Star')
export const Sun = icon3d('sun', 'Sun')
export const Sunrise = icon3d('sunrise', 'Sunrise')
export const Tablet = icon3d('laptop', 'Tablet')
export const Timer = icon3d('timer-clock', 'Timer')
export const Trash2 = icon3d('wastebasket', 'Trash2')
export const TriangleAlert = icon3d('warning', 'TriangleAlert')
export const Upload = icon3d('outbox-tray', 'Upload')
export const User = icon3d('person', 'User')
export const UserCheck = icon3d('shield', 'UserCheck')
export const UserMinus = icon3d('no-entry', 'UserMinus')
export const UserPen = icon3d('writing-hand', 'UserPen')
export const UserPlus = icon3d('person', 'UserPlus')
export const UserRound = icon3d('person', 'UserRound')
export const UserRoundPlus = icon3d('person', 'UserRoundPlus')
export const UserX = icon3d('no-entry', 'UserX')
export const Users = icon3d('people-hugging', 'Users')
export const UsersRound = icon3d('people-hugging', 'UsersRound')
export const Utensils = icon3d('fork-and-knife', 'Utensils')
export const Volume2 = icon3d('speaker-high-volume', 'Volume2')
export const Wifi = icon3d('antenna-bars', 'Wifi')
export const WifiOff = icon3d('mobile-phone-off', 'WifiOff')
export const X = icon3d('cross-mark', 'X')
export const XCircle = icon3d('cross-mark-button', 'XCircle')
