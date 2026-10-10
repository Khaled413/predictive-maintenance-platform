import type { PredictionInputs } from '../../types'
import { clamp, cx } from '../../utils/helpers'
import { usePreferences } from '../../context/PreferencesContext'

type ModelReadings = Pick<
  PredictionInputs,
  'air_temperature' | 'process_temperature' | 'rotational_speed' | 'torque' | 'tool_wear'
>

type ReadingDefinition = {
  key: keyof ModelReadings
  label: string
  unit: string
  min: number
  max: number
  warning: number
  critical: number
  lowerIsRiskier?: boolean
  format?: (value: number) => string
}

const READING_DEFINITIONS: ReadingDefinition[] = [
  {
    key: 'air_temperature',
    label: 'Air temperature',
    unit: 'K',
    min: 297,
    max: 306,
    warning: 301,
    critical: 303,
    format: (value) => `${(value - 273.15).toFixed(1)} °C`,
  },
  {
    key: 'process_temperature',
    label: 'Process temperature',
    unit: 'K',
    min: 306,
    max: 319,
    warning: 312,
    critical: 314,
    format: (value) => `${(value - 273.15).toFixed(1)} °C`,
  },
  {
    key: 'rotational_speed',
    label: 'Rotational speed',
    unit: 'rpm',
    min: 1100,
    max: 1800,
    warning: 1500,
    critical: 1350,
    lowerIsRiskier: true,
    format: (value) => `${Math.round(value)} rpm`,
  },
  {
    key: 'torque',
    label: 'Torque',
    unit: 'Nm',
    min: 25,
    max: 80,
    warning: 55,
    critical: 65,
    format: (value) => `${value.toFixed(1)} Nm`,
  },
  {
    key: 'tool_wear',
    label: 'Tool wear',
    unit: 'min',
    min: 0,
    max: 250,
    warning: 120,
    critical: 180,
    format: (value) => `${Math.round(value)} min`,
  },
]

function readingLevel(value: number, reading: ReadingDefinition) {
  if (reading.lowerIsRiskier) {
    return value <= reading.critical ? 'danger' : value <= reading.warning ? 'warn' : 'ok'
  }
  return value >= reading.critical ? 'danger' : value >= reading.warning ? 'warn' : 'ok'
}

function ModelInputBar({
  value,
  reading,
}: {
  value: number
  reading: ReadingDefinition
}) {
  const { t } = usePreferences()
  const level = readingLevel(value, reading)
  const position = clamp(((value - reading.min) / (reading.max - reading.min)) * 100)
  const colorClass =
    level === 'danger'
      ? 'bg-red-400'
      : level === 'warn'
        ? 'bg-amber-400'
        : 'bg-emerald-400'
  const textClass =
    level === 'danger'
      ? 'text-red-300'
      : level === 'warn'
        ? 'text-amber-300'
        : 'text-emerald-300'

  return (
    <div className="grid min-w-0 grid-cols-[minmax(4.5rem,0.85fr)_auto_minmax(3.5rem,1fr)_6px] items-center gap-2">
      <span className="truncate text-[9px] text-ink-faint">{t(reading.label)}</span>
      <span className={cx('shrink-0 font-mono text-[10px] font-semibold', textClass)}>
        {reading.format?.(value) ?? `${value} ${reading.unit}`}
      </span>
      <div
        className="relative h-[3px] min-w-0 overflow-hidden rounded-full bg-navy-700/80"
        role="meter"
        aria-label={t(reading.label)}
        aria-valuemin={reading.min}
        aria-valuemax={reading.max}
        aria-valuenow={value}
        aria-valuetext={reading.format?.(value) ?? `${value} ${reading.unit}`}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
            colorClass
          )}
          style={{ width: `${position}%` }}
        />
      </div>
      <span aria-hidden="true" className={cx('h-1.5 w-1.5 rounded-full', colorClass)} />
    </div>
  )
}

export default function ModelInputBars({ inputs }: { inputs: ModelReadings }) {
  return (
    <div className="grid gap-y-2.5">
      {READING_DEFINITIONS.map((reading) => (
        <ModelInputBar key={reading.key} value={inputs[reading.key]} reading={reading} />
      ))}
    </div>
  )
}
