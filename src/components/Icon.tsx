import {
  BookOpen, Briefcase, Camera, Code, Coffee, Folder, Globe, Heart, Music, Palette, Rocket, Star, Target, Zap,
  type LucideIcon,
} from 'lucide-react'

export const PROJECT_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  rocket: Rocket,
  globe: Globe,
  book: BookOpen,
  code: Code,
  zap: Zap,
  palette: Palette,
  coffee: Coffee,
  target: Target,
  music: Music,
  briefcase: Briefcase,
  heart: Heart,
  star: Star,
  camera: Camera,
}

export const PROJECT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b']

export function ProjectIcon({ icon, color, size = 28 }: { icon: string; color: string; size?: number }) {
  const Cmp = PROJECT_ICONS[icon] ?? Folder
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, background: `${color}22`, color }}
    >
      <Cmp size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  )
}
