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
} from 'lucide-react'
import Modal from '../ui/Modal'
import UploadZone from '../ui/UploadZone'
import { Field, TextInput, SelectInput } from '../ui/Field'
import { useApp } from '../../context/AppContext'
import { cx, seededRandom } from '../../utils/helpers'
import type { Machine, SensorReading, SensorSeries } from '../../types'
import { requestPrediction } from '../../data/predictionApi'
import { machineTypeCode, simulateMachineInputs } from '../../utils/simulatedInputs'

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
  'Generating illustrative sensor display values',
  'Preparing separate simulated model inputs',
  'Running trained ML models',
  'Receiving model outputs',
  'Preparing machine profile',
]

function buildGeneratedMachine(form: any, sensorsOn: SensorReading[]): Machine {
  const modelTypeCode = machineTypeCode(form.type)
  const predictionInputs = simulateMachineInputs(form.id, form.type)
  const sensorSeed = [...form.id].reduce((seed, character) => seed + character.charCodeAt(0), 1)
  const rnd = seededRandom(sensorSeed)
  const sensorHistory: SensorSeries[] = sensorsOn.map((sensor) => ({
    name: sensor.name,
    unit: sensor.unit,
    data: Array.from({ length: 30 }, (_, index) => {
      const progress = index / 29
      const spread = ((sensor.max - sensor.min) * 0.08) / 2
      const value = index === 29
        ? sensor.value
        : sensor.min + (sensor.value - sensor.min) * progress + (rnd() - 0.5) * spread
      return {
        date: new Date(Date.now() - (29 - index) * 2 * 86_400_000).toISOString(),
        value: Number(value.toFixed(2)),
      }
    }),
  }))

  return {
    id: form.id,
    name: form.name,
    type: form.type,
    status: null,
    healthScore: null,
    failureRisk: null,
    maintenanceStatus: 'Prediction pending',
    recommendation: null,
    likelihood: null,
    location: form.location,
    manufacturer: form.manufacturer,
    model: form.model,
    installationDate: form.installationDate,
    lastMaintenance: new Date().toISOString(),
    nextMaintenance: new Date().toISOString(),
    description: form.description,
    sensors: sensorsOn,
    history: [],
    sensorHistory,
    events: [],
    custom: true,
    modelTypeCode,
    predictionStatus: 'loading',
    predictionInputs,
  }
}
interface AddMachineModalProps {
  open: boolean
  onClose: () => void
}

export default function AddMachineModal({ open, onClose }: AddMachineModalProps) {
  const { machines, thresholds, addMachine, notify, refreshTimestamp } = useApp()

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
    quality: string
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
    if (ext === 'xlsx' || ext === 'xls' || ext === 'json') {
      setFile({
        name: f.name,
        rows: '—',
        columns: '—',
        detected: sensors.filter((s) => s.enabled).map((s) => s.name),
        dateRange: 'Not parsed',
        quality: 'Not calculated',
        missing: 'Not calculated',
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
        .catch(() => finalizeParse(f, [], 0, '', ''))
    } catch {
      finalizeParse(f, [], 0, '', '')
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
    setFile({
      name: f.name,
      rows: rows > 0 ? rows.toLocaleString() : '—',
      columns: header.length ? String(header.length) : '—',
      detected: detected.length ? detected : sensors.filter((s) => s.enabled).map((s) => s.name),
      dateRange: firstDate && lastDate ? `${firstDate} → ${lastDate}` : 'Not parsed',
      quality: 'Not calculated',
      missing: 'Not calculated',
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
      const t = window.setTimeout(async () => {
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
        const machine = buildGeneratedMachine(form, readings)
        try {
          if (!machine.predictionInputs) {
            throw new Error('Model inputs were not generated for this machine.')
          }
          const prediction = await requestPrediction(machine.predictionInputs, thresholds)
          if (prediction.machine_id !== machine.id) throw new Error('Mismatched prediction machine ID')
          machine.prediction = prediction
          machine.predictionStatus = 'available'
          machine.status = prediction.status
          machine.healthScore = prediction.health_score
          machine.failureRisk = prediction.failure_probability * 100
          machine.recommendation = prediction.recommendation
          machine.likelihood = prediction.failure_type
          machine.history = [{
            date: prediction.timestamp,
            health: prediction.health_score,
            risk: prediction.failure_probability * 100,
            anomalyScore: prediction.anomaly_score * 100,
            anomalyFlag: prediction.anomaly_flag,
          }]
        } catch (error) {
          machine.predictionStatus = 'unavailable'
          machine.predictionError =
            error instanceof Error ? error.message : 'Prediction request failed unexpectedly'
          machine.status = null
          machine.healthScore = null
          machine.failureRisk = null
          machine.recommendation = null
          machine.likelihood = null
        }
        setResult(machine)
        setProcessing(false)
        setStep(5)
      }, 800)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setProcessIdx((i) => i + 1), 600 + processIdx * 120)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, processIdx, thresholds])

  const canNext = {
    1:
      form.id.trim().length > 0 &&
      form.name.trim().length > 0 &&
      form.type.trim().length > 0,
    2: activeSensors.length > 0,
    3: true,
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
      result.predictionStatus === 'available' ? 'success' : 'warning',
      `${result.id} added to fleet`,
      result.predictionStatus === 'available'
        ? `${result.name} registered with its ML prediction.`
        : `${result.name} registered. ${result.predictionError ?? 'ML prediction service unavailable.'}`,
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
          <Field
            label="Model Input Type (Automatic)"
            hint="Assigned from the machine category; compressors/boilers use H, conveyors/packaging/labels use L, and other types use M."
          >
            <div className="input flex h-10 items-center text-ink-dim">
              {machineTypeCode(form.type)} · Automatically assigned
            </div>
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
            Select display-only sensor presets. These values are not mapped to the model features and will not be used in prediction.
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
            The prediction service builds its input window internally. Upload is optional and used
            for a local metadata preview only; it is not sent to the backend.
          </p>
          <UploadZone
            accept=".csv,.xlsx,.xls,.json"
            label="Optional sensor-file preview"
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
                    {(file.size / 1024).toFixed(1)} KB · local preview only
                  </p>
                </div>
                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-400" />
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  ['Rows', file.rows],
                  ['Columns', file.columns],
                  ['Date Range', file.dateRange],
                  ['Data Quality', file.quality],
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
            </div>
          )}
        </div>
      )}
{step === 4 && (
        <div className="py-2">
          <div className="rounded-2xl border border-line bg-navy-900/50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-ink">Requesting trained ML prediction</p>
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
            DEMO MODE · predictions use simulated model inputs; selected sensor presets are display-only.
          </p>
        </div>
      )}
{step === 5 && result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-sky-400/20 bg-sky-500/5 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              DEMO MODE · Simulated Model Inputs
            </p>
            <p className="mt-1 text-[11px] text-ink-dim">
              The failure model uses the five simulated inputs in its documented training units. The selected display-only sensor presets are not used. The anomaly model receives a separate simulated sensor window.
            </p>
          </div>
          {result.predictionStatus === 'available' && result.prediction ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">Health Score</p>
                  <p className="mt-1 font-mono text-[20px] font-bold text-ink">{result.prediction.health_score}%</p>
                </div>
                <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">Failure Probability</p>
                  <p className="mt-1 font-mono text-[20px] font-bold text-ink">{(result.prediction.failure_probability * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">Machine Status</p>
                  <p className="mt-1.5 text-[12px] font-semibold text-ink">{result.prediction.status}</p>
                </div>
                <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">Model Recommendation</p>
                  <p className="mt-1.5 text-[12px] font-semibold text-ink">{result.prediction.recommendation}</p>
                </div>
              </div>
              <div className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-3 text-[11px] text-ink-dim">
                Failure type: {result.prediction.failure_type ?? 'No failure type classified by the model'} · Anomaly score: {(result.prediction.anomaly_score * 100).toFixed(1)}%
              </div>
              <p className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-faint">
                Failure-model inputs used: air {result.prediction.inputs.air_temperature} K · process {result.prediction.inputs.process_temperature} K · speed {result.prediction.inputs.rotational_speed} rpm · torque {result.prediction.inputs.torque} Nm · tool wear {result.prediction.inputs.tool_wear} min. Anomaly features: {result.prediction.anomaly_features_used.length} from a {result.prediction.data_source.toLowerCase()} window. The selected sensor presets above were not used.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-red-400/25 bg-red-500/5 px-3.5 py-3 text-[12px] font-semibold text-red-300">
              {result.predictionError ?? 'ML prediction service unavailable.'} No health, risk, status, or recommendation has been generated.
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
