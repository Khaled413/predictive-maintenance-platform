import React, { useEffect, useState } from 'react'
import {
  BellRing,
  Bot,
  Check,
  Database,
  Factory,
  Gauge,
  HardDriveDownload,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { statusForPrediction } from '../utils/predictionThresholds'
import Panel, { PanelHeader } from '../components/ui/Panel'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { Field, SelectInput, TextInput, Toggle } from '../components/ui/Field'
import { cx } from '../utils/helpers'
import type { MachineStatus, Thresholds } from '../types'
import { usePreferences } from '../context/PreferencesContext'

type SectionKey = 'general' | 'thresholds' | 'notifications' | 'data' | 'ai'

const SECTIONS: { key: SectionKey; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'general', label: 'General', desc: 'Factory profile & units', icon: <Factory className="h-4 w-4" /> },
  { key: 'thresholds', label: 'Thresholds', desc: 'Health & risk limits', icon: <Gauge className="h-4 w-4" /> },
  { key: 'notifications', label: 'Notifications', desc: 'Alert routing', icon: <BellRing className="h-4 w-4" /> },
  { key: 'data', label: 'Data Management', desc: 'Retention & reset', icon: <Database className="h-4 w-4" /> },
  { key: 'ai', label: 'AI Configuration', desc: 'Model & assistant', icon: <Bot className="h-4 w-4" /> },
]

const TIMEZONES = ['Asia/Riyadh (GMT+3)', 'Asia/Dubai (GMT+4)', 'Europe/Berlin (GMT+2)', 'UTC']
const PLANT_OPTIONS = ['Plant A — Riyadh', 'Plant B — Dammam', 'Plant C — Jeddah', 'Distribution Center 1']

export default function SettingsPage() {
  const { t } = usePreferences()
  const {
    thresholds,
    saveThresholds,
    machines,
    maintenance,
    alerts,
    inspections,
    documents,
    notify,
    resetDemo,
  } = useApp()

  const [section, setSection] = useState<SectionKey>('general')
  const [draft, setDraft] = useState<Thresholds>(thresholds)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)

  // General
  const [plant, setPlant] = useState(PLANT_OPTIONS[0])
  const [timezone, setTimezone] = useState(TIMEZONES[0])
  const [units, setUnits] = useState('Metric (°C, bar, kW)')

  // Notifications
  const [notif, setNotif] = useState({
    critical: true,
    warning: true,
    info: false,
    digest: true,
    email: true,
    sms: false,
    inApp: true,
  })

  // AI
  const [ragEnabled, setRagEnabled] = useState(true)

  useEffect(() => {
    setDraft(thresholds)
  }, [thresholds])

  const dirty =
    draft.healthWarning !== thresholds.healthWarning ||
    draft.healthCritical !== thresholds.healthCritical ||
    draft.riskWarning !== thresholds.riskWarning ||
    draft.riskCritical !== thresholds.riskCritical

  const invalid =
    draft.healthCritical >= draft.healthWarning ||
    draft.riskCritical <= draft.riskWarning ||
    draft.healthCritical < 0 ||
    draft.riskCritical > 100

  const statusCounts = (limits: Thresholds): Record<MachineStatus, number> => {
    const counts: Record<MachineStatus, number> = {
      Operational: 0,
      Warning: 0,
      Critical: 0,
      'Under Maintenance': 0,
    }
    machines.forEach((m) => {
      const status = m.prediction ? statusForPrediction(m.prediction, limits) : m.status
      if (status) counts[status] += 1
    })
    return counts
  }
  const beforeCounts = statusCounts(thresholds)
  const afterCounts = statusCounts(draft)

  const applyThresholds = () => {
    if (invalid) {
      notify('error', 'Invalid thresholds', 'Critical limits must be stricter than warning limits.')
      return
    }
    saveThresholds(draft)
    notify(
      'success',
      'Thresholds updated',
      `Health and risk thresholds applied to ${machines.length} machines and future predictions.`,
    )
  }

  const setDraftKey = (k: keyof Thresholds, v: number) => setDraft((d) => ({ ...d, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[248px_1fr]">
        {/* Section navigation */}
        <Panel className="h-fit p-2">
          <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={cx(
                  'group flex min-w-[172px] items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all lg:min-w-0',
                  section === s.key ? 'bg-sky-500/10 ring-1 ring-sky-400/25' : 'hover:bg-navy-800/60',
                )}
              >
                <span
                  className={cx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1',
                    section === s.key
                      ? 'bg-sky-500/15 text-sky-300 ring-sky-400/25'
                      : 'bg-navy-700/50 text-ink-faint ring-line group-hover:text-ink-dim',
                  )}
                >
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span
                    className={cx(
                      'block truncate text-[12.5px] font-semibold',
                      section === s.key ? 'text-ink' : 'text-ink-dim',
                    )}
                  >
                    {t(s.label)}
                  </span>
                  <span className="block truncate text-[10.5px] text-ink-faint">{t(s.desc)}</span>
                </span>
              </button>
            ))}
          </nav>
        </Panel>

        <div className="min-w-0 space-y-4">
          {section === 'general' && (
            <Panel>
              <PanelHeader
                title={t('General')}
                subtitle="Factory profile, locale and display preferences"
                right={
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() =>
                      notify('success', 'Settings saved', `Active plant set to ${plant}.`)
                    }
                  >
                    <Save className="h-3.5 w-3.5" />
                    {t('Save')}
                  </button>
                }
              />
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
                <Field label="Factory / Plant">
                  <SelectInput value={plant} onChange={(e) => setPlant(e.target.value)}>
                    {PLANT_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Timezone">
                  <SelectInput value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {TIMEZONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Measurement Units" hint="Applies to sensors, charts and reports.">
                  <SelectInput value={units} onChange={(e) => setUnits(e.target.value)}>
                    <option>Metric (°C, bar, kW)</option>
                    <option>Imperial (°F, psi, hp)</option>
                  </SelectInput>
                </Field>
                <Field label="Shift Pattern">
                  <SelectInput defaultValue="3 shifts × 8h (24/7 production)">
                    <option>3 shifts × 8h (24/7 production)</option>
                    <option>2 shifts × 12h</option>
                    <option>Single day shift</option>
                  </SelectInput>
                </Field>
                <Field label="Fleet Name" className="sm:col-span-2">
                  <TextInput
                    defaultValue={t('Riyadh Plant A — Production Line 1')}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3.5 sm:px-5">
                <span className="chip">
                  <Factory className="h-3 w-3" />
                  {machines.length} machines registered
                </span>
                <span className="chip">
                  <Check className="h-3 w-3 text-emerald-400" />
                  Data source: simulated inputs · trained ML model predictions
                </span>
              </div>
            </Panel>
          )}
          {section === 'thresholds' && (
            <Panel>
              <PanelHeader
                title="Health & Failure Risk Thresholds"
                subtitle="Applied to model health scores and failure probabilities to determine machine status, alert severity, and recommendations."
                right={
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setDraft(thresholds)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Discard
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={!dirty || invalid}
                      onClick={applyThresholds}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Apply
                    </button>
                  </div>
                }
              />

              <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
                <ThresholdSlider
                  title="Health Score — Warning"
                  description="At or below this health score, the machine is classified as Warning."
                  value={draft.healthWarning}
                  min={40}
                  max={95}
                  unit="%"
                  tone="amber"
                  onChange={(v) => setDraftKey('healthWarning', v)}
                />
                <ThresholdSlider
                  title="Health Score — Critical"
                  description="At or below this health score, the machine is classified as Critical."
                  value={draft.healthCritical}
                  min={20}
                  max={80}
                  unit="%"
                  tone="red"
                  onChange={(v) => setDraftKey('healthCritical', v)}
                />
                <ThresholdSlider
                  title="Failure Risk — Warning"
                  description="At or above this failure probability, the machine is classified as Warning."
                  value={draft.riskWarning}
                  min={20}
                  max={80}
                  unit="%"
                  tone="amber"
                  onChange={(v) => setDraftKey('riskWarning', v)}
                />
                <ThresholdSlider
                  title="Failure Risk — Critical"
                  description="At or above this failure probability, the machine is classified as Critical."
                  value={draft.riskCritical}
                  min={40}
                  max={95}
                  unit="%"
                  tone="red"
                  onChange={(v) => setDraftKey('riskCritical', v)}
                />
              </div>

              {invalid && (
                <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-3 sm:mx-5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-[12px] leading-relaxed text-red-200">
                    Invalid configuration: the Critical threshold must be stricter than the Warning threshold
                    (health critical &lt; health warning, risk critical &gt; risk warning).
                  </p>
                </div>
              )}
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    {t('Status Under Draft Thresholds')}
                  </h4>
                  <span className="text-[10px] text-ink-faint">
                    {t('Preview of how applying the draft health and risk limits will classify current predictions.')}
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    ['Operational', 'Warning', 'Critical', 'Under Maintenance'] as MachineStatus[]
                  ).map((k) => (
                    <div key={k} className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-3">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                        {k}
                      </p>
                      <p className="mt-1.5 flex items-baseline gap-2 font-mono text-[18px] font-bold text-ink">
                        {afterCounts[k]}
                        {dirty && afterCounts[k] !== beforeCounts[k] && (
                          <span
                            className={cx(
                              'text-[11px] font-semibold',
                              afterCounts[k] > beforeCounts[k] ? 'text-amber-300' : 'text-emerald-300',
                            )}
                          >
                            {afterCounts[k] > beforeCounts[k] ? '+' : ''}
                            {afterCounts[k] - beforeCounts[k]}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[10.5px] text-ink-faint">was {beforeCounts[k]}</p>
                    </div>
                  ))}
                </div>
                <div className="thin-scroll mt-3.5 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-ink-faint">
                        <th className="py-2 pr-3 font-semibold">Machine</th>
                        <th className="px-3 py-2 font-semibold">Health</th>
                        <th className="px-3 py-2 font-semibold">Risk</th>
                        <th className="px-3 py-2 font-semibold">ML Model Status</th>
                        <th className="px-3 py-2 font-semibold">Prediction Service</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machines.slice(0, 8).map((m) => (
                          <tr key={m.id} className="border-b border-line/60 last:border-0">
                            <td className="py-2.5 pr-3 font-mono text-[11.5px] text-ink-dim">{m.id}</td>
                            <td className="px-3 py-2.5 font-mono text-ink-dim">{m.healthScore === null ? '—' : `${m.healthScore}%`}</td>
                            <td className="px-3 py-2.5 font-mono text-ink-dim">{m.failureRisk === null ? '—' : `${m.failureRisk.toFixed(1)}%`}</td>
                            <td className="px-3 py-2.5 text-ink-faint">
                              {m.prediction
                                ? statusForPrediction(m.prediction, draft)
                                : m.status ?? (m.predictionStatus === 'loading' ? 'Loading…' : 'Unavailable')}
                            </td>
                            <td className="px-3 py-2.5 text-ink-faint">
                              {m.predictionStatus === 'available' ? 'Model output' : 'Not available'}
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Panel>
          )}
          {section === 'notifications' && (
            <Panel>
              <PanelHeader
                title="Notifications & Alert Routing"
                subtitle="Choose which events reach the operations team and through which channels"
                right={
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() =>
                      notify(
                        'success',
                        'Notification preferences saved',
                        'Alert routing updated for the operations team.',
                      )
                    }
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                }
              />
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div>
                  <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    Severity
                  </h4>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <ToggleRow
                      label="Critical alerts"
                      hint="Immediate escalation to maintenance lead"
                      checked={notif.critical}
                      onChange={(v) => setNotif((n) => ({ ...n, critical: v }))}
                    />
                    <ToggleRow
                      label="Warning alerts"
                      hint="Notifies shift supervisor"
                      checked={notif.warning}
                      onChange={(v) => setNotif((n) => ({ ...n, warning: v }))}
                    />
                    <ToggleRow
                      label="Informational"
                      hint="Quality & inspection updates"
                      checked={notif.info}
                      onChange={(v) => setNotif((n) => ({ ...n, info: v }))}
                    />
                  </div>
                </div>
                <div className="border-t border-line pt-4">
                  <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    Channels
                  </h4>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <ToggleRow
                      label="In-app notifications"
                      hint="Toast + Alerts Center"
                      checked={notif.inApp}
                      onChange={(v) => setNotif((n) => ({ ...n, inApp: v }))}
                    />
                    <ToggleRow
                      label="Email"
                      hint="maintenance@plant-a.example"
                      checked={notif.email}
                      onChange={(v) => setNotif((n) => ({ ...n, email: v }))}
                    />
                    <ToggleRow
                      label="SMS"
                      hint="On-call technician only"
                      checked={notif.sms}
                      onChange={(v) => setNotif((n) => ({ ...n, sms: v }))}
                    />
                    <ToggleRow
                      label="Daily digest"
                      hint="Sent at 07:00 plant time"
                      checked={notif.digest}
                      onChange={(v) => setNotif((n) => ({ ...n, digest: v }))}
                    />
                  </div>
                </div>
              </div>
            </Panel>
          )}
          {section === 'data' && (
            <div className="space-y-4">
              <Panel>
                <PanelHeader
                  title="Data Management"
                  subtitle="Stored records, retention policy and dataset recovery"
                />
                <div className="grid grid-cols-2 gap-2.5 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5 sm:px-5">
                  <StatTile label="Machines" value={machines.length} />
                  <StatTile label="Work Orders" value={maintenance.length} />
                  <StatTile label="Alerts" value={alerts.length} />
                  <StatTile label="Inspections" value={inspections.length} />
                  <StatTile label="Documents" value={documents.length} />
                </div>
                <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2 sm:px-5">
                  <Field label="Sensor Data Retention">
                    <SelectInput defaultValue="24 months (recommended)">
                      <option>24 months (recommended)</option>
                      <option>12 months</option>
                      <option>36 months</option>
                      <option>Unlimited (prototype)</option>
                    </SelectInput>
                  </Field>
                  <Field label="Sampling Interval">
                    <SelectInput defaultValue="1 minute">
                      <option>10 seconds</option>
                      <option>1 minute</option>
                      <option>5 minutes</option>
                      <option>15 minutes</option>
                    </SelectInput>
                  </Field>
                </div>
                <div className="flex items-center gap-2 border-t border-line px-4 py-3.5 sm:px-5">
                  <span className="chip">
                    <HardDriveDownload className="h-3 w-3" />
                    Storage: browser localStorage (client-only prototype)
                  </span>
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Dataset Recovery"
                  subtitle="Restore the original synthetic dataset or clear the locally cached platform state"
                />
                <div className="space-y-2.5 px-4 py-4 sm:px-5">
                  <ActionRow
                    icon={<Upload className="h-4 w-4 text-sky-300" />}
                    title="Export all platform data"
                    hint="Downloads machines, work orders, alerts and inspections as JSON."
                    actionLabel="Export JSON"
                    onAction={() => {
                      notify('info', 'Preparing export…', 'Packaging platform data as JSON.')
                      window.setTimeout(() => {
                        notify(
                          'success',
                          'Export ready',
                          `${machines.length} machines · ${maintenance.length} work orders — prototype export.`,
                        )
                      }, 1200)
                    }}
                  />
                  <ActionRow
                    icon={<RotateCcw className="h-4 w-4 text-amber-300" />}
                    title="Reset demo data"
                    hint="Restores the seed dataset and removes any records you added."
                    actionLabel="Reset"
                    onAction={() => setConfirmReset(true)}
                  />
                  <ActionRow
                    icon={<Trash2 className="h-4 w-4 text-red-300" />}
                    title="Clear local cache"
                    hint="Removes cached state from this browser and reloads the platform."
                    actionLabel="Clear cache"
                    danger
                    onAction={() => setConfirmWipe(true)}
                  />
                </div>
              </Panel>
            </div>
          )}
          {section === 'ai' && (
            <Panel>
              <PanelHeader
                title="AI Configuration"
                subtitle="Model selection, inference behaviour and explainability controls"
                right={
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() =>
                      notify(
                        'success',
                        'AI configuration saved',
                        `Prediction service: /api/predict · RAG ${ragEnabled ? 'enabled' : 'disabled'}.`,
                      )
                    }
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                }
              />
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
                <Field
                  label="Prediction Model"
                  className="sm:col-span-2"
                  hint="Demo predictions use separate simulated model inputs. The sensor profiles and uploaded file previews are not sent as model inputs."
                >
                  <TextInput value="Trained ML Models · same-origin /api/predict" readOnly />
                </Field>
                <Field label="Prediction Inputs">
                  <TextInput value="DEMO MODE · simulated failure features + separate simulated anomaly window" readOnly />
                </Field>
              </div>
              <div className="space-y-2.5 border-t border-line px-4 py-4 sm:px-5">
                <ToggleRow
                  label="Document-grounded answers (RAG)"
                  hint="Ground assistant answers in the uploaded knowledge base with source citations."
                  checked={ragEnabled}
                  onChange={setRagEnabled}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3.5 sm:px-5">
                <span className="chip">
                  <Sparkles className="h-3 w-3 text-sky-300" />
                  Assistant model: Industrial Copilot (mock)
                </span>
                <span className="chip">
                  <Database className="h-3 w-3" />
                  Vector store: not connected (API-ready)
                </span>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset platform data?"
        message="All demo machines, work orders, alerts, inspections and documents will be restored to the original seed dataset. Any machines or records you added will be removed."
        confirmLabel="Reset data"
        onConfirm={() => {
          resetDemo()
          notify('success', 'Demo data restored', 'The platform has been reset to its original seed dataset.')
        }}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmWipe}
        title="Clear local cache?"
        message="This clears the locally cached platform state in this browser. The page will reload with freshly generated demo data."
        confirmLabel="Clear cache"
        onConfirm={() => {
          try {
            localStorage.removeItem('iap-state-v3')
          } catch {
            // storage unavailable — ignore
          }
          window.location.reload()
        }}
        onCancel={() => setConfirmWipe(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local presentational helpers
// ---------------------------------------------------------------------------

function ThresholdSlider({
  title,
  description,
  value,
  min,
  max,
  unit,
  tone,
  onChange,
}: {
  title: string
  description: string
  value: number
  min: number
  max: number
  unit: string
  tone: 'amber' | 'red'
  onChange: (v: number) => void
}) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-faint">{description}</p>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-lg border px-2.5 py-1 font-mono text-[13px] font-bold',
            tone === 'amber'
              ? 'border-amber-400/30 bg-amber-500/10 text-amber-300'
              : 'border-red-400/30 bg-red-500/10 text-red-300',
          )}
        >
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-navy-600 accent-sky-500"
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-navy-900/50 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-faint">{hint}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-1.5 font-mono text-[18px] font-bold leading-none text-ink">{value}</p>
    </div>
  )
}

function ActionRow({
  icon,
  title,
  hint,
  actionLabel,
  danger,
  onAction,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  actionLabel: string
  danger?: boolean
  onAction: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-navy-900/50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-700/50 ring-1 ring-line">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-faint">{hint}</p>
        </div>
      </div>
      <button
        type="button"
        className={cx('btn-sm shrink-0', danger ? 'btn-danger' : 'btn-ghost')}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  )
}
