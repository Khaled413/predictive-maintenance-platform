import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  ScanLine,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppContext'
import KpiCard from '../components/ui/KpiCard'
import UploadZone from '../components/ui/UploadZone'
import { ChartCard, ChartTooltip } from '../components/ui/ChartCard'
import Panel, { PanelHeader } from '../components/ui/Panel'
import { SelectInput } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'
import { cx, seededRandom, formatDateTime } from '../utils/helpers'
import type { Inspection } from '../types'

const DEFECT_TYPES = ['None', 'Surface Crack', 'Scratch', 'Deformation', 'Missing Component', 'Misalignment']

/** SVG phantom used for the seeded inspection thumbnails. */
function PhantomImage({ variant }: { variant: string }) {
  const colors: Record<string, [string, string]> = {
    g1: ['#1D3A6E', '#0E1B33'],
    g2: ['#17395E', '#0C2036'],
    g3: ['#213A63', '#101F38'],
    g4: ['#1A3A63', '#0C1F35'],
  }
  const [c1, c2] = colors[variant] ?? colors.g1
  const seed = variant.charCodeAt(1) ?? 1
  const rnd = seededRandom(seed * 7 + 3)
  return (
    <svg viewBox="0 0 120 90" className="h-full w-full">
      <defs>
        <linearGradient id={variant} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="120" height="90" rx="8" fill={`url(#${variant})`} />
      {/* phantom product silhouette */}
      <rect x={22} y={14} width={76} height={54} rx={3} fill="none" stroke="#3B82F6" strokeOpacity={0.5} strokeWidth={1.4} />
      <circle cx={60} cy={41} r={13} fill="none" stroke="#60A5FA" strokeOpacity={0.35} />
      <circle cx={60} cy={41} r={2.5} fill="#60A5FA" fillOpacity={0.6} />
      {[30, 48, 66, 84].map((x, i) => (
        <rect key={x} x={x} y={66 + (i % 2) * 6} width={4} height={8} rx={1} fill="#60A5FA" fillOpacity={0.35} />
      ))}
      {Array.from({ length: 14 }).map((_, i) => (
        <circle key={i} cx={rnd() * 120} cy={rnd() * 90} r={0.7 + rnd() * 0.6} fill="#94A3B8" fillOpacity={0.25} />
      ))}
    </svg>
  )
}
export default function QualityPage() {
  const { inspections, addInspection, notify, refreshTimestamp } = useApp()

  const [pending, setPending] = useState<{ url: string; name: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Inspection | null>(null)
  const [filter, setFilter] = useState<'all' | 'PASS' | 'FAIL'>('all')
  const [defectFilter, setDefectFilter] = useState('All')

  const allInspections = useMemo(() => {
    const merged = result ? [result, ...inspections.filter((i) => i.id !== result.id)] : inspections
    return merged.filter((i) => filter === 'all' || i.result === filter).filter((i) => defectFilter === 'All' || i.defectType === defectFilter)
  }, [inspections, result, filter, defectFilter])

  const stats = useMemo(() => {
    const src = result ? [result, ...inspections.filter((i) => i.id !== result.id)] : inspections
    const total = src.length
    const passed = src.filter((i) => i.result === 'PASS').length
    const failed = total - passed
    const defectRate = total ? Math.round((failed / total) * 100) : 0
    const qualityRate = total ? Math.round((passed / total) * 100) : 0
    return { total, passed, failed, defectRate, qualityRate }
  }, [inspections, result])

  const overTime = useMemo(() => {
    const days: { day: string; total: number; passed: number }[] = []
    const src = result ? [result, ...inspections.filter((i) => i.id !== result.id)] : inspections
    for (let d = 7; d >= 0; d--) {
      const key = new Date(Date.now() - d * 86_400_000).toDateString()
      const items = src.filter((i) => new Date(i.timestamp).toDateString() === key)
      days.push({
        day: new Date(Date.now() - d * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: items.length,
        passed: items.filter((i) => i.result === 'PASS').length,
      })
    }
    return days
  }, [inspections, result])

  const defectDist = useMemo(() => {
    const src = result ? [result, ...inspections.filter((i) => i.id !== result.id)] : inspections
    return DEFECT_TYPES.filter((d) => d !== 'None')
      .map((d) => ({ name: d, count: src.filter((i) => i.defectType === d).length }))
      .filter((d) => d.count > 0)
  }, [inspections, result])

  const handleFile = (f: File) => {
    const url = URL.createObjectURL(f)
    setPending({ url, name: f.name })
    setRunning(true)
    const rnd = seededRandom(f.name.length * 23 + 11)
    const fails = rnd() < 0.42
    const defectIdx = Math.floor(rnd() * (DEFECT_TYPES.length - 1)) + 1
    const box = {
      top: 14 + Math.round(rnd() * 30),
      left: 16 + Math.round(rnd() * 42),
      w: 16 + Math.round(rnd() * 16),
      h: 12 + Math.round(rnd() * 14),
    }
    window.setTimeout(() => {
      const insp: Inspection = {
        id: `Q-${String(1000 + Math.floor(rnd() * 9000))}`,
        productId: `PRD-${2200 + Math.floor(rnd() * 90)}`,
        timestamp: new Date().toISOString(),
        result: fails ? 'FAIL' : 'PASS',
        defectType: fails ? DEFECT_TYPES[defectIdx] : 'None',
        confidence: Math.round((88 + rnd() * 9.5) * 10) / 10,
        location: fails ? 'Detected region shown on image' : '—',
        image: url,
        box,
        isDemo: true,
      }
      setResult(insp)
      setRunning(false)
      addInspection(insp)
      refreshTimestamp()
      notify(
        fails ? 'warning' : 'success',
        'Demo inspection complete',
        fails
          ? `Illustrative demo output: ${insp.defectType} for ${insp.productId} (${insp.confidence}% simulated confidence). Not a model verdict.`
          : `Illustrative demo output: PASS for ${insp.productId} (${insp.confidence}% simulated confidence). Not a model verdict.`,
      )
    }, 2200)
  }
function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

return (
    <div className="space-y-5">
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-[11px] leading-relaxed text-amber-100/80">
      Demo simulation only: this page generates illustrative results from a filename and displays sample thumbnails. It is not connected to a trained vision model; PASS/FAIL, defect locations and confidence are not real inspection results.
    </div>
    {/* Stats */}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Demo Inspections" value={stats.total} icon={<ScanLine className="h-4 w-4" />} tone="blue" sub="Illustrative records only" />
      <KpiCard label="Demo PASS" value={stats.passed} icon={<CheckCircle2 className="h-4 w-4" />} tone="gray" sub="Not production results" />
      <KpiCard label="Demo FAIL" value={stats.failed} icon={<XCircle className="h-4 w-4" />} tone="gray" sub="Not production results" />
      <KpiCard label="Demo Defect Rate" value={`${stats.defectRate}%`} icon={<XCircle className="h-4 w-4" />} tone="gray" sub="Not a measured quality KPI" />
      <KpiCard label="Demo Pass Rate" value={`${stats.qualityRate}%`} icon={<CheckCircle2 className="h-4 w-4" />} tone="gray" sub="Not a measured quality KPI" />
      </div>
{/* Upload + Result */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel overflow-hidden">
          <PanelHeader
            title="Product Image Inspection"
            subtitle="Upload a photo to preview the deterministic demo simulation"
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
              hint="JPG, PNG or WEBP — up to ~10 MB"
              onFile={handleFile}
              icon={<ScanLine className="h-6 w-6" />}
            />
            {running && pending && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-sky-400/25">
                <img src={pending.url} alt="Product being inspected" className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-center gap-2 bg-navy-900/80 px-3 py-2 text-[11px] text-sky-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Demo simulation running — no vision model is being called…
                </div>
              </div>
            )}
            {!running && !result && !pending && (
              <p className="mt-3 text-center text-[11px] text-ink-faint">
                The current implementation creates a demo-only result; it does not inspect the image with a trained model.
              </p>
            )}
          </div>
        </div>
{result ? (
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Inspection Result"
              subtitle={`DEMO OUTPUT · ${result.productId} · ${formatDateTime(result.timestamp)}`}
              right={
                <span
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold',
                    result.result === 'PASS'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-400/40 bg-red-500/10 text-red-300',
                  )}
                >
                  {result.result === 'PASS' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {result.result}
                </span>
              }
            />
            <div className="px-4 pb-4 pt-3 sm:px-5">
              <div className="relative overflow-hidden rounded-2xl border border-line">
                <img src={result.image} alt="Inspection preview" className="aspect-[4/3] w-full object-cover" />
                {result.result === 'FAIL' && result.box && (
                  <div
                    className="absolute border-2 border-red-400"
                    style={{
                      top: `${result.box.top}%`,
                      left: `${result.box.left}%`,
                      width: `${result.box.w}%`,
                      height: `${result.box.h}%`,
                    }}
                  >
                    <span className="absolute -top-6 left-0 rounded bg-red-500 px-1.5 text-[9.5px] font-bold text-white">
                      {result.defectType}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  ['Defect Type', result.defectType],
                  ['Simulated Confidence', `${result.confidence}%`],
                  ['Location', result.location],
                  ['Model', 'Not connected'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line bg-navy-900/50 px-3 py-2">
                    <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">{k}</p>
                    <p className="mt-0.5 truncate text-[12px] font-semibold text-ink">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/5 px-3.5 py-3">
                <p className="mb-1 font-semibold uppercase tracking-wider text-[10px] text-sky-400/90">
                  Demo Inspection Summary
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">
                  {result.result === 'PASS'
                    ? 'Illustrative PASS output only. This does not verify product geometry or tolerances.'
                    : `Illustrative ${capitalize(result.defectType)} output at ${result.location.toLowerCase()}. This is not a real finding; inspect the product using a validated process. `}
                </p>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel className="flex flex-col items-center justify-center overflow-hidden p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-700/50 ring-1 ring-line">
              <ScanLine className="h-8 w-8 text-ink-faint" />
            </div>
            <p className="mt-4 text-[14px] font-semibold text-ink">No inspection yet</p>
            <p className="mt-1 max-w-sm text-center text-[12px] leading-relaxed text-ink-faint">
              Upload a product image on the left to run a deterministic demo simulation and see the illustrative output here.
            </p>
          </Panel>
        )}
      </div>
{/* Analytics charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Inspections Over Time" subtitle="Daily volume and pass count — last 7 days">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={overTime} margin={{ top: 8, right: 12, bottom: 4, left: -22 }}>
              <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.07)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis tickCount={5} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="total" name="Inspected" stroke="#60A5FA" strokeWidth={2.2} dot={false} animationDuration={800} />
              <Line type="monotone" dataKey="passed" name="Passed" stroke="#34D399" strokeWidth={2.2} dot={false} animationDuration={800} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Defects by Type" subtitle="Distribution of detected defect classes">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={defectDist} margin={{ top: 8, right: 12, bottom: 4, left: -22 }}>
              <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.07)" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)} />
              <YAxis tickCount={5} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.05)' }} />
              <Bar dataKey="count" name="Detections" fill="#F87171" radius={[4, 4, 0, 0]} animationDuration={700} barSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
{/* History */}
      <div className="panel overflow-hidden">
        <PanelHeader
          title="Inspection History"
          subtitle={`${allInspections.length} records`}
          right={
            <div className="flex items-center gap-2">
              <SelectInput value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'PASS' | 'FAIL')} className="w-auto min-w-28">
                <option value="all">Result: All</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </SelectInput>
              <SelectInput value={defectFilter} onChange={(e) => setDefectFilter(e.target.value)} className="w-auto min-w-40">
                <option value="All">Defect: All</option>
                {DEFECT_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </SelectInput>
            </div>
          }
        />
        {allInspections.length === 0 ? (
          <div className="px-6 py-10">
            <EmptyState title="No inspection records" message="Upload a product image to run the first inspection." />
          </div>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-navy-900/60 text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-3 py-3">Image</th>
                  <th className="px-3 py-3">Inspection ID</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Timestamp</th>
                  <th className="px-3 py-3">Result</th>
                  <th className="px-3 py-3">Defect Type</th>
                  <th className="px-3 py-3">Confidence</th>
                  <th className="px-3 py-3">Location</th>
                </tr>
              </thead>
              <tbody>
                {allInspections.map((i) => (
                  <tr key={i.id} className="border-b border-line/60 transition-colors hover:bg-navy-800/40">
                    <td className="px-3 py-2.5">
                      <div className="flex h-10 w-13 items-center justify-center overflow-hidden rounded-lg">
                        {i.image.startsWith('data:') || i.image.startsWith('blob:') ? (
                          <img src={i.image} alt={i.productId} className="h-10 w-13 object-cover" />
                        ) : (
                          <PhantomImage variant={i.image} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-ink">{i.id}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">{i.productId}</td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] text-ink-faint">{formatDateTime(i.timestamp)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold',
                          i.result === 'PASS'
                            ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-400/30 bg-red-500/10 text-red-300',
                        )}
                      >
                        {i.result === 'PASS' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {i.result}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-ink-dim">{i.defectType}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">{i.confidence}%</td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-faint">{i.location}</td>
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