import {
  ArrowRightLeft,
  Cog,
  Droplets,
  Factory,
  Fan,
  Flame,
  FlaskConical,
  Layers,
  Package,
  Shuffle,
  Sun,
  Tag,
  Wind,
} from 'lucide-react'
import type { ComponentType, CSSProperties } from 'react'

const TYPE_MAP: Record<
  string,
  {
    icon: ComponentType<{ className?: string; style?: CSSProperties }>
    gradient: string
    glow: string
  }
> = {
  'CNC Lathe': {
    icon: Cog,
    gradient: 'from-slate-600 to-slate-800',
    glow: 'text-slate-300',
  },
  'Injection Molding': {
    icon: FlaskConical,
    gradient: 'from-violet-600 to-blue-800',
    glow: 'text-violet-200',
  },
  Compressor: {
    icon: Wind,
    gradient: 'from-cyan-600 to-blue-900',
    glow: 'text-cyan-200',
  },
  'Conveyor Belt': {
    icon: ArrowRightLeft,
    gradient: 'from-teal-600 to-emerald-900',
    glow: 'text-teal-200',
  },
  'Packaging Machine': {
    icon: Package,
    gradient: 'from-sky-600 to-indigo-800',
    glow: 'text-sky-200',
  },
  Boiler: {
    icon: Flame,
    gradient: 'from-orange-600 to-red-900',
    glow: 'text-orange-200',
  },
  'Mixing Machine': {
    icon: Shuffle,
    gradient: 'from-fuchsia-600 to-purple-900',
    glow: 'text-fuchsia-200',
  },
  'Filling Machine': {
    icon: Droplets,
    gradient: 'from-blue-600 to-sky-800',
    glow: 'text-blue-200',
  },
  Dryer: { icon: Sun, gradient: 'from-yellow-600 to-amber-900', glow: 'text-yellow-200' },
  'Labeling Machine': {
    icon: Tag,
    gradient: 'from-slate-500 to-slate-800',
    glow: 'text-slate-200',
  },
  Palletizer: {
    icon: Layers,
    gradient: 'from-emerald-600 to-teal-900',
    glow: 'text-emerald-200',
  },
  'Air Compressor': {
    icon: Fan,
    gradient: 'from-cyan-500 to-sky-900',
    glow: 'text-cyan-200',
  },
}

export default function MachineVisual({
  type,
  size = 56,
}: {
  type: string
  size?: number
}) {
  const entry = TYPE_MAP[type] ?? {
    icon: Factory,
    gradient: 'from-blue-700 to-slate-800',
    glow: 'text-blue-200',
  }
  const Icon = entry.icon
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${entry.gradient} ring-1 ring-white/15`}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
      <Icon
        className={`relative ${entry.glow}`}
        style={{ width: size * 0.5, height: size * 0.5 }}
      />
    </div>
  )
}
