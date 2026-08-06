import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  AArrowUp,
  AlertTriangle,
  AlignJustify,
  Archive,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  HardDrive,
  History,
  Info,
  Keyboard,
  Laptop,
  LayoutDashboard,
  LayoutPanelTop,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Monitor,
  Moon,
  Mouse,
  Package,
  Palette,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  Rows2,
  Rows3,
  ScanLine,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  StretchVertical,
  Sun,
  Trash2,
  Type,
  Undo2,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react'

/**
 * Icon registry — one icon = one meaning (Notes/UI.md §10).
 * Pages render <AppIcon name="assign" />; raw lucide imports outside this file
 * are forbidden so duplicate semantics can't creep in.
 */
const REGISTRY = {
  dashboard: LayoutDashboard,
  assets: Package,
  departments: Building2,
  employees: Users,
  assign: UserPlus,
  return: Undo2,
  qr: QrCode,
  scan: ScanLine,
  edit: Pencil,
  delete: Trash2,
  view: Eye,
  search: Search,
  filter: SlidersHorizontal,
  export: Download,
  settings: Settings,
  themeLight: Sun,
  themeDark: Moon,
  history: History,
  location: MapPin,
  calendar: CalendarDays,
  /* settings page — each a distinct glyph, no reuse (one icon = one meaning) */
  appearance: Palette,
  font: Type,
  layout: LayoutPanelTop,
  textSize: AArrowUp,
  profile: UserRound,
  email: Mail,
  role: ShieldCheck,
  lastLogin: Clock,
  signOut: LogOut,
  /* density scale — distinct glyphs, densest → airiest */
  densityCompact: AlignJustify,
  densityNormal: Rows3,
  densityLarge: Rows2,
  densitySpacious: StretchVertical,
  /* logs / telemetry */
  logs: ScrollText,
  chart: BarChart3,
  externalLink: ExternalLink,
  refresh: RefreshCw,
  copy: Copy,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  /* status pills (§11) */
  statusAvailable: CheckCircle2,
  statusInDepartment: Building2,
  statusAssigned: UserCheck,
  statusMaintenance: Wrench,
  statusRetired: Archive,
  /* asset category glyphs — one icon = one category */
  catLaptop: Laptop,
  catDesktop: Cpu,
  catMobile: Smartphone,
  catPrinter: Printer,
  catKeyboard: Keyboard,
  catMouse: Mouse,
  catMonitor: Monitor,
  catPenDrive: HardDrive,
  catLocker: Lock,
  catOther: Boxes,
} satisfies Record<string, LucideIcon>

export type AppIconName = keyof typeof REGISTRY

export interface AppIconProps extends Omit<LucideProps, 'ref'> {
  name: AppIconName
}

export function AppIcon({ name, size = 16, strokeWidth = 2, ...rest }: AppIconProps) {
  const Icon = REGISTRY[name]
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden={rest['aria-label'] ? undefined : true} {...rest} />
}
