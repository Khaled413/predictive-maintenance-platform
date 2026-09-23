import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  Loader2,
  Plus,
  UploadCloud,
} from 'lucide-react'
import Modal from '../ui/Modal'
import UploadZone from '../ui/UploadZone'
import WhyCard from '../ui/WhyCard'
import { Field, TextInput, SelectInput } from '../ui/Field'
import { useApp } from '../../context/AppContext'
import { cx, seededRandom, clamp } from '../../utils/helpers'
import type { Machine, SensorReading, SensorSeries } from '../../types'
import { formatDate } from '../../utils/helpers'

const MACHINE_TYPES = [
  'CNC Lathe',
  'Injection Molding',
  'Compressor',
  'Conveyor Belt',
  'Packaging Machine',
  'Boiler',
  'Mixing Machine',
  'Filling Machine',
  'Dryer',
  'Labeling Machine',
  'Palletizer',
  'Air Compressor',
]

interface SensorConfig {
  name: string
  unit: string
  min: number
  max: number
  enabled: boolean
}

const SENSOR_PRESETS: SensorConfig[] = [
  { name: 'Temperature', unit: '°C', min: 40, max: 90, enabled: true },
  { name: 'Vibration', unit: 'mm/s', min: 0.5, max: 6, enabled: true },
  { name: 'Pressure', unit: 'bar', min: 6, max: 12, enabled: false },
  { name: 'Power', unit: 'kW', min: 5, max: 50, enabled: true },
  { name: 'Speed', unit: 'rpm', min: 100, max: 3500, enabled: false },
  { name: 'Torque', unit: 'Nm', min: 40, max: 220, enabled: false },
  { name: 'Position', unit: 'mm', min: 1, max: 40, enabled: false },
  { name: 'Flow', unit: 'L/min', min: 4, max: 12, enabled: false },
  { name: 'Humidity', unit: '% RH', min: 10, max: 45, enabled: false },
  { name: 'Level', unit: '%', min: 40, max: 85, enabled: false },
]

const PROCESS_STEPS = [
  'Data Validation',
  'Feature Processing',
  'Health Score Calculation',
  'Failure Risk Prediction',
  'Maintenance Recommendation',
]

const POINTS = 30
const STEP_DAYS = 2

function buildGeneratedMachine(form: any, sensorsOn: SensorReading[], seed: number): Machine {
  const rnd = seededRandom(seed)
  const healthScore = clamp(Math.round(48 + rnd() * 42), 40, 95)
  const failureRisk = clamp(Math.round(100 - healthScore + (rnd() - 0.4) * 18), 3, 95)

  // Deterministic recommendation
  let recommendation = 'Not Required'
  let maintenanceStatus = 'On Schedule'
  if (failureRisk > 70 || healthScore < 48) {
    recommendation = 'Immediate — Preventive Service'
    maintenanceStatus = 'Overdue'
  } else if (failureRisk > 50 || healthScore < 62) {
    recommendation = 'Inspection'
    maintenanceStatus = 'Due Soon'
  } else if (failureRisk > 34 || healthScore < 78) {
    recommendation = 'Lubrication'
    maintenanceStatus = 'Due Soon'
  }

  // Likely reason from flagged sensors
  const bad = sensorsOn.filter((s) => s.level !== 'green')
  let likelihood = 'No abnormal pattern detected'
  if (bad.length >= 2) {
    likelihood = `${bad[0].name} & ${bad[1].name.toLowerCase()} elevated`
  } else if (bad.length === 1) {
    likelihood = `${bad[0].name} above normal range`
  } else if (healthScore < 65) {
    likelihood = 'Gradual performance degradation'
  }

  const dates: string[] = []
  for (let i = POINTS - 1; i >= 0; i--) dates.push(new Date(Date.now() - i * STEP_DAYS * 86_400_000).toISOString())
  const history = dates.map((date, i) => {
    const t = i / (POINTS - 1)
    return {
      date,
      health: clamp(Math.round(healthScore + (90 - healthScore) * (1 - t) + (rnd() - 0.5) * 5), 15, 99),
      risk: clamp(Math.round(failureRisk + (8 - failureRisk) * (1 - t) + (rnd() - 0.5) * 6), 2, 98),
    }
  })
  const sensorHistory: SensorSeries[] = sensorsOn.map((sens) => ({
    name: sens.name,
    unit: sens.unit,
    data: dates.map((date, i) => ({
      date,
      value: Number((sens.min + ((sens.value - sens.min) / Math.max(1, (sens.max - sens.min) / 10)) * (i / POINTS) + (rnd() - 0.5) * ((sens.max - sens.min) * 0.08)).toFixed(2)),
    })),
  }))

  return {
    id: form.id,
    name: form.name,
    type: form.type,
    status: 'Operational' as const,
    healthScore,
    failureRisk,
    maintenanceStatus,
    recommendation,
    likelihood,
    location: form.location,
    manufacturer: form.manufacturer,
    model: form.model,
    installationDate: form.installationDate,
    lastMaintenance: new Date(Date.now() - (20 + Math.round(rnd() * 30)) * 86_400_000).toISOString(),
    nextMaintenance: new Date(Date.now() + (3 + Math.round(rnd() * 21)) * 86_400_000).toISOString(),
    description: form.description,
    sensors: sensorsOn,
    history,
    sensorHistory,
    events: [],
    custom: true,
  }
}
interface AddMachineModalProps {
  open: boolean
  onClose: () => void
}

export default function AddMachineModal({ open, onClose }: AddMachineModalProps) {
  const { machines, addMachine, notify, refreshTimestamp } = useApp()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    id: '',
    name: '',
    type: 'CNC Lathe',
    location: '',
    installationDate: new Date().toISOString().slice(0, 10),
    manufacturer: '',
    model: '',
    description: '',
  })
  const [sensors, setSensors] = useState<SensorConfig[]>(SENSOR_PRESETS)
  const [customSensor, setCustomSensor] = useState({ name: '', unit: '', min: '', max: '' })
  const [file, setFile] = useState<{
    name: string
    rows: string
    columns: string
    detected: string[]
    dateRange: string
    quality: number
    missing: string
    size: number
  } | null>(null)
  const [processIdx, setProcessIdx] = useState(-1)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<Machine | null>(null)

  const suggestedId = useMemo(() => {
    const prefix = 'M-'
    const nums = machines
      .map((m) => parseInt(m.id.replace(prefix, ''), 10))
      .filter((n) => !isNaN(n))
    const next = nums.length ? Math.max(...nums) + 1 : 13
    return `${prefix}${String(next).padStart(3, '0')}`
  }, [machines])

  useEffect(() => {
    if (open) {
      setStep(1)
      setProcessIdx(-1)
      setProcessing(false)
      setResult(null)
      setFile(null)
      setSensors(SENSOR_PRESETS)
      setCustomSensor({ name: '', unit: '', min: '', max: '' })
      setForm((f) => ({ ...f, id: suggestedId }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = () => {
    if (!processing) onClose()
  }

  const handleFile = (f: File) => {
    const ext = (f.name.split('.').pop() ?? '').toLowerCase()
    const rnd = seededRandom(f.name.length * 31 + 7)

    if (ext === 'xlsx' || ext === 'xls' || ext === 'json') {
      setFile({
        name: f.name,
        rows: `${Math.round(8000 + rnd() * 12000).toLocaleString()}`,
        columns: String(8 + Math.round(rnd() * 4)),
        detected: sensors.filter((s) => s.enabled).map((s) => s.name),
        dateRange: '2025-03-04 → 2026-09-10',
        quality: Math.round(90 + rnd() * 8),
        missing: `${(rnd() * 2.5).toFixed(1)}%`,
        size: f.size,
      })
      return
    }

    // CSV / TXT: read a preview chunk and detect columns + date range
    try {
      const chunk = f.slice(0, 1024 * 1024)
      chunk
        .arrayBuffer()
        .then((buf) => new TextDecoder('utf-8').decode(buf))
        .then((text) => {
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
          const rows = Math.max(0, lines.length - 1)
          const header = lines[0]?.split(',').map((c) => c.trim().replace(/^"|"$/g, '')) ?? []
          let firstDate = ''
          let lastDate = ''
          for (const line of lines.slice(1, Math.min(lines.length, 60))) {
            for (const cell of line.split(',')) {
              const m = cell.match(/^\d{4}-\d{2}-\d{2}/)
              if (m) {
                if (!firstDate) firstDate = m[0]
                lastDate = m[0]
              }
            }
          }
          finalizeParse(f, header, rows, firstDate, lastDate)
        })
        .catch(() => finalizeParse(f, [], 4200, '', ''))
    } catch {
      finalizeParse(f, [], 5000, '', '')
    }
  }

  const finalizeParse = (
    f: File,
    header: string[],
    rows: number,
    firstDate: string,
    lastDate: string,
  ) => {
    const known = [
      'temperature',
      'vibration',
      'pressure',
      'power',
      'speed',
      'torque',
      'position',
      'flow',
      'humidity',
      'level',
    ]
    const detected = header.length
      ? header.filter((h) => known.some((k) => h.toLowerCase().includes(k)))
      : sensors.filter((s) => s.enabled).map((s) => s.name)
    const rnd = seededRandom(f.name.length * 17 + 3)
    const quality = Math.round(86 + rnd() * 13)
    const missing = `${(rnd() * 4.2).toFixed(1)}%`
    setFile({
      name: f.name,
      rows: rows > 0 ? rows.toLocaleString() : `${Math.round(3000 + rnd() * 9000).toLocaleString()}`,
      columns: header.length ? String(header.length) : `${detected.length + 3 + Math.round(rnd() * 2)}`,
      detected: detected.length ? detected : sensors.filter((s) => s.enabled).map((s) => s.name),
      dateRange: firstDate && lastDate ? `${firstDate} → ${lastDate}` : '2025-11-02 → 2026-09-12',
      quality,
      missing,
      size: f.size,
    })
  }
const toggleSensor = (name: string) => {
    setSensors((s) => s.map((x) => (x.name === name ? { ...x, enabled: !x.enabled } : x)))
  }

  const addCustomSensor = () => {
    const name = customSensor.name.trim()
    const unit = customSensor.unit.trim()
    const min = parseFloat(customSensor.min)
    const max = parseFloat(customSensor.max)
    if (!name || isNaN(min) || isNaN(max) || max <= min) return
    setSensors((s) => [...s, { name, unit, min, max, enabled: true }])
    setCustomSensor({ name: '', unit: '', min: '', max: '' })
  }

  const activeSensors = sensors.filter((s) => s.enabled)

  const startProcessing = () => {
    setProcessing(true)
    setProcessIdx(0)
  }

  // Drive the processing simulation
  useEffect(() => {
    if (step !== 4) return
    if (processIdx >= PROCESS_STEPS.length - 1) {
      const t = window.setTimeout(() => {
        const rnd = seededRandom(form.id.length * 41 + form.type.length)
        const readings: SensorReading[] = activeSensors.map((cfg) => {
          const mid = cfg.min + (cfg.max - cfg.min) * 0.55
          const value = Math.round((mid + (rnd() - 0.5) * (cfg.max - cfg.min) * 0.5) * 10) / 10
          return {
            name: cfg.name,
            unit: cfg.unit,
            value,
            min: cfg.min,
            max: cfg.max,
            level: 'green' as const,
            trend: rnd() > 0.6 ? ('up' as const) : ('flat' as const),
          }
        })
        const machine = buildGeneratedMachine(form, readings, form.id.length * 97 + 5)
        setResult(machine)
        setProcessing(false)
        setStep(5)
      }, 800)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setProcessIdx((i) => i + 1), 600 + processIdx * 120)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, processIdx])

  const canNext = {
    1: form.id.trim().length > 0 && form.name.trim().length > 0 && form.type.trim().length > 0,
    2: activeSensors.length > 0,
    3: Boolean(file),
  }[step]

  const onNext = () => {
    if (step === 3) {
      startProcessing()
      return
    }
    setStep((s) => Math.min(5, s + 1))
  }

  const onBack = () => {
    if (step === 4) return
    setStep((s) => Math.max(1, s - 1))
  }

  const submit = () => {
    if (!result) return
    addMachine(result)
    refreshTimestamp()
    notify(
      'success',
      `${result.id} added to fleet`,
      `${result.name} registered with health score ${result.healthScore}%.`,
    )
    onClose()
  }

  const stepLabels = ['Machine Details', 'Sensors', 'Historical Data', 'AI Processing', 'Result']
return (
    <Modal
      open={open}
      onClose={close}
      title="Add Machine to Fleet"
      subtitle="Register equipment and generate its AI health profile"
      size="lg"
      footer={
        step === 5 && result ? (
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={submit}>
              <Plus className="h-3.5 w-3.5" />
              Add {result.id} to Fleet
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={step === 1 ? onClose : onBack}
              disabled={processing}
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 4 && (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={onNext}
                disabled={!canNext || processing}
              >
                Continue
              </button>
            )}
            {step === 4 && (
              <span className="inline-flex items-center gap-2 text-[11px] text-ink-faint">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />
                Processing data…
              </span>
            )}
          </>
        )
      }
    >
      {/* Stepper */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {stepLabels.map((label, i) => {
          const n = i + 1
          const done = n < step
          const current = n === step
          return (
            <React.Fragment key={label}>
              {i > 0 && <span className="h-px w-3 bg-line" />}
              <span
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
                  current
                    ? 'border-sky-400/30 bg-sky-500/15 text-sky-300'
                    : done
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                      : 'border-line bg-navy-900/50 text-ink-faint',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <span className="font-mono">{n}</span>}
                <span className="hidden sm:inline">{label}</span>
              </span>
            </React.Fragment>
          )
        })}
      </div>
{step === 1 && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Machine ID">
            <TextInput
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })}
              placeholder="M-013"
              className="font-mono"
            />
          </Field>
          <Field label="Machine Name">
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="CNC Lathe — Line 2"
            />
          </Field>
          <Field label="Machine Type">
            <SelectInput value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {MACHINE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Location">
            <TextInput
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Zone A — Machining Hall 1"
            />
          </Field>
          <Field label="Installation Date">
            <TextInput
              type="date"
              value={form.installationDate}
              onChange={(e) => setForm({ ...form, installationDate: e.target.value })}
            />
          </Field>
          <Field label="Manufacturer">
            <TextInput
              value={form.manufacturer}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              placeholder="e.g. DMG MORI"
            />
          </Field>
          <Field label="Model">
            <TextInput
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="e.g. NLX 2500SY"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className="input h-20 resize-none py-2.5"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short description of the machine and its role in production."
            />
          </Field>
        </div>
      )}
{step === 2 && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-[12px] text-ink-dim">
            <Cpu className="h-4 w-4 text-sky-400" />
            Select the sensors connected to this machine.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sensors.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => toggleSensor(s.name)}
                className={cx(
                  'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
                  s.enabled
                    ? 'border-sky-400/30 bg-sky-500/10'
                    : 'border-line bg-navy-900/40 opacity-60 hover:opacity-90',
                )}
              >
                <span
                  className={cx(
                    'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                    s.enabled ? 'border-sky-400 bg-sky-500' : 'border-ink-faint',
                  )}
                >
                  {s.enabled && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-ink">{s.name}</span>
                  <span className="block font-mono text-[10px] text-ink-faint">
                    {s.unit} · {s.min}–{s.max}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-line bg-navy-900/40 p-3.5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Add custom sensor
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                className="input"
                placeholder="Name"
                value={customSensor.name}
                onChange={(e) => setCustomSensor({ ...customSensor, name: e.target.value })}
              />
              <input
                className="input"
                placeholder="Unit"
                value={customSensor.unit}
                onChange={(e) => setCustomSensor({ ...customSensor, unit: e.target.value })}
              />
              <input
                className="input"
                placeholder="Min"
                type="number"
                value={customSensor.min}
                onChange={(e) => setCustomSensor({ ...customSensor, min: e.target.value })}
              />
              <input
                className="input"
                placeholder="Max"
                type="number"
                value={customSensor.max}
                onChange={(e) => setCustomSensor({ ...customSensor, max: e.target.value })}
              />
            </div>
            <button type="button" className="btn-ghost btn-sm mt-2.5" onClick={addCustomSensor}>
              <Plus className="h-3.5 w-3.5" />
              Add sensor
            </button>
          </div>
        </div>
      )}
{step === 3 && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-dim">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            Upload historical sensor data to generate the machine health profile. Supported
            formats: CSV, Excel and JSON.
          </p>
          <UploadZone
            accept=".csv,.xlsx,.xls,.json"
            label="Upload historical sensor data"
            hint="Drag & drop or click to browse from your computer"
            onFile={handleFile}
            compact
          />
{file && (
            <div className="animate-fadeUp rounded-2xl border border-line bg-navy-900/50 p-4">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-[18px] w-[18px] text-emerald-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{file.name}</p>
                  <p className="text-[10.5px] text-ink-faint">
                    {(file.size / 1024).toFixed(1)} KB · detected and profiled
                  </p>
                </div>
                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-400" />
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  ['Rows', file.rows],
                  ['Columns', file.columns],
                  ['Date Range', file.dateRange],
                  ['Data Quality', `${file.quality}%`],
                  ['Missing Values', file.missing],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line bg-navy-800/50 px-3 py-2">
                    <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                      {k}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11.5px] font-medium text-ink">
                      {v}
                    </p>
                  </div>
                ))}
<div className="rounded-xl border border-line bg-navy-800/50 px-3 py-2">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Detected Sensors
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {file.detected.slice(0, 5).map((d) => (
                      <span key={d} className="chip">
                        {d}
                      </span>
                    ))}
                    {file.detected.length > 5 && (
                      <span className="chip">+{file.detected.length - 5}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  <span>Data Quality Score</span>
                  <span className="font-mono text-emerald-300">{file.quality}%</span>
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-navy-700/70">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${file.quality}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
{step === 4 && (
        <div className="py-2">
          <div className="rounded-2xl border border-line bg-navy-900/50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-ink">Running AI health profile</p>
              <span className="font-mono text-[11px] text-sky-300">
                {Math.round(((processIdx + 1) / PROCESS_STEPS.length) * 100)}%
              </span>
            </div>
            <div className="space-y-2.5">
              {PROCESS_STEPS.map((p, i) => {
                const done = i < processIdx
                const current = i === processIdx
                return (
                  <div
                    key={p}
                    className={cx(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
                      current
                        ? 'border-sky-400/30 bg-sky-500/10'
                        : done
                          ? 'border-emerald-400/20 bg-emerald-500/5'
                          : 'border-line bg-navy-800/30 opacity-50',
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : current ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-ink-faint" />
                    )}
                    <span
                      className={cx(
                        'flex-1 text-[12px] font-medium',
                        current ? 'text-sky-200' : done ? 'text-emerald-200' : 'text-ink-faint',
                      )}
                    >
                      {p}
                    </span>
                    {current && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                        Running
                      </span>
                    )}
                    {done && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        Complete
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
            <Activity className="h-3.5 w-3.5 text-sky-400" />
            Prototype — simulated AI pipeline. Ready to connect a real model backend later.
          </p>
        </div>
      )}
{step === 5 && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                Health Score
              </p>
              <p
                className={cx(
                  'mt-1 font-mono text-[20px] font-bold',
                  result.healthScore >= 75
                    ? 'text-emerald-300'
                    : result.healthScore >= 60
                      ? 'text-amber-300'
                      : 'text-red-300',
                )}
              >
                {result.healthScore}%
              </p>
            </div>
            <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                Failure Risk · 7d
              </p>
              <p
                className={cx(
                  'mt-1 font-mono text-[20px] font-bold',
                  result.failureRisk >= 70
                    ? 'text-red-300'
                    : result.failureRisk >= 50
                      ? 'text-amber-300'
                      : 'text-emerald-300',
                )}
              >
                {result.failureRisk}%
              </p>
            </div>
            <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                Machine Status
              </p>
              <p className="mt-1.5 text-[12px] font-semibold text-ink">
                {result.failureRisk >= 70 || result.healthScore < 48 ? 'Critical' : result.failureRisk >= 50 ? 'Warning' : 'Operational'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                Maintenance
              </p>
              <p className="mt-1.5 text-[12px] font-semibold text-ink">{result.recommendation}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-navy-900/50 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Machine Health Trend · 60 days
            </p>
            <svg viewBox="0 0 320 60" className="h-14 w-full" preserveAspectRatio="none">
              {result.history
                .filter((_, i) => i % 3 === 0)
                .map((p, i, arr) => {
                  const x = (i / Math.max(1, arr.length - 1)) * 320
                  const y = 54 - (p.health / 100) * 48
                  const poly = arr
                    .map((pp, ii) => `${(ii / Math.max(1, arr.length - 1)) * 320},${54 - (pp.health / 100) * 48}`)
                    .join(' ')
                  return (
                    <g key={p.date}>
                      {i === 0 && <polyline points={poly} fill="none" stroke="#60A5FA" strokeWidth="2" />}
                      {i === arr.length - 1 && (
                        <circle cx={x} cy={y} r="3" fill={result.healthScore >= 75 ? '#34D399' : result.healthScore >= 60 ? '#FBBF24' : '#F87171'} />
                      )}
                    </g>
                  )
                })}
            </svg>
          </div>

          <div className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Likely Failure Factors
            </p>
            <p className="mt-1 text-[12px] font-medium text-ink-dim">{result.likelihood}</p>
          </div>

          <WhyCard
            title={result.failureRisk >= 50 ? `Why is the failure risk ${result.failureRisk}%?` : 'Why is this machine considered healthy?'}
            accent={result.failureRisk >= 70 ? 'danger' : result.failureRisk >= 50 ? 'warning' : 'ok'}
            factors={[
              {
                label: 'Health Trend',
                delta: result.healthScore >= 70 ? 'Stable' : '↓ Slowing',
                tone: result.healthScore >= 70 ? 'flat' : 'down',
                note: result.healthScore >= 70 ? 'Health stable over 30 days' : 'Health declining over last 30 days',
              },
              {
                label: 'Sensor Deviation',
                delta: result.failureRisk >= 50 ? '↑ Elevated' : 'Nominal',
                tone: result.failureRisk >= 50 ? 'up' : 'flat',
                note: result.failureRisk >= 50 ? 'Sensors above normal band' : 'Sensors within normal limits',
              },
              {
                label: 'Experience',
                delta: similarHistory(result.type) ? '↑ Similar' : '—',
                tone: similarHistory(result.type) ? 'up' : 'flat',
                note: similarHistory(result.type)
                  ? 'Similar readings preceded failures on this asset class'
                  : 'No prior failure pattern for this asset class',
              },
            ]}
            conclusion={
              result.failureRisk >= 50
                ? `Recommended action: ${result.recommendation}. Schedule the work in the next maintenance window.`
                : 'No immediate action required. Continue routine monitoring and keep the maintenance cycle on schedule.'
            }
          />
        </div>
      )}
    </Modal>
  )
}

function similarHistory(type: string): boolean {
  return !['CNC Lathe', 'Dryer', 'Conveyor Belt', 'Palletizer'].includes(type)
}