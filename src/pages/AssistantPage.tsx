import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bot,
  BrainCircuit,
  Database,
  Eye,
  FileText,
  Plus,
  Router,
  SendHorizonal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { usePreferences } from '../context/PreferencesContext'
import Panel, { PanelHeader } from '../components/ui/Panel'
import UploadZone from '../components/ui/UploadZone'
import { cx, formatDateTime, nowIso, timeAgo } from '../utils/helpers'
import { hasProvidedPrediction } from '../utils/operationalMetrics'
import type { ChatMessage, Conversation, KnowledgeDoc, Machine, MaintenanceRecord } from '../types'

type AskContext = 'factory' | 'machine' | 'knowledge' | 'document'

const CONTEXTS: { key: AskContext; label: string; desc: string }[] = [
  { key: 'factory', label: 'Entire Factory', desc: 'Answers across the whole fleet' },
  { key: 'machine', label: 'Specific Machine', desc: 'Answers scoped to one machine' },
  { key: 'knowledge', label: 'Knowledge Base', desc: 'Answers grounded in documents' },
  { key: 'document', label: 'Uploaded Document', desc: 'Answers from a single file' },
]

const SUGGESTED_PROMPTS = [
  'Which machines are currently at risk?',
  'Why is M-003 critical?',
  'Which machines need maintenance this week?',
  'What factors are affecting M-002?',
  'Summarize the maintenance history.',
  'What machines have abnormal vibration?',
]

const DOC_TYPES = ['PDF', 'DOCX', 'TXT', 'CSV', 'XLSX']

function summarize(
  machines: Machine[],
  maintenance: MaintenanceRecord[],
): { atRisk: Machine[]; critical: Machine[]; vibration: Machine[]; due: MaintenanceRecord[]; avgHealth: number | null; predicted: Machine[] } {
  const predicted = machines.filter(hasProvidedPrediction)
  const atRisk = predicted.filter((m) => m.status === 'Critical' || m.status === 'Warning')
  const critical = predicted.filter((m) => m.status === 'Critical')
  const vibration = machines.filter((m) =>
    m.sensors.some((s) => s.name.toLowerCase() === 'vibration' && s.level !== 'green'),
  )
  const nextWeek = Date.now() + 7 * 86_400_000
  const due = maintenance.filter((r) => {
    const date = Date.parse(r.date)
    return !r.isDemo && (r.status === 'Scheduled' || r.status === 'Recommended' || r.status === 'In Progress') &&
      Number.isFinite(date) && date >= Date.now() && date <= nextWeek
  })
  const avgHealth = predicted.length
    ? Math.round(predicted.reduce((a, m) => a + (m.healthScore ?? 0), 0) / predicted.length)
    : null
  return { atRisk, critical, vibration, due, avgHealth, predicted }
}
function buildReply(
  text: string,
  machines: Machine[],
  maintenance: MaintenanceRecord[],
  docs: KnowledgeDoc[],
  context: AskContext,
  contextMachine?: Machine,
): { content: string; sources?: string[] } {
  const t = text.toLowerCase()
  const agg = summarize(machines, maintenance)
  const m = contextMachine ?? machines.find((x) => x.id === (t.match(/m-\d{3}/)?.[0] ?? '').toUpperCase())

  if (/summarize.*maintenance|maintenance.*history/.test(t)) {
    const done = maintenance.filter((r) => r.status === 'Completed')
    const actualCosts = done.filter((record) => record.actualCost !== null && record.actualCost !== undefined)
    const avgCost = actualCosts.length
      ? `$${Math.round(actualCosts.reduce((sum, record) => sum + (record.actualCost ?? 0), 0) / actualCosts.length).toLocaleString()}`
      : 'N/A — no actual completion costs recorded'
    return {
      content:
        `Local work-order record summary (includes demo records):\n\n• Total work orders: ${maintenance.length}\n• Recommended: ${maintenance.filter((r) => r.status === 'Recommended').length}\n• Scheduled: ${maintenance.filter((r) => r.status === 'Scheduled').length}\n• In progress: ${maintenance.filter((r) => r.status === 'In Progress').length}\n• Completed: ${done.length}\n• Average recorded actual cost: ${avgCost}\n\nWork-type and machine cost rankings are not reported because the available records do not establish that their values are actual.`,
    }
  }

  if (m && /(\bwhy\b|factors|affecting|vibration|risk|health)/.test(t)) {
    if (m.predictionStatus !== 'available' || m.healthScore === null || m.failureRisk === null) {
      return { content: `${m.id} has no current model output. ML prediction service unavailable; health, risk, status, and recommendation are not available.` }
    }
    return {
      content: `${m.id} (${m.name}) — ${m.type}:\n\n• Health score: ${m.healthScore}%\n• Failure probability: ${m.failureRisk.toFixed(1)}%\n• Model status: ${m.status}\n• Model recommendation: ${m.recommendation}${m.maintenanceStatus === 'Overdue' ? '\n• Maintenance schedule: OVERDUE — arrange the overdue maintenance separately; the model recommendation does not update the schedule.' : ''}\n• Model inputs are simulated demo values; the displayed sensor readings below are illustrative only and were not used by the model.\n\nIllustrative display-only readings:\n${m.sensors
        .map(
          (s) =>
            `• ${s.name}: ${s.value} ${s.unit} (band ${s.min}–${s.max}) — ${s.level === 'green' ? 'normal' : s.level === 'amber' ? 'approaching limit' : 'exceeds limit'}`,
        )
        .join('\n')}\n\nModel failure type: ${m.likelihood ?? 'No failure type classified by the model'}. Follow the model recommendation above separately from the maintenance schedule.`,
    }
  }

  if (/(risk|at risk|critical|concern)/.test(t)) {
    if (!agg.atRisk.length) {
      return {
        content: agg.predicted.length
          ? 'No currently available model predictions place a machine at risk.'
          : 'ML prediction service unavailable. Current fleet risk status cannot be determined.',
      }
    }
    return {
      content: `Currently ${agg.atRisk.length} machines are at risk:\n\n${agg.atRisk
        .map((x) => `• ${x.id} — ${x.type}: health ${x.healthScore}%, failure risk ${x.failureRisk?.toFixed(1) ?? '—'}% (${x.likelihood ?? 'No failure type classified'})`)
        .join('\n')}\n\n${agg.critical.length
        ? `Priority: ${agg.critical.map((c) => c.id).join(', ')} should be addressed first.`
        : 'Monitoring continues — no critical threshold crossed yet.'}`,
    }
  }

  if (/maintenance.*(week|due|next)|due.*maintenance|need maintenance/.test(t)) {
    if (!agg.due.length) {
      return { content: 'No active work orders are dated within the next 7 days in the local records. Schedule capacity is not available.' }
    }
    return {
      content: `${agg.due.length} active work orders are dated within the next 7 days in the local records:\n\n${agg.due
        .map((r) => `• ${r.machineId} — ${r.type} (${r.status.toLowerCase()}, priority ${r.priority})`)
        .join('\n')}`,
    }
  }

  if (/vibration|abnormal/.test(t)) {
    if (!agg.vibration.length) {
      return { content: 'No illustrative demo vibration readings are currently outside their display bands. These values are not live sensor telemetry and are not model inputs.' }
    }
    return {
      content: `Machines with abnormal vibration:\n\n${agg.vibration
        .map(
          (x) =>
            `• ${x.id} — ${x.name}: illustrative demo vibration reading ${x.sensors.find((s) => s.name.toLowerCase() === 'vibration')?.value}${x.sensors.find((s) => s.name.toLowerCase() === 'vibration')?.unit}; not used by model (${x.status?.toLowerCase() ?? 'prediction unavailable'})`,
        )
        .join('\n')}\n\nThese are illustrative display-only values. The platform cannot determine physical vibration condition or recommend a cause from them.`,
    }
  }

  if (/(document|manual|pdf|procedure|knowledge)/.test(t)) {
    const tracked = docs.length
    return {
      content: tracked
        ? `${tracked} document record(s) are listed, but document content retrieval is not implemented. I cannot search their contents or provide document-grounded answers.`
        : 'No document records are available. Document-content retrieval is not implemented.',
    }
  }

  if (/health/.test(t)) {
    if (agg.avgHealth === null) {
      return { content: 'ML prediction service unavailable. No current model health scores are available.' }
    }
    return {
      content: `Average current model health score is ${Math.round(agg.avgHealth)}% across ${agg.predicted.length} machines with available predictions. Model status counts: ${agg.predicted.filter((machine) => machine.status === 'Operational').length} operational, ${agg.predicted.filter((machine) => machine.status === 'Warning').length} warning, ${agg.predicted.filter((machine) => machine.status === 'Critical').length} critical.`,
    }
  }

  const machineLabel = m ? `${m.id} (${m.name})` : context === 'machine' ? 'the selected machine' : 'the fleet'
  const ctxNote =
    context === 'knowledge' || context === 'document'
      ? 'I used the uploaded documents to ground this answer.'
      : 'This answer is generated from the current local demo state and saved model outputs; sensor display values are illustrative, not live telemetry.'
  return {
    content: `Here is what I can tell you about ${machineLabel}:\n\n• Fleet average health: ${agg.avgHealth === null ? 'ML prediction service unavailable' : `${Math.round(agg.avgHealth)}%`}\n• At-risk machines: ${agg.atRisk.length} (${agg.atRisk.length ? agg.atRisk.map((x) => x.id).join(', ') : agg.predicted.length ? 'none in current predictions' : 'prediction service unavailable'})\n• Due maintenance: ${agg.due.length} tasks\n\n${ctxNote}\n\nI can help with machine details (“Why is M-003 critical?”), weekly maintenance planning, vibration anomalies, health trends and knowledge base questions.`,
  }
}
type CtxMap = {
  factory: { label: string; desc: string }
  machine: { label: string; desc: string }
  knowledge: { label: string; desc: string }
  document: { label: string; desc: string }
}

export default function AssistantPage() {
  const { machines, maintenance, documents, addDocument, deleteDocument, notify, refreshTimestamp } = useApp()
  const { language } = usePreferences()
  const [searchParams, setSearchParams] = useSearchParams()

  const [ctx, setCtx] = useState<AskContext>('factory')
  const [machineId, setMachineId] = useState('M-003')
  const [docId, setDocId] = useState('DOC-001')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const ctxMeta: CtxMap = {
    factory: { label: 'Entire Factory', desc: 'Answers across the whole fleet' },
    machine: { label: 'Specific Machine', desc: machineId },
    knowledge: { label: 'Knowledge Base', desc: `${documents.length} document records; content search unavailable` },
    document: { label: 'Uploaded Document', desc: documents.find((d) => d.id === docId)?.name ?? '—' },
  }
//<<NEXT2>>

  const send = (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || typing) return
    const contextMachine = ctx === 'machine' ? machines.find((m) => m.id === machineId) : undefined
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: nowIso(),
    }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setTyping(true)
    const reply = buildReply(text, machines, maintenance, documents, ctx, contextMachine)
    window.setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply.content,
        sources: reply.sources,
        timestamp: nowIso(),
      }
      setMessages((m) => [...m, assistantMsg])
      setTyping(false)
      refreshTimestamp()
    }, 850 + Math.floor(Math.random() * 600))
  }

  const newChat = () => {
    setMessages([])
    setTyping(false)
  }

  const saveConversation = () => {
    if (!messages.length) return
    const title = messages.find((m) => m.role === 'user')?.content.slice(0, 42) ?? 'Chat'
    setConversations((c) => [
      {
        id: `cv-${Date.now()}`,
        title,
        updated: nowIso(),
        context: ctx,
        contextLabel: ctxMeta[ctx].label,
        messages,
      },
      ...c,
    ])
    notify('success', 'Conversation saved', 'Added to your saved conversation history.')
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  useEffect(() => {
    if (searchParams.get('upload') !== '1') return
    document.getElementById('assistant-document-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const handleDocUpload = (file: File) => {
    // Determine type from extension
    const ext = (file.name.split('.').pop() ?? 'pdf').toUpperCase()
    const type = ext === 'XLS' ? 'XLSX' : DOC_TYPES.includes(ext) ? ext : 'PDF'
    const id = `DOC-${crypto.randomUUID()}`
    const sizeMb = file.size / (1024 * 1024)
    const size = sizeMb < 1 ? `${Math.max(1, Math.round(sizeMb * 1000))} KB` : `${(sizeMb).toFixed(1)} MB`
    addDocument({
      id,
      name: file.name,
      type,
      size,
      uploadDate: nowIso(),
      status: 'Metadata Only',
      pages: null,
      source: 'Uploaded by user',
      isDemo: false,
    })
    notify('success', 'Document record saved', `${file.name} metadata was saved. Content parsing and search are not available.`)
    refreshTimestamp()
  }
return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(220px,250px)_minmax(0,1fr)_minmax(260px,300px)]">
      {/* Left — saved conversations */}
      <Panel className="flex max-h-[720px] flex-col overflow-hidden xl:max-h-[760px]">
        <PanelHeader
          title="Conversations"
          subtitle={`${conversations.length + 1} saved`}
          right={
            <button type="button" className="btn-ghost btn-sm" onClick={newChat} title="Start a new chat">
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          }
        />
        <div className="thin-scroll flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
          <button
            type="button"
            onClick={newChat}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
              messages.length === 0
                ? 'border-sky-400/30 bg-sky-500/10'
                : 'border-line bg-navy-900/40 hover:border-line hover:bg-navy-800/60',
            )}
          >
            <Bot className={cx('h-4 w-4', messages.length === 0 ? 'text-sky-300' : 'text-ink-faint')} />
            <span className="min-w-0 flex-1">
              <span
                className={cx(
                  'block truncate text-[12px] font-semibold',
                  messages.length === 0 ? 'text-ink' : 'text-ink-dim',
                )}
              >
                {messages.length ? 'Current chat' : 'New conversation'}
              </span>
              <span className="mt-0.5 block text-[10px] text-ink-faint">
                {messages.length ? `${messages.length} messages` : 'Ask about machines & maintenance'}
              </span>
            </span>
          </button>
          {conversations
            .filter((c) => !c.id.startsWith('cv-demo-'))
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setMessages(c.messages)
                  setCtx(c.context)
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-navy-900/40 px-3 py-2.5 text-left transition-colors hover:bg-navy-800/60"
              >
                <Bot className="h-4 w-4 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink-dim">{c.title}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-faint">
                    {c.contextLabel} · {timeAgo(c.updated)}
                  </span>
                </span>
              </button>
            ))}
        </div>
        <div className="border-t border-line px-3 py-2.5">
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={saveConversation}
            disabled={!messages.length}
          >
            <Database className="h-4 w-4" />
            Save Current Chat
          </button>
        </div>
      </Panel>
{/* Center — chat */}
      <Panel className="flex max-h-[720px] flex-col overflow-hidden xl:max-h-[760px]">
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/70 to-blue-700">
                <Bot className="h-4 w-4 text-white" />
              </span>
              <span>
                <span className="block text-[13.5px] font-bold text-ink">Industrial AI Assistant</span>
                <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                  {ctxMeta[ctx].label} · {ctxMeta[ctx].desc}
                </span>
              </span>
            </span>
          }
          right={
            <span className="chip border-sky-400/25 bg-sky-500/10 text-sky-300">
              <Sparkles className="h-3 w-3" />
              Prototype copilot
            </span>
          }
        />
        <div
          ref={scrollRef}
          className="thin-scroll min-h-[420px] flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && !typing && (
            <div className="animate-fadeUp rounded-2xl border border-line bg-navy-900/40 p-4">
              <p className="text-[13px] font-semibold text-ink">Ask about your machines, maintenance and documents</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                Try one of these prompts — the assistant answers with simulated live data and cites sources when using the knowledge base.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="rounded-xl border border-line bg-navy-800/50 px-2.5 py-1.5 text-left text-[10.5px] text-ink-dim transition-colors hover:border-sky-400/30 hover:text-sky-300"
                  >
                    “{p}”
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={cx('flex items-start gap-2.5 animate-fadeUp', msg.role === 'user' && 'flex-row-reverse')}>
              <span
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                  msg.role === 'user' ? 'bg-navy-700/70' : 'bg-gradient-to-br from-sky-500/70 to-blue-700',
                )}
              >
                {msg.role === 'user' ? (
                  <span className="text-[10px] font-bold text-ink">{language === 'ar' ? 'م.س' : 'ES'}</span>
                ) : (
                  <Bot className="h-3.5 w-3.5 text-white" />
                )}
              </span>
              <div
                className={cx(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5',
                  msg.role === 'user'
                    ? 'border border-sky-500/20 bg-sky-500/10'
                    : 'border border-line bg-navy-800/70',
                )}
              >
                <div className={cx('text-[12.5px] leading-relaxed', msg.role === 'user' ? 'text-ink' : 'text-ink-dim')}>
                  <span className="whitespace-pre-line">{msg.content}</span>
                </div>
                {msg.sources?.length ? (
                  <div className="mt-2 rounded-xl border border-sky-400/15 bg-sky-500/5 px-2.5 py-1.5">
                    <p className="text-[9.5px] font-semibold uppercase tracking-wider text-sky-400/90">
                      Sources
                    </p>
                    {msg.sources.map((s) => (
                      <p key={s} className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-dim">
                        <FileText className="h-3 w-3 text-sky-300" />
                        {s}
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="mt-1.5 text-right font-mono text-[9px] text-ink-faint">
                  {formatDateTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/70 to-blue-700">
                <Bot className="h-3.5 w-3.5 text-white" />
              </span>
              <div className="rounded-2xl border border-line bg-navy-800/70 px-3.5 py-2.5">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-sky-400"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
<div className="border-t border-line px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/60 px-3 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask about machines, maintenance, documents…"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint outline-none"
              aria-label="Chat message"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim() || typing}
              className="btn-primary btn-sm px-2.5"
              aria-label="Send message"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-ink-faint">
            <BrainCircuit className="h-3 w-3" />
            Simulated assistant — no live LLM calls. Responses are generated from demo data.
          </div>
        </div>
      </Panel>

      {/* Right — context & knowledge base */}
      <Panel className="flex max-h-[720px] flex-col overflow-hidden xl:max-h-[760px]">
        <PanelHeader title="Ask AI About" subtitle="Scope the assistant's context" />
        <div className="px-3 py-3.5">
          {CONTEXTS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCtx(c.key)}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
                ctx === c.key
                  ? 'border-sky-400/30 bg-sky-500/10'
                  : 'border-line bg-navy-900/40 text-ink-dim hover:border-line hover:bg-navy-800/60',
              )}
            >
              <Router className={cx('h-4 w-4', ctx === c.key ? 'text-sky-300' : 'text-ink-faint')} />
              <span className="min-w-0 flex-1">
                <span className={cx('block text-[11.5px] font-semibold', ctx === c.key ? 'text-ink' : 'text-ink-dim')}>
                  {c.label}
                </span>
                <span className="mt-0.5 block text-[9.5px] text-ink-faint">{c.desc}</span>
              </span>
            </button>
          ))}

          {ctx === 'machine' && (
            <select
              className="input mt-3"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              aria-label="Machine context"
            >
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.name}
                </option>
              ))}
            </select>
          )}
          {ctx === 'document' && (
            <select
              className="input mt-3"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              aria-label="Document context"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
<div className="border-t border-line px-3 py-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
              Knowledge Base
            </p>
            <span className="chip border-sky-400/20 bg-sky-500/10 text-sky-300">
              {documents.length} records · metadata only
            </span>
          </div>
          <div className="mt-2.5">
            <div id="assistant-document-upload">
              <UploadZone
                accept=".pdf,.docx,.txt,.csv,.xlsx"
                label="Upload document"
                hint="PDF · DOCX · TXT · CSV · XLSX"
                onFile={handleDocUpload}
                compact
                icon={<Database className="h-[18px] w-[18px]" />}
              />
            </div>
          </div>
          <div className="thin-scroll mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {documents
              .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
              .slice(0, 7)
              .map((d) => (
                <div key={d.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/40 p-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-700/60">
                    <FileText className="h-3.5 w-3.5 text-ink-dim" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-ink">{d.name}</p>
                    <p className="text-[9.5px] text-ink-faint">
                      {d.type} · {d.size} ·{' '}
                      {d.status === 'Metadata Only'
                        ? 'Metadata only · content not indexed'
                        : d.status === 'Processing'
                          ? 'Processing unavailable'
                          : 'Failed'}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="View document"
                    onClick={() =>
                      notify('warning', 'Document preview unavailable', 'Uploaded file contents are not stored in this demo.')
                    }
                    className="rounded-md p-1 text-ink-faint hover:bg-navy-700 hover:text-sky-300"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete document"
                    onClick={() => {
                      deleteDocument(d.id)
                      notify('warning', 'Document deleted', `${d.name} removed from the knowledge base.`)
                    }}
                    className="rounded-md p-1 text-ink-faint hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-sky-400/15 bg-sky-500/5 px-2.5 py-2">
            <BrainCircuit className="mt-1 h-4 w-4 shrink-0 text-sky-300" />
            <p className="text-[10.5px] leading-relaxed text-ink-faint">
              Document metadata is stored locally. File contents are not stored, parsed, indexed or searchable; this assistant cannot answer from uploaded documents.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}