import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanLine,
  XCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getQualityModelStatus, inspectQualityImage } from '../data/qualityInspectionApi'
import type {
  QualityInspectionResponse,
  QualityModelStatus,
} from '../data/qualityInspectionApi'
import UploadZone from '../components/ui/UploadZone'
import Panel, { PanelHeader } from '../components/ui/Panel'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import { formatDateTime, cx } from '../utils/helpers'
import type { Inspection } from '../types'

type QualityResult = QualityInspectionResponse & {
  id: string
  imageName: string
  imageUrl: string
}

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatUploadLimit(bytes: number) {
  const megabytes = bytes / (1024 * 1024)
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${megabytes.toFixed(1)} MB`
}

function isPatchCoreRecord(inspection: Inspection) {
  return (
    !inspection.isDemo &&
    inspection.predictionSource === 'PatchCore' &&
    typeof inspection.anomalyScore === 'number'
  )
}

export default function QualityPage() {
  const { inspections, addInspection, notify, refreshTimestamp } = useApp()
  const [modelStatus, setModelStatus] = useState<QualityModelStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [result, setResult] = useState<QualityResult | null>(null)
  const [running, setRunning] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'NORMAL' | 'ANOMALOUS'>('all')

  useEffect(() => {
    let active = true
    void getQualityModelStatus()
      .then((status) => {
        if (active) {
          setModelStatus(status)
          setStatusError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatusError(
            error instanceof Error
              ? error.message
              : 'Could not check PatchCore readiness.'
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.imageUrl)
    },
    [result]
  )

  const patchCoreInspections = useMemo(
    () => inspections.filter(isPatchCoreRecord),
    [inspections]
  )
  const visibleInspections = useMemo(
    () =>
      patchCoreInspections.filter((inspection) => {
        if (filter === 'all') return true
        return filter === 'NORMAL'
          ? inspection.result === 'PASS'
          : inspection.result === 'FAIL'
      }),
    [filter, patchCoreInspections]
  )
  const normalCount = patchCoreInspections.filter((item) => item.result === 'PASS').length
  const anomalyCount = patchCoreInspections.length - normalCount
  const anomalyRate = patchCoreInspections.length
    ? Math.round((anomalyCount / patchCoreInspections.length) * 100)
    : 0
  const maxImageBytes = modelStatus?.max_image_bytes ?? 4 * 1024 * 1024
  const imageSizeLimit = formatUploadLimit(maxImageBytes)

  const handleFile = async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setRequestError('Choose a JPEG, PNG, or WEBP image.')
      return
    }
    if (file.size > maxImageBytes) {
      setRequestError(`Image exceeds the ${imageSizeLimit} upload limit.`)
      return
    }
    setRequestError(null)
    setRunning(true)
    const imageUrl = URL.createObjectURL(file)
    try {
      const prediction = await inspectQualityImage(file)
      const completed: QualityResult = {
        ...prediction,
        id: `QI-${Date.now()}`,
        imageName: file.name,
        imageUrl,
      }
      setResult(completed)
      const stored: Inspection = {
        id: completed.id,
        productId: file.name,
        timestamp: prediction.timestamp,
        result: prediction.label === 'NORMAL' ? 'PASS' : 'FAIL',
        defectType: prediction.label === 'NORMAL' ? 'Normal' : 'Anomaly detected',
        anomalyScore: prediction.score,
        predictionSource: 'PatchCore',
        location: 'See PatchCore heatmap',
        image: file.name,
        isDemo: false,
      }
      addInspection(stored)
      refreshTimestamp()
      notify(
        prediction.label === 'NORMAL' ? 'success' : 'warning',
        'PatchCore inspection complete',
        `${file.name}: ${prediction.label.toLowerCase()}, anomaly score ${prediction.score.toFixed(4)}.`
      )
    } catch (error) {
      URL.revokeObjectURL(imageUrl)
      const message =
        error instanceof Error
          ? error.message
          : 'PatchCore inspection failed unexpectedly.'
      setRequestError(message)
      notify('error', 'Quality inspection failed', message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div
        className={cx(
          'flex items-start gap-3 rounded-xl border px-4 py-3 text-[11px] leading-relaxed',
          modelStatus?.model_available
            ? 'border-emerald-400/25 bg-emerald-400/5 text-emerald-100/80'
            : 'border-amber-400/25 bg-amber-400/5 text-amber-100/80'
        )}
      >
        {modelStatus?.model_available ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">
            {modelStatus?.model_available
              ? `PatchCore available · ${modelStatus.checkpoint}`
              : 'PatchCore is not ready'}
          </p>
          <p className="mt-0.5">
            {modelStatus?.model_available
              ? 'This model detects visual anomalies and highlights regions; it does not identify defect names or certify product quality.'
              : (modelStatus?.message ??
                statusError ??
                'Checking model and checkpoint availability…')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-4">
        <KpiCard
          label="PatchCore Inspections"
          value={patchCoreInspections.length}
          icon={<ScanLine className="h-4 w-4" />}
          tone="blue"
        />
        <KpiCard
          label="Normal"
          value={normalCount}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="gray"
        />
        <KpiCard
          label="Anomalous"
          value={anomalyCount}
          icon={<XCircle className="h-4 w-4" />}
          tone="gray"
        />
        <KpiCard
          label="Anomaly Rate"
          value={`${anomalyRate}%`}
          icon={<Activity className="h-4 w-4" />}
          tone="gray"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Visual Quality Inspection"
            subtitle="Upload a product photo for PatchCore anomaly detection"
            right={
              running ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing…
                </span>
              ) : undefined
            }
          />
          <div className="px-4 py-5 sm:px-5">
            <UploadZone
              accept=".jpg,.jpeg,.png,.webp"
              label="Upload Product Image"
              hint={`JPEG, PNG, or WEBP · Maximum ${imageSizeLimit}`}
              onFile={(file) => void handleFile(file)}
              icon={<ScanLine className="h-6 w-6" />}
            />
            {!modelStatus?.model_available && (
              <p className="mt-3 text-center text-[11px] text-ink-faint">
                You can select an image now. Inspection runs when the PatchCore checkpoint
                and API are available; if not, the backend will show the exact setup
                error.
              </p>
            )}
            {requestError && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300"
              >
                {requestError}
              </p>
            )}
            {result && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-line">
                <img
                  src={result.imageUrl}
                  alt={`Original uploaded image ${result.imageName}`}
                  className="aspect-[4/3] w-full object-contain"
                />
                <p className="truncate border-t border-line bg-navy-900/80 px-3 py-2 text-[11px] text-ink-dim">
                  {result.imageName}
                </p>
              </div>
            )}
          </div>
        </Panel>

        {result ? (
          <Panel className="overflow-hidden">
            <PanelHeader
              title="PatchCore Result"
              subtitle={`${result.prediction_source} · ${formatDateTime(result.timestamp)}`}
              right={
                <span
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold',
                    result.label === 'NORMAL'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-400/40 bg-red-500/10 text-red-300'
                  )}
                >
                  {result.label === 'NORMAL' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {result.label}
                </span>
              }
            />
            <div className="space-y-3 px-4 pb-4 pt-3 sm:px-5">
              <div className="overflow-hidden rounded-2xl border border-line bg-navy-900/50">
                <img
                  src={result.heatmap}
                  alt="PatchCore anomaly heatmap overlay"
                  className="aspect-[4/3] w-full object-contain"
                />
              </div>
              <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2">
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  Anomaly score
                </p>
                <p className="mt-0.5 font-mono text-[14px] font-semibold text-ink">
                  {result.score.toFixed(4)}
                </p>
              </div>
              <p className="text-[10px] leading-relaxed text-ink-faint">
                The score and heatmap are PatchCore outputs. Anomaly scores are not
                confidence percentages; validate the model and decision threshold using
                representative production images before operational use.
              </p>
            </div>
          </Panel>
        ) : (
          <Panel className="flex flex-col items-center justify-center overflow-hidden p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-700/50 ring-1 ring-line">
              <ScanLine className="h-8 w-8 text-ink-faint" />
            </div>
            <p className="mt-4 text-[14px] font-semibold text-ink">
              No inspection result
            </p>
            <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-faint">
              {modelStatus?.model_available
                ? 'Upload an image to see the PatchCore classification, anomaly score, and heatmap.'
                : 'A trained PatchCore checkpoint is required before images can be inspected.'}
            </p>
          </Panel>
        )}
      </div>

      <div className="panel overflow-hidden">
        <PanelHeader
          title="PatchCore Inspection History"
          subtitle={`${visibleInspections.length} real model results · demo records excluded`}
          right={
            <select
              aria-label="Filter inspection results"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
              className="input w-auto min-w-32"
            >
              <option value="all">All results</option>
              <option value="NORMAL">Normal</option>
              <option value="ANOMALOUS">Anomalous</option>
            </select>
          }
        />
        {visibleInspections.length === 0 ? (
          <div className="px-6 py-10">
            <EmptyState
              title="No PatchCore inspection records"
              message="Results from the demo inspection data are excluded. Run PatchCore on an image to create the first real model record."
            />
          </div>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-navy-900/60 text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-3 py-3">Image</th>
                  <th className="px-3 py-3">Timestamp</th>
                  <th className="px-3 py-3">Result</th>
                  <th className="px-3 py-3">Anomaly score</th>
                  <th className="px-3 py-3">Model</th>
                </tr>
              </thead>
              <tbody>
                {visibleInspections.map((inspection) => (
                  <tr key={inspection.id} className="border-b border-line/60">
                    <td className="max-w-64 truncate px-3 py-2.5 text-[11px] text-ink-dim">
                      {inspection.productId}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] text-ink-faint">
                      {formatDateTime(inspection.timestamp)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-dim">
                      {inspection.result === 'PASS' ? 'NORMAL' : 'ANOMALOUS'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">
                      {inspection.anomalyScore?.toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-faint">
                      {inspection.predictionSource}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
