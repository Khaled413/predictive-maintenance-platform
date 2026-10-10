import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowUp,
  Bot,
  Brain,
  BrainCircuit,
  Check,
  Database,
  Eye,
  FileText,
  ImagePlus,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  PhoneCall,
  PhoneOff,
  Router,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { usePreferences } from '../context/PreferencesContext'
import Panel, { PanelHeader } from '../components/ui/Panel'
import UploadZone from '../components/ui/UploadZone'
import { cx, formatDateTime, nowIso, timeAgo } from '../utils/helpers'
import { hasProvidedPrediction } from '../utils/operationalMetrics'
import type {
  Alert,
  ChatMessage,
  Conversation,
  Inspection,
  KnowledgeDoc,
  Machine,
  MaintenanceRecord,
  Thresholds,
} from '../types'
import {
  askAssistant,
  deleteIndexedAssistantDocument,
  getAssistantHealth,
  listIndexedAssistantDocuments,
  splitAssistantSpeech,
  synthesizeAssistantSpeech,
  transcribeAssistantAudio,
  uploadAssistantDocument,
} from '../data/assistantApi'
import type { AssistantHealth } from '../data/assistantApi'

type AskContext = 'factory' | 'machine' | 'knowledge' | 'document'

const CONTEXTS: { key: AskContext; label: string; desc: string }[] = [
  {
    key: 'factory',
    label: 'Entire Factory',
    desc: 'Current model outputs and work orders',
  },
  {
    key: 'machine',
    label: 'Specific Machine',
    desc: 'Current model output for one machine',
  },
  {
    key: 'knowledge',
    label: 'Knowledge Base',
    desc: 'Answers grounded in indexed documents',
  },
  { key: 'document', label: 'Uploaded Document', desc: 'Answers from a single file' },
]

const SUGGESTED_PROMPTS_EN = [
  'Which machines are currently at risk?',
  'Why is M-003 critical?',
  'Which machines need maintenance this week?',
  'What factors are affecting M-002?',
  'Summarize the maintenance history.',
  'What machines have abnormal vibration?',
]

const SUGGESTED_PROMPTS_AR = [
  'ما هي الآلات المعرضة للخطر حالياً؟',
  'لماذا تعتبر الآلة M-003 في حالة حرجة؟',
  'ما الآلات التي تحتاج إلى صيانة هذا الأسبوع؟',
  'ما العوامل المؤثرة على الآلة M-002؟',
  'لخص سجل الصيانة.',
  'ما الآلات التي تعاني من اهتزاز غير طبيعي؟',
]

const DOC_TYPES = ['PDF', 'TXT']
const VERCEL_REQUEST_BODY_LIMIT_BYTES = 4 * 1024 * 1024
const SAVED_CONVERSATIONS_KEY = 'iap-assistant-conversations-v1'

function isSavedConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false
  const conversation = value as Partial<Conversation>
  return (
    typeof conversation.id === 'string' &&
    typeof conversation.title === 'string' &&
    typeof conversation.updated === 'string' &&
    ['factory', 'machine', 'knowledge', 'document'].includes(
      conversation.context ?? ''
    ) &&
    (conversation.contextLabel === undefined ||
      typeof conversation.contextLabel === 'string') &&
    (conversation.machineId === undefined ||
      typeof conversation.machineId === 'string') &&
    (conversation.documentId === undefined ||
      typeof conversation.documentId === 'string') &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(
      (message) =>
        !!message &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        typeof message.timestamp === 'string' &&
        (message.sources === undefined ||
          (Array.isArray(message.sources) &&
            message.sources.every((source) => typeof source === 'string')))
    )
  )
}

function formatUploadLimit(bytes: number) {
  const megabytes = bytes / (1024 * 1024)
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${megabytes.toFixed(1)} MB`
}

function buildOperationalContext(
  context: AskContext,
  machineId: string,
  machines: Machine[],
  maintenance: MaintenanceRecord[],
  alerts: Alert[] = [],
  inspections: Inspection[] = [],
  thresholds?: Thresholds
) {
  const scopedMachines =
    context === 'machine'
      ? machines.filter((machine) => machine.id === machineId)
      : machines

  const totalMachines = machines.length
  const operationalCount = machines.filter((m) => m.status === 'Operational').length
  const warningCount = machines.filter((m) => m.status === 'Warning').length
  const criticalCount = machines.filter((m) => m.status === 'Critical').length
  const avgHealth = Math.round(
    machines.reduce(
      (acc, m) => acc + (m.prediction?.health_score ?? m.healthScore ?? 100),
      0
    ) / (totalMachines || 1)
  )

  const activeAlerts = alerts
    .filter(
      (a) =>
        a.status !== 'resolved' && (context !== 'machine' || a.machineId === machineId)
    )
    .slice(0, 15)
    .map((a) => ({
      machine_id: a.machineId,
      machine_name: a.machineName,
      message: a.message,
      type: a.type,
      severity: a.severity,
      timestamp: a.timestamp,
      recommended_action: a.recommendedAction,
    }))

  const recentInspections = inspections.slice(0, 15).map((i) => ({
    id: i.id,
    product_id: i.productId,
    result: i.result,
    defect_type: i.defectType,
    confidence: i.confidence,
    location: i.location,
    date: i.timestamp,
  }))

  const defectSummary = {
    total_inspected: inspections.length,
    passed: inspections.filter((i) => i.result === 'PASS').length,
    defective: inspections.filter((i) => i.result === 'FAIL').length,
  }

  const predictions = scopedMachines.filter(hasProvidedPrediction).map((machine) => {
    const prediction = machine.prediction!
    return {
      machine_id: machine.id,
      name: machine.name,
      type: machine.type,
      location: machine.location,
      health_score: prediction.health_score,
      failure_probability: prediction.failure_probability,
      failure_type: prediction.failure_type,
      status: prediction.status,
      recommendation: prediction.recommendation,
      prediction_source: prediction.prediction_source,
      latest_reading_at: prediction.latest_reading_at,
      sensors: machine.sensors.map((s) => ({
        name: s.name,
        value: s.value,
        unit: s.unit,
      })),
    }
  })

  const workOrders = maintenance
    .filter(
      (record) =>
        !record.isDemo && (context !== 'machine' || record.machineId === machineId)
    )
    .slice(0, 50)
    .map((record) => ({
      machine_id: record.machineId,
      type: record.type,
      reason: record.reason,
      priority: record.priority,
      date: record.date,
      status: record.status,
      cost: record.actualCost,
      technician: record.technician,
      notes: record.completionNotes,
    }))

  if (context === 'machine') {
    return JSON.stringify({
      scope: 'specific_machine',
      selected_machine_id: machineId,
      machine_profile: predictions[0] ?? null,
      machine_work_orders: workOrders,
      machine_alerts: activeAlerts,
      instruction:
        'Focus answer specifically on this machine, its sensor readings, failure risk, and work orders.',
    })
  }

  if (context === 'factory') {
    return JSON.stringify({
      scope: 'entire_factory',
      fleet_kpi: {
        total_machines: totalMachines,
        operational_machines: operationalCount,
        warning_machines: warningCount,
        critical_machines: criticalCount,
        average_health_score: avgHealth,
      },
      machines: predictions,
      maintenance_work_orders: workOrders,
      active_alerts: activeAlerts,
      quality_inspection: {
        summary: defectSummary,
        recent: recentInspections,
      },
      thresholds: thresholds ?? null,
      instruction:
        'Answer comprehensive questions across the entire platform including all machines, work orders, system alerts, and quality defect inspections.',
    })
  }

  if (context === 'knowledge') {
    return JSON.stringify({
      scope: 'knowledge_base',
      instruction:
        'Ground answer in equipment manuals, technical specifications, and maintenance procedures.',
      fleet_overview: { total_machines: totalMachines, critical_count: criticalCount },
    })
  }

  return JSON.stringify({
    scope: 'document',
    instruction: 'Ground answer strictly in the selected document file.',
  })
}

function formatSources(
  sources: { filename: string; page: number | null; section: string | null }[]
) {
  return sources.map(
    (source) =>
      `${source.filename}${source.page ? ` · p. ${source.page}` : ''}${source.section ? ` · ${source.section}` : ''}`
  )
}

type CtxMap = {
  factory: { label: string; desc: string }
  machine: { label: string; desc: string }
  knowledge: { label: string; desc: string }
  document: { label: string; desc: string }
}

export default function AssistantPage() {
  const {
    machines,
    maintenance,
    alerts,
    inspections,
    thresholds,
    documents,
    addDocument,
    deleteDocument,
    notify,
    refreshTimestamp,
  } = useApp()
  const { language, t } = usePreferences()
  const [searchParams, setSearchParams] = useSearchParams()

  const [ctx, setCtx] = useState<AskContext>('factory')
  const [machineId, setMachineId] = useState('M-003')
  const [docId, setDocId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [assistantHealth, setAssistantHealth] = useState<AssistantHealth | null>(null)
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [speakingMessage, setSpeakingMessage] = useState<string | null>(null)
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false)
  const [liveVoiceStatus, setLiveVoiceStatus] = useState<
    | 'idle'
    | 'requesting'
    | 'listening'
    | 'transcribing'
    | 'thinking'
    | 'speaking'
    | 'error'
  >('idle')
  const [thinkingMode, setThinkingMode] = useState(false)
  const [liveVoiceCaption, setLiveVoiceCaption] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const chatRequestId = useRef(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const liveVoiceActiveRef = useRef(false)
  const liveVoiceSessionRef = useRef(0)
  const liveVoiceStreamRef = useRef<MediaStream | null>(null)
  const liveVoiceRecorderRef = useRef<MediaRecorder | null>(null)
  const liveVoiceAudioContextRef = useRef<AudioContext | null>(null)
  const liveVoiceAnimationRef = useRef<number | null>(null)
  const liveVoiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const liveVoiceAudioUrlRef = useRef<string | null>(null)
  const liveVoiceAudioStopRef = useRef<(() => void) | null>(null)
  const liveVoiceUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const liveVoiceFallbackNotifiedRef = useRef(false)
  const liveVoiceRemoteTtsUnavailableRef = useRef(false)
  const liveVoiceRetryTimerRef = useRef<number | null>(null)
  const liveVoiceMessagesRef = useRef<ChatMessage[]>([])
  const liveVoiceContextRef = useRef<{
    context: AskContext
    machineId: string
    documentId?: string
    operationalContext: string
    reasoningMode: boolean
  } | null>(null)
  const indexedSyncStarted = useRef(false)
  const initialDocuments = useRef(documents)
  const appActions = useRef({ addDocument, notify })
  const indexedDocs = documents.filter((document) => !!document.indexedDocumentId)
  appActions.current = { addDocument, notify }

  const ctxMeta: CtxMap = {
    factory: { label: t('Entire Factory'), desc: t('Answers across the whole fleet') },
    machine: { label: t('Specific Machine'), desc: machineId },
    knowledge: {
      label: t('Knowledge Base'),
      desc: `${indexedDocs.length} ${t('indexed')}`,
    },
    document: {
      label: t('Uploaded Document'),
      desc:
        indexedDocs.find((d) => d.id === docId)?.name ??
        (language === 'ar' ? 'حدد ملفاً مفهرساً' : 'Select an indexed file'),
    },
  }
  const suggestedPrompts = language === 'ar' ? SUGGESTED_PROMPTS_AR : SUGGESTED_PROMPTS_EN

  useEffect(() => {
    void getAssistantHealth()
      .then((health) => {
        setAssistantHealth(health)
      })
      .catch((error: unknown) => {
        setAssistantHealth(null)
        appActions.current.notify(
          'warning',
          'AI Assistant status unavailable',
          error instanceof Error ? error.message : 'Could not reach the assistant API.'
        )
      })
    if (indexedSyncStarted.current) return
    indexedSyncStarted.current = true
    void listIndexedAssistantDocuments()
      .then((serverDocuments) => {
        serverDocuments.forEach((document) => {
          if (
            initialDocuments.current.some(
              (stored) => stored.indexedDocumentId === document.document_id
            )
          )
            return
          const extension = document.filename.split('.').pop()?.toUpperCase() ?? 'PDF'
          appActions.current.addDocument({
            id: `DOC-${document.document_id}`,
            name: document.filename,
            type: extension,
            size: 'Indexed',
            uploadDate: new Date(document.uploaded_at).toISOString(),
            status: 'Processed',
            pages: document.pages,
            source: 'Local RAG index',
            indexedDocumentId: document.document_id,
            chunkCount: document.chunks,
            isDemo: false,
          })
        })
      })
      .catch((error: unknown) =>
        appActions.current.notify(
          'warning',
          'Indexed documents could not be loaded',
          error instanceof Error
            ? error.message
            : 'Could not load the local document index.'
        )
      )
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_CONVERSATIONS_KEY)
      if (!stored) return
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed) || !parsed.every(isSavedConversation)) {
        throw new Error('Saved chat data has an invalid format.')
      }
      setConversations(parsed)
    } catch (error) {
      notify(
        'warning',
        'Saved conversations could not be loaded',
        error instanceof Error ? error.message : 'The local chat history is unavailable.'
      )
    }
  }, [notify])

  useEffect(() => {
    if (indexedDocs.some((document) => document.id === docId)) return
    setDocId(indexedDocs[0]?.id ?? '')
  }, [docId, indexedDocs])

  useEffect(
    () => () => {
      recorderRef.current?.stop()
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      audioRef.current?.pause()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      liveVoiceActiveRef.current = false
      liveVoiceSessionRef.current += 1
      if (liveVoiceAnimationRef.current !== null)
        cancelAnimationFrame(liveVoiceAnimationRef.current)
      if (liveVoiceRetryTimerRef.current !== null)
        window.clearTimeout(liveVoiceRetryTimerRef.current)
      if (liveVoiceRecorderRef.current?.state !== 'inactive')
        liveVoiceRecorderRef.current?.stop()
      liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      void liveVoiceAudioContextRef.current?.close()
      liveVoiceAudioRef.current?.pause()
      if (liveVoiceAudioUrlRef.current) URL.revokeObjectURL(liveVoiceAudioUrlRef.current)
      liveVoiceAudioStopRef.current?.()
    },
    []
  )

  const activeChatIdRef = useRef<string>(`cv-${Date.now()}`)

  const autoSaveConversation = (updatedMessages: ChatMessage[]) => {
    if (!updatedMessages.length) return
    const id = activeChatIdRef.current
    const firstUserMsg = updatedMessages
      .find((m) => m.role === 'user')
      ?.content.replace(/\n\[Image attached: .*\]$/, '')
    const autoTitle = firstUserMsg
      ? firstUserMsg.length > 38
        ? `${firstUserMsg.slice(0, 38)}…`
        : firstUserMsg
      : 'Chat'

    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id)
      const entry: Conversation = {
        id,
        title: existing && existing.title !== 'Chat' ? existing.title : autoTitle,
        updated: nowIso(),
        context: ctx,
        contextLabel: ctxMeta[ctx].label,
        machineId: ctx === 'machine' ? machineId : undefined,
        documentId: ctx === 'document' ? docId : undefined,
        messages: updatedMessages,
      }
      const next = existing
        ? prev.map((c) => (c.id === id ? entry : c))
        : [entry, ...prev]
      try {
        localStorage.setItem(SAVED_CONVERSATIONS_KEY, JSON.stringify(next))
      } catch {
        // storage quota
      }
      return next
    })
  }

  const send = async (textOverride?: string) => {
    const rawText = (textOverride ?? input).trim()
    if (!rawText || typing || (ctx === 'document' && !docId)) {
      if (ctx === 'document' && !docId) {
        notify(
          'warning',
          'Select an indexed document',
          'Upload and index a PDF or TXT file before asking about one document.'
        )
      }
      return
    }
    const currentImage = imageFile
    if (
      currentImage &&
      currentImage.size >
        (assistantHealth?.max_image_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES)
    ) {
      notify(
        'warning',
        'Image exceeds the upload limit',
        `Choose an image smaller than ${formatUploadLimit(assistantHealth?.max_image_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES)}.`
      )
      return
    }
    const isArabic = /[\u0600-\u06ff]/.test(rawText)
    const previousMessages = messages
    const requestId = ++chatRequestId.current
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: currentImage
        ? `${rawText}\n[Image attached: ${currentImage.name}]`
        : rawText,
      timestamp: nowIso(),
    }
    const nextMessages = [...previousMessages, userMsg]
    setMessages(nextMessages)
    autoSaveConversation(nextMessages)
    setInput('')
    setImageFile(null)
    setTyping(true)
    try {
      const reply = await askAssistant(
        {
          question: rawText,
          context: ctx,
          machineId: ctx === 'machine' ? machineId : undefined,
          documentId:
            ctx === 'document'
              ? indexedDocs.find((document) => document.id === docId)?.indexedDocumentId
              : undefined,
          history: previousMessages
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
          operationalContext: buildOperationalContext(
            ctx,
            machineId,
            machines,
            maintenance,
            alerts,
            inspections,
            thresholds
          ),
          reasoningMode: thinkingMode,
        },
        currentImage
      )
      if (requestId !== chatRequestId.current) return
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply.image_analysis
          ? `${isArabic ? 'تحليل الصورة' : 'Image analysis'}:\n${reply.image_analysis}\n\n${reply.answer}`
          : reply.answer,
        sources: formatSources(reply.sources),
        timestamp: nowIso(),
      }
      const allMessages = [...nextMessages, assistantMsg]
      setMessages(allMessages)
      autoSaveConversation(allMessages)
      setAssistantHealth((health) =>
        health ? { ...health, embedding_model_loaded: true } : health
      )
      refreshTimestamp()
    } catch (error) {
      if (requestId !== chatRequestId.current) return
      setImageFile(currentImage)
      notify(
        'error',
        'AI Assistant request failed',
        error instanceof Error
          ? error.message
          : 'The assistant could not complete the request.'
      )
    } finally {
      if (requestId === chatRequestId.current) setTyping(false)
    }
  }

  const newChat = () => {
    chatRequestId.current += 1
    activeChatIdRef.current = `cv-${Date.now()}`
    setMessages([])
    setInput('')
    setImageFile(null)
    setTyping(false)
  }

  const saveConversation = () => {
    if (!messages.length) return
    autoSaveConversation(messages)
    notify(
      'success',
      t('Conversation saved'),
      t('Added to your saved conversation history.')
    )
  }

  const deleteSavedConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updatedConversations = conversations.filter((c) => c.id !== id)
    try {
      localStorage.setItem(SAVED_CONVERSATIONS_KEY, JSON.stringify(updatedConversations))
    } catch (error) {
      notify(
        'error',
        t('Conversation could not be deleted'),
        error instanceof Error
          ? error.message
          : t('The local chat history is unavailable.')
      )
      return
    }
    setConversations(updatedConversations)
    if (activeChatIdRef.current === id) {
      newChat()
    }
    notify('info', t('Conversation deleted'))
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, typing])

  useEffect(() => {
    const inputElement = messageInputRef.current
    if (!inputElement) return
    inputElement.style.height = 'auto'
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 160)}px`
  }, [input])

  useEffect(() => {
    if (searchParams.get('upload') !== '1') return
    document
      .getElementById('assistant-document-upload')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!liveVoiceOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLiveVoice()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [liveVoiceOpen])

  const handleDocUpload = async (file: File) => {
    if (uploadingDocument) return
    const ext = (file.name.split('.').pop() ?? '').toUpperCase()
    if (!DOC_TYPES.includes(ext)) {
      notify('warning', 'Unsupported document format', 'Upload a PDF or UTF-8 TXT file.')
      return
    }
    const maxDocumentBytes =
      assistantHealth?.max_document_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES
    if (file.size > maxDocumentBytes) {
      notify(
        'warning',
        'Document exceeds the upload limit',
        `Choose a document smaller than ${formatUploadLimit(maxDocumentBytes)}.`
      )
      return
    }
    const sizeMb = file.size / (1024 * 1024)
    const size =
      sizeMb < 1
        ? `${Math.max(1, Math.round(sizeMb * 1000))} KB`
        : `${sizeMb.toFixed(1)} MB`
    setUploadingDocument(true)
    try {
      const indexed = await uploadAssistantDocument(file)
      const indexedDocument: KnowledgeDoc = {
        id: `DOC-${indexed.document_id}`,
        name: indexed.filename,
        type: ext,
        size,
        uploadDate: nowIso(),
        status: 'Processed',
        pages: indexed.pages,
        source: 'Indexed in local knowledge base',
        indexedDocumentId: indexed.document_id,
        chunkCount: indexed.chunks,
        isDemo: false,
      }
      initialDocuments.current = [...initialDocuments.current, indexedDocument]
      addDocument(indexedDocument)
      setAssistantHealth((health) =>
        health
          ? {
              ...health,
              indexed_documents: (health.indexed_documents ?? 0) + 1,
              embedding_model_loaded: true,
            }
          : health
      )
      notify(
        indexed.warnings.length ? 'warning' : 'success',
        indexed.warnings.length ? 'Document indexed with warnings' : 'Document indexed',
        `${file.name} · ${indexed.chunks} searchable sections${indexed.warnings.length ? ` · ${indexed.warnings.join(' ')}` : ''}`
      )
      refreshTimestamp()
    } catch (error) {
      notify(
        'error',
        'Document indexing failed',
        error instanceof Error ? error.message : 'The document was not indexed.'
      )
    } finally {
      setUploadingDocument(false)
    }
  }

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop()
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      notify(
        'warning',
        'Microphone unavailable',
        'This browser does not support audio recording.'
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        notify(
          'error',
          'Recording failed',
          'The browser could not record microphone audio.'
        )
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        recorderRef.current = null
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!audio.size) return
        const maxAudioBytes =
          assistantHealth?.max_audio_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES
        if (audio.size > maxAudioBytes) {
          notify(
            'warning',
            'Recording exceeds the upload limit',
            `Keep recordings under ${formatUploadLimit(maxAudioBytes)}.`
          )
          return
        }
        setTranscribing(true)
        void transcribeAssistantAudio(audio)
          .then((text) => {
            if (!text)
              throw new Error('No clear speech was recognized. Please try again.')
            setInput((current) => (current ? `${current} ${text}` : text))
          })
          .then(() =>
            notify(
              'success',
              t('Audio transcribed'),
              t('Review the recognized text before sending.')
            )
          )
          .catch((error: unknown) =>
            notify(
              'error',
              t('Audio transcription failed'),
              error instanceof Error
                ? error.message
                : t('The audio could not be transcribed.')
            )
          )
          .finally(() => setTranscribing(false))
      }
      recorder.start()
      setRecording(true)
    } catch (error) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      notify(
        'error',
        'Microphone access failed',
        error instanceof Error ? error.message : 'Allow microphone access and try again.'
      )
    }
  }

  const speakMessage = async (message: ChatMessage) => {
    if (speakingMessage === message.id) {
      audioRef.current?.pause()
      audioRef.current = null
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
      setSpeakingMessage(null)
      return
    }
    try {
      audioRef.current?.pause()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      const blob = await synthesizeAssistantSpeech(message.content)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audioUrlRef.current = url
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioUrlRef.current = null
        audioRef.current = null
        setSpeakingMessage(null)
      }
      setSpeakingMessage(message.id)
      await audio.play()
    } catch (error) {
      setSpeakingMessage(null)
      notify(
        'error',
        'Speech playback failed',
        error instanceof Error ? error.message : 'Could not generate speech.'
      )
    }
  }

  const closeLiveVoice = () => {
    liveVoiceActiveRef.current = false
    liveVoiceSessionRef.current += 1
    setLiveVoiceOpen(false)
    setLiveVoiceStatus('idle')
    setLiveVoiceCaption('')
    if (liveVoiceAnimationRef.current !== null) {
      cancelAnimationFrame(liveVoiceAnimationRef.current)
      liveVoiceAnimationRef.current = null
    }
    if (liveVoiceRetryTimerRef.current !== null) {
      window.clearTimeout(liveVoiceRetryTimerRef.current)
      liveVoiceRetryTimerRef.current = null
    }
    if (liveVoiceRecorderRef.current?.state !== 'inactive')
      liveVoiceRecorderRef.current?.stop()
    liveVoiceRecorderRef.current = null
    liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    liveVoiceStreamRef.current = null
    void liveVoiceAudioContextRef.current?.close()
    liveVoiceAudioContextRef.current = null
    liveVoiceAudioStopRef.current?.()
    liveVoiceAudioStopRef.current = null
    if (liveVoiceUtteranceRef.current) {
      window.speechSynthesis.cancel()
      liveVoiceUtteranceRef.current = null
    }
    liveVoiceAudioRef.current?.pause()
    liveVoiceAudioRef.current = null
    if (liveVoiceAudioUrlRef.current) URL.revokeObjectURL(liveVoiceAudioUrlRef.current)
    liveVoiceAudioUrlRef.current = null
  }

  const startLiveVoiceTurn = async (session: number): Promise<void> => {
    const stream = liveVoiceStreamRef.current
    if (!liveVoiceActiveRef.current || !stream || session !== liveVoiceSessionRef.current)
      return

    const audioContext = new AudioContext()
    liveVoiceAudioContextRef.current = audioContext
    try {
      await audioContext.resume()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      audioContext.createMediaStreamSource(stream).connect(analyser)
      const levels = new Uint8Array(analyser.fftSize)
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      let hasSpoken = false
      let silenceStartedAt: number | null = null
      const startedAt = Date.now()
      let stopped = false
      liveVoiceRecorderRef.current = recorder
      setLiveVoiceStatus('listening')

      const stopTurn = () => {
        if (stopped) return
        stopped = true
        if (liveVoiceAnimationRef.current !== null) {
          cancelAnimationFrame(liveVoiceAnimationRef.current)
          liveVoiceAnimationRef.current = null
        }
        if (recorder.state !== 'inactive') recorder.stop()
        if (liveVoiceAudioContextRef.current === audioContext) {
          liveVoiceAudioContextRef.current = null
        }
        void audioContext.close()
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        if (session !== liveVoiceSessionRef.current) return
        liveVoiceActiveRef.current = false
        liveVoiceSessionRef.current += 1
        liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
        liveVoiceStreamRef.current = null
        setLiveVoiceStatus('error')
        setLiveVoiceCaption(t('The browser could not record microphone audio.'))
        notify(
          'error',
          t('Live voice recording failed'),
          t('The browser could not record microphone audio.')
        )
      }
      recorder.onstop = () => {
        if (liveVoiceRecorderRef.current === recorder) liveVoiceRecorderRef.current = null
        if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
        if (!hasSpoken) {
          liveVoiceRetryTimerRef.current = window.setTimeout(
            () => void startLiveVoiceTurn(session),
            150
          )
          return
        }
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!audio.size) {
          liveVoiceRetryTimerRef.current = window.setTimeout(
            () => void startLiveVoiceTurn(session),
            150
          )
          return
        }
        void processLiveVoiceTurn(audio, session)
      }

      recorder.start()
      const detectSpeech = () => {
        if (
          stopped ||
          !liveVoiceActiveRef.current ||
          session !== liveVoiceSessionRef.current
        )
          return
        analyser.getByteTimeDomainData(levels)
        let sum = 0
        for (const sample of levels) {
          const centered = sample - 128
          sum += centered * centered
        }
        const volume = Math.sqrt(sum / levels.length)
        const now = Date.now()
        if (volume > 6) {
          hasSpoken = true
          silenceStartedAt = null
        } else if (hasSpoken) {
          silenceStartedAt ??= now
          if (now - silenceStartedAt >= 900) {
            stopTurn()
            return
          }
        }
        if (now - startedAt >= 20_000) {
          stopTurn()
          return
        }
        liveVoiceAnimationRef.current = requestAnimationFrame(detectSpeech)
      }
      liveVoiceAnimationRef.current = requestAnimationFrame(detectSpeech)
    } catch (error) {
      if (session !== liveVoiceSessionRef.current) return
      liveVoiceActiveRef.current = false
      liveVoiceSessionRef.current += 1
      liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      liveVoiceStreamRef.current = null
      void liveVoiceAudioContextRef.current?.close()
      liveVoiceAudioContextRef.current = null
      setLiveVoiceStatus('error')
      const detail =
        error instanceof Error
          ? error.message
          : t('Could not start microphone recording. Try again.')
      setLiveVoiceCaption(detail)
      notify('error', t('Live voice unavailable'), detail)
    }
  }

  const playLiveVoiceAudio = (speech: Blob, session: number): Promise<void> => {
    if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current)
      return Promise.resolve()
    const url = URL.createObjectURL(speech)
    const audioPlayer = new Audio(url)
    liveVoiceAudioRef.current = audioPlayer
    liveVoiceAudioUrlRef.current = url
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        audioPlayer.onended = null
        audioPlayer.onerror = null
        liveVoiceAudioStopRef.current = null
        if (liveVoiceAudioRef.current === audioPlayer) liveVoiceAudioRef.current = null
        if (liveVoiceAudioUrlRef.current === url) {
          URL.revokeObjectURL(url)
          liveVoiceAudioUrlRef.current = null
        }
        if (error) reject(error)
        else resolve()
      }
      liveVoiceAudioStopRef.current = () => finish()
      audioPlayer.onended = () => finish()
      audioPlayer.onerror = () =>
        finish(new Error('The generated speech could not be played.'))
      void audioPlayer.play().catch((error: unknown) => {
        finish(
          error instanceof Error
            ? error
            : new Error('The generated speech could not be played.')
        )
      })
    })
  }

  const playLiveVoiceText = (text: string, session: number): Promise<void> =>
    new Promise((resolve, reject) => {
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        reject(new Error(t('Browser speech is unavailable.')))
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      const isArabic = /[\u0600-\u06ff]/.test(text)
      utterance.lang = isArabic ? 'ar-EG' : 'en-US'
      const preferredVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith(isArabic ? 'ar' : 'en'))
      if (!preferredVoice) {
        reject(
          new Error(
            t(
              isArabic
                ? 'No Arabic browser voice is installed.'
                : 'No English browser voice is installed.'
            )
          )
        )
        return
      }
      utterance.voice = preferredVoice
      const finish = () => {
        if (liveVoiceUtteranceRef.current === utterance)
          liveVoiceUtteranceRef.current = null
      }
      utterance.onend = () => {
        finish()
        resolve()
      }
      utterance.onerror = (event) => {
        finish()
        if (
          !liveVoiceActiveRef.current ||
          session !== liveVoiceSessionRef.current ||
          event.error === 'canceled'
        ) {
          resolve()
          return
        }
        reject(new Error(t('Browser speech could not be played.')))
      }
      liveVoiceUtteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    })

  const processLiveVoiceTurn = async (audio: Blob, session: number) => {
    if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
    const maxAudioBytes =
      assistantHealth?.max_audio_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES
    if (audio.size > maxAudioBytes) {
      notify(
        'warning',
        'Voice turn exceeds the upload limit',
        `Keep each spoken turn under ${formatUploadLimit(maxAudioBytes)}.`
      )
      liveVoiceRetryTimerRef.current = window.setTimeout(
        () => void startLiveVoiceTurn(session),
        150
      )
      return
    }
    setLiveVoiceStatus('transcribing')
    try {
      const question = await transcribeAssistantAudio(audio)
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
      if (!question) {
        setLiveVoiceStatus('listening')
        setLiveVoiceCaption(t('No clear speech was recognized. Try speaking again.'))
        liveVoiceRetryTimerRef.current = window.setTimeout(
          () => void startLiveVoiceTurn(session),
          1200
        )
        return
      }
      setLiveVoiceCaption(question)

      const context = liveVoiceContextRef.current
      if (!context) throw new Error('The live conversation context is unavailable.')
      const previousMessages = liveVoiceMessagesRef.current
      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: question,
        timestamp: nowIso(),
      }
      const messagesWithQuestion = [...previousMessages, userMessage]
      liveVoiceMessagesRef.current = messagesWithQuestion
      setMessages(messagesWithQuestion)
      autoSaveConversation(messagesWithQuestion)
      setLiveVoiceStatus('thinking')

      const reply = await askAssistant({
        question,
        context: context.context,
        machineId: context.context === 'machine' ? context.machineId : undefined,
        documentId: context.documentId,
        history: previousMessages
          .slice(-10)
          .map(({ role, content }) => ({ role, content })),
        operationalContext: context.operationalContext,
        reasoningMode: context.reasoningMode,
        voice: true,
      })
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply.answer,
        sources: formatSources(reply.sources),
        timestamp: nowIso(),
      }
      const messagesWithAnswer = [...messagesWithQuestion, assistantMessage]
      liveVoiceMessagesRef.current = messagesWithAnswer
      setMessages(messagesWithAnswer)
      autoSaveConversation(messagesWithAnswer)
      setLiveVoiceCaption(reply.answer)
      setAssistantHealth((health) =>
        health ? { ...health, embedding_model_loaded: true } : health
      )
      refreshTimestamp()

      setLiveVoiceStatus('speaking')
      const speechChunks = await splitAssistantSpeech(reply.answer)
      if (!speechChunks.length)
        throw new Error('The assistant response could not be prepared for speech.')
      const pendingSpeech: Promise<Blob>[] = []
      let useBrowserVoice = liveVoiceRemoteTtsUnavailableRef.current
      const hasMatchingBrowserVoice = (text: string) => {
        if (!window.speechSynthesis) return false
        const language = /[\u0600-\u06ff]/.test(text) ? 'ar' : 'en'
        return window.speechSynthesis
          .getVoices()
          .some((voice) => voice.lang.toLowerCase().startsWith(language))
      }
      const speakWithBrowserVoice = async (text: string) => {
        if (!hasMatchingBrowserVoice(text)) {
          if (!liveVoiceFallbackNotifiedRef.current) {
            liveVoiceFallbackNotifiedRef.current = true
            notify(
              'warning',
              t('Voice output unavailable'),
              t(
                'The reply is available as text, but this browser has no matching speech voice installed.'
              )
            )
          }
          return false
        }
        await playLiveVoiceText(text, session)
        if (!liveVoiceFallbackNotifiedRef.current) {
          liveVoiceFallbackNotifiedRef.current = true
          notify(
            'warning',
            t('Using browser voice'),
            t(
              'Online speech is temporarily unavailable. This reply will use your browser voice.'
            )
          )
        }
        return true
      }
      const startSpeech = (index: number) => {
        pendingSpeech[index] = synthesizeAssistantSpeech(speechChunks[index])
        return pendingSpeech[index]
      }
      if (!useBrowserVoice && speechChunks.length) startSpeech(0)
      for (let index = 0; index < speechChunks.length; index += 1) {
        if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
        if (useBrowserVoice) {
          if (!(await speakWithBrowserVoice(speechChunks[index]))) break
          continue
        }
        let speech: Blob
        try {
          speech = await pendingSpeech[index]
        } catch (error) {
          if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined')
            throw error
          useBrowserVoice = true
          liveVoiceRemoteTtsUnavailableRef.current = true
          if (!(await speakWithBrowserVoice(speechChunks[index]))) break
          continue
        }
        if (index + 1 < speechChunks.length) startSpeech(index + 1)
        await playLiveVoiceAudio(speech, session)
      }
    } catch (error) {
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
      setLiveVoiceStatus('error')
      const detail =
        error instanceof Error
          ? error.message
          : t('The assistant could not complete this voice turn.')
      setLiveVoiceCaption(detail)
      notify('error', t('Live voice response failed'), detail)
      liveVoiceRetryTimerRef.current = window.setTimeout(
        () => void startLiveVoiceTurn(session),
        1500
      )
      return
    }

    if (liveVoiceActiveRef.current && session === liveVoiceSessionRef.current) {
      liveVoiceRetryTimerRef.current = window.setTimeout(
        () => void startLiveVoiceTurn(session),
        150
      )
    }
  }

  const startLiveVoice = async () => {
    if (liveVoiceActiveRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setLiveVoiceOpen(true)
      setLiveVoiceStatus('error')
      setLiveVoiceCaption(t('This browser does not support live microphone recording.'))
      notify(
        'warning',
        t('Microphone unavailable'),
        t('This browser does not support live microphone recording.')
      )
      return
    }
    if (assistantHealth?.status !== 'ready') {
      notify(
        'warning',
        'Assistant unavailable',
        assistantHealth?.message ?? 'Wait for the assistant status check to finish.'
      )
      return
    }
    const selectedDocumentId =
      ctx === 'document'
        ? indexedDocs.find((document) => document.id === docId)?.indexedDocumentId
        : undefined
    if (ctx === 'document' && !selectedDocumentId) {
      notify(
        'warning',
        'Select an indexed document',
        'Upload and index a PDF or TXT file before starting a document-scoped voice chat.'
      )
      return
    }

    const session = liveVoiceSessionRef.current + 1
    liveVoiceSessionRef.current = session
    liveVoiceActiveRef.current = true
    liveVoiceMessagesRef.current = messages
    liveVoiceContextRef.current = {
      context: ctx,
      machineId,
      documentId: selectedDocumentId,
      operationalContext: buildOperationalContext(
        ctx,
        machineId,
        machines,
        maintenance,
        alerts,
        inspections,
        thresholds
      ),
      reasoningMode: thinkingMode,
    }
    liveVoiceFallbackNotifiedRef.current = false
    liveVoiceRemoteTtsUnavailableRef.current = false
    setLiveVoiceOpen(true)
    setLiveVoiceStatus('requesting')
    setLiveVoiceCaption('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      liveVoiceStreamRef.current = stream
      await startLiveVoiceTurn(session)
    } catch (error) {
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
      liveVoiceActiveRef.current = false
      liveVoiceSessionRef.current += 1
      liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      liveVoiceStreamRef.current = null
      if (liveVoiceRecorderRef.current?.state !== 'inactive')
        liveVoiceRecorderRef.current?.stop()
      liveVoiceRecorderRef.current = null
      setLiveVoiceStatus('error')
      const detail =
        error instanceof Error
          ? error.message
          : t('Allow microphone access and try again.')
      setLiveVoiceCaption(detail)
      notify('error', t('Microphone access failed'), detail)
    }
  }

  const removeDocument = async (document: KnowledgeDoc) => {
    try {
      if (document.indexedDocumentId) {
        await deleteIndexedAssistantDocument(document.indexedDocumentId)
        setAssistantHealth((health) =>
          health
            ? {
                ...health,
                indexed_documents: Math.max(0, (health.indexed_documents ?? 1) - 1),
              }
            : health
        )
      }
      deleteDocument(document.id)
      notify(
        'info',
        'Document deleted',
        `${document.name} removed from the knowledge base.`
      )
    } catch (error) {
      notify(
        'error',
        'Document deletion failed',
        error instanceof Error ? error.message : 'The indexed document was not deleted.'
      )
    }
  }
  return (
    <>
      <div className="grid min-w-0 items-stretch gap-4 xl:h-[calc(100vh-185px)] xl:max-h-[calc(100vh-185px)] xl:grid-cols-[minmax(230px,260px)_minmax(0,1fr)_minmax(260px,300px)]">
        {/* Left — saved conversations */}
        <Panel className="flex h-full flex-col overflow-hidden">
          <PanelHeader
            title={t('Conversations')}
            subtitle={`${conversations.length} ${t('saved')}`}
            right={
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={newChat}
                title={t('Start a new chat')}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('New')}
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
                  : 'border-line bg-navy-900/40 hover:border-line hover:bg-navy-800/60'
              )}
            >
              <Bot
                className={cx(
                  'h-4 w-4',
                  messages.length === 0 ? 'text-sky-300' : 'text-ink-faint'
                )}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cx(
                    'block truncate text-[12px] font-semibold',
                    messages.length === 0 ? 'text-ink' : 'text-ink-dim'
                  )}
                >
                  {messages.length ? t('Current chat') : t('New conversation')}
                </span>
                <span className="mt-0.5 block text-[10px] text-ink-faint">
                  {messages.length
                    ? `${messages.length} ${t('messages')}`
                    : t('Ask about machines & maintenance')}
                </span>
              </span>
            </button>
            {conversations
              .filter((c) => !c.id.startsWith('cv-demo-'))
              .map((c) => (
                <div
                  key={c.id}
                  className="group flex w-full items-center gap-2 rounded-xl border border-line bg-navy-900/40 px-2.5 py-2 text-left transition-colors hover:bg-navy-800/60"
                >
                  <button
                    type="button"
                    onClick={() => {
                      chatRequestId.current += 1
                      activeChatIdRef.current = c.id
                      setTyping(false)
                      setMessages(c.messages)
                      setCtx(c.context)
                      if (
                        c.machineId &&
                        machines.some((machine) => machine.id === c.machineId)
                      ) {
                        setMachineId(c.machineId)
                      }
                      if (c.context === 'document') {
                        setDocId(
                          c.documentId &&
                            indexedDocs.some((document) => document.id === c.documentId)
                            ? c.documentId
                            : (indexedDocs[0]?.id ?? '')
                        )
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Bot className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-sky-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-ink-dim group-hover:text-ink">
                        {c.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-ink-faint">
                        {c.contextLabel} · {timeAgo(c.updated)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => deleteSavedConversation(c.id, e)}
                    className="rounded-lg p-1 text-ink-faint opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    title={t('Delete conversation')}
                    aria-label={t('Delete conversation')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
          <div className="shrink-0 flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Check className="h-3.5 w-3.5" />
              <span>{t('Saved automatically')}</span>
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm text-[11px]"
              onClick={saveConversation}
              disabled={!messages.length}
              title={t('Save Current Chat')}
            >
              <Database className="h-3 w-3" />
              {t('Save')}
            </button>
          </div>
        </Panel>

        {/* Center — chat */}
        <Panel className="flex h-full flex-col overflow-hidden">
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/70 to-blue-700">
                  <Bot className="h-4 w-4 text-white" />
                </span>
                <span>
                  <span className="block text-[13.5px] font-bold text-ink">
                    {t('Industrial AI Assistant')}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                    {ctxMeta[ctx].label} · {ctxMeta[ctx].desc}
                  </span>
                </span>
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (liveVoiceActiveRef.current) {
                      if (liveVoiceRetryTimerRef.current !== null) {
                        window.clearTimeout(liveVoiceRetryTimerRef.current)
                        liveVoiceRetryTimerRef.current = null
                      }
                      void startLiveVoiceTurn(liveVoiceSessionRef.current)
                    } else {
                      void startLiveVoice()
                    }
                  }}
                  disabled={typing || transcribing || assistantHealth?.status !== 'ready'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  title={t('Start live voice chat')}
                >
                  <PhoneCall className="h-3.5 w-3.5 text-sky-400" />
                  <span className="hidden sm:inline">
                    {language === 'ar' ? 'مكالمة صوتية' : 'Live Voice'}
                  </span>
                </button>
                <span
                  className={cx(
                    'chip',
                    assistantHealth?.status === 'ready'
                      ? 'border-sky-400/25 bg-sky-500/10 text-sky-300'
                      : 'border-amber-400/25 bg-amber-500/10 text-amber-300'
                  )}
                  title={
                    assistantHealth?.message ??
                    'RAG with local embeddings and current project data'
                  }
                >
                  <Sparkles className="h-3 w-3" />
                  {assistantHealth === null
                    ? language === 'ar'
                      ? 'فحص المساعد'
                      : 'Checking assistant'
                    : assistantHealth.status === 'ready'
                      ? language === 'ar'
                        ? 'مساعد RAG'
                        : 'RAG assistant'
                      : language === 'ar'
                        ? 'يلزم إعداد المساعد'
                        : 'Assistant setup needed'}
                </span>
              </div>
            }
          />
          <div
            ref={scrollRef}
            className="thin-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {messages.length === 0 && !typing && (
              <div className="animate-fadeUp rounded-2xl border border-line bg-navy-900/40 p-4">
                <p className="text-[13px] font-semibold text-ink">
                  {t('Ask about your machines, maintenance and documents')}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                  {t(
                    'Answers use current, non-demo model outputs and work orders, plus indexed document sources. Demo sensor values are excluded.'
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestedPrompts.map((p) => (
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
              <div
                key={msg.id}
                className={cx(
                  'flex items-start gap-2.5 animate-fadeUp',
                  msg.role === 'user' && 'flex-row-reverse'
                )}
              >
                <span
                  className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    msg.role === 'user'
                      ? 'bg-navy-700/70'
                      : 'bg-gradient-to-br from-sky-500/70 to-blue-700'
                  )}
                >
                  {msg.role === 'user' ? (
                    <span className="text-[10px] font-bold text-ink">
                      {language === 'ar' ? 'م.خ' : 'EK'}
                    </span>
                  ) : (
                    <Bot className="h-3.5 w-3.5 text-white" />
                  )}
                </span>
                <div
                  className={cx(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5',
                    msg.role === 'user'
                      ? 'chat-msg-user border border-sky-500/20 bg-sky-500/10'
                      : 'chat-msg-assistant border border-line bg-navy-800/70'
                  )}
                >
                  <div
                    dir="auto"
                    className={cx(
                      'text-[12.5px] leading-relaxed',
                      msg.role === 'user' ? 'text-ink' : 'text-ink-dim'
                    )}
                  >
                    <span className="whitespace-pre-line">{msg.content}</span>
                  </div>
                  {msg.sources?.length ? (
                    <div className="mt-2 rounded-xl border border-sky-400/15 bg-sky-500/5 px-2.5 py-1.5">
                      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-sky-400/90">
                        {t('Sources')}
                      </p>
                      {msg.sources.map((s) => (
                        <p
                          key={s}
                          className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-dim"
                        >
                          <FileText className="h-3 w-3 text-sky-300" />
                          {s}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {msg.role === 'assistant' && (
                    <button
                      type="button"
                      onClick={() => void speakMessage(msg)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] text-ink-faint transition-colors hover:bg-navy-700 hover:text-sky-300"
                      aria-label={
                        speakingMessage === msg.id
                          ? t('Stop audio')
                          : t('Read response aloud')
                      }
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      {speakingMessage === msg.id ? t('Stop audio') : t('Read aloud')}
                    </button>
                  )}
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
          <div className="shrink-0 border-t border-line px-3 py-3">
            {imageFile && (
              <div className="mb-2 flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] text-ink-dim shadow-sm animate-fadeUp">
                <ImagePlus className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {imageFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setImageFile(null)}
                  className="rounded-full p-0.5 text-ink-faint hover:bg-sky-500/20 hover:text-ink transition-colors"
                  aria-label={t('Remove attached image')}
                  title={t('Remove attached image')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                setImageFile(event.currentTarget.files?.[0] ?? null)
                event.currentTarget.value = ''
              }}
            />

            {/* ChatGPT-style floating capsule input bar */}
            <div
              role="group"
              aria-label={t('Chat controls')}
              className={cx(
                'chat-capsule flex gap-2 rounded-full px-3.5 py-1.5 transition-all',
                input.includes('\n') || input.length > 70
                  ? 'items-end rounded-[26px]'
                  : 'items-center'
              )}
            >
              {/* Left '+' button */}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={typing}
                className="btn-capsule-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                aria-label={t('Attach an image for visual analysis')}
                title={t('Attach image')}
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
              </button>

              {/* Center textarea */}
              <textarea
                ref={messageInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={1}
                maxLength={4000}
                dir="auto"
                placeholder={t(
                  imageFile ? 'Ask a question about this image…' : 'Ask anything'
                )}
                className="max-h-36 min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-5 outline-none"
                aria-label={t('Chat message')}
              />

              {/* Right side controls: Think + Mic + Blue Action Button */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Think button */}
                <button
                  type="button"
                  onClick={() => setThinkingMode((enabled) => !enabled)}
                  className={cx(
                    'btn-think flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all',
                    thinkingMode
                      ? 'border border-sky-400/50 bg-sky-500/20 text-sky-400 shadow-sm'
                      : ''
                  )}
                  aria-label={t('Deep industrial reasoning mode')}
                  aria-pressed={thinkingMode}
                  title={t('Deep industrial reasoning')}
                >
                  <Brain className="h-4 w-4" />
                  <span>{t('Think')}</span>
                </button>

                {/* Dictation / Microphone button */}
                <button
                  type="button"
                  onClick={() => void toggleRecording()}
                  disabled={typing || transcribing}
                  className={cx(
                    'btn-capsule-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
                    recording ? 'bg-red-500/20 text-red-400 animate-pulse' : ''
                  )}
                  aria-label={t(recording ? 'Stop recording' : 'Record a voice question')}
                  title={t(
                    recording
                      ? 'Stop recording'
                      : transcribing
                        ? 'Transcribing audio'
                        : 'Record a voice question'
                  )}
                  aria-pressed={recording}
                >
                  {recording ? (
                    <MicOff className="h-4 w-4" />
                  ) : transcribing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-sky-400" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>

                {/* Blue circular Action button: Waveform for Live Voice when empty / Up Arrow to Send when text entered */}
                <button
                  type="button"
                  onClick={() => (input.trim() ? void send() : void startLiveVoice())}
                  disabled={
                    typing ||
                    transcribing ||
                    recording ||
                    (!input.trim() && assistantHealth?.status !== 'ready')
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d72fe] hover:bg-[#155dfc] active:scale-95 text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:bg-neutral-500 disabled:opacity-50"
                  aria-label={t(input.trim() ? 'Send message' : 'Start live voice chat')}
                  title={t(input.trim() ? 'Send message' : 'Start live voice chat')}
                >
                  {typing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : input.trim() ? (
                    <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex items-center justify-center gap-[2.5px] h-3.5"
                    >
                      <span className="h-2 w-[2px] rounded-full bg-white" />
                      <span className="h-3.5 w-[2px] rounded-full bg-white" />
                      <span className="h-2.5 w-[2px] rounded-full bg-white" />
                      <span className="h-1.5 w-[2px] rounded-full bg-white" />
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between px-1 text-[9.5px] text-ink-faint">
              <span>{t('Enter to send · Shift+Enter for a new line')}</span>
              <span className="flex items-center gap-1">
                <BrainCircuit className="h-3 w-3" />
                {assistantHealth?.status === 'ready'
                  ? language === 'ar'
                    ? 'بحث المستندات المحلية · بيانات النماذج · Groq AI'
                    : 'Local document search · project model data · Groq AI'
                  : (assistantHealth?.message ??
                    (language === 'ar'
                      ? 'قم بتوصيل محرك المساعد وتهيئة GROQ_API_KEY للبدء.'
                      : 'Connect the assistant runtime and configure GROQ_API_KEY to begin.'))}
              </span>
            </div>
          </div>
        </Panel>

        {/* Right — context & knowledge base */}
        <Panel className="flex h-full flex-col overflow-hidden">
          <PanelHeader
            title={t('Ask AI About')}
            subtitle={t("Scope the assistant's context")}
          />
          <div className="thin-scroll flex-1 space-y-3.5 overflow-y-auto px-3 py-3.5">
            <div className="space-y-2">
              {CONTEXTS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCtx(c.key)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
                    ctx === c.key
                      ? 'border-sky-400/30 bg-sky-500/10'
                      : 'border-line bg-navy-900/40 text-ink-dim hover:border-line hover:bg-navy-800/60'
                  )}
                >
                  <Router
                    className={cx(
                      'h-4 w-4',
                      ctx === c.key ? 'text-sky-300' : 'text-ink-faint'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        'block text-[11.5px] font-semibold',
                        ctx === c.key ? 'text-ink' : 'text-ink-dim'
                      )}
                    >
                      {t(c.label)}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] text-ink-faint">
                      {t(c.desc)}
                    </span>
                  </span>
                </button>
              ))}

              {ctx === 'machine' && (
                <select
                  className="input mt-3"
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  aria-label={t('Specific Machine')}
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
                  aria-label={t('Uploaded Document')}
                >
                  {!indexedDocs.length && (
                    <option value="">
                      {language === 'ar'
                        ? 'لا توجد مستندات مفهرسة متاحة'
                        : 'No indexed documents available'}
                    </option>
                  )}
                  {indexedDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="border-t border-line pt-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t('Knowledge Base')}
                </p>
                <span className="chip border-sky-400/20 bg-sky-500/10 text-sky-300">
                  {indexedDocs.length} {t('indexed')}
                </span>
              </div>
              <div className="mt-2.5">
                <div id="assistant-document-upload">
                  <UploadZone
                    accept=".pdf,.txt"
                    label={
                      uploadingDocument
                        ? language === 'ar'
                          ? 'جارٍ فهرسة المستند…'
                          : 'Indexing document…'
                        : language === 'ar'
                          ? 'رفع وفهرسة المستند'
                          : 'Upload and index'
                    }
                    hint={`PDF · UTF-8 TXT · max ${formatUploadLimit(assistantHealth?.max_document_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES)}`}
                    onFile={(file) => void handleDocUpload(file)}
                    compact
                    icon={<Database className="h-[18px] w-[18px]" />}
                  />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {[...documents]
                  .sort(
                    (a, b) =>
                      new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
                  )
                  .slice(0, 7)
                  .map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/40 p-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-700/60">
                        <FileText className="h-3.5 w-3.5 text-ink-dim" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-ink">
                          {d.name}
                        </p>
                        <p className="text-[9.5px] text-ink-faint">
                          {d.type} · {d.size} ·{' '}
                          {d.indexedDocumentId
                            ? `${d.pages ?? 0} ${language === 'ar' ? 'صفحات' : 'pages'} · ${d.chunkCount ?? 0} ${language === 'ar' ? 'أقسام مفهرسة' : 'searchable sections'}`
                            : d.isDemo
                              ? language === 'ar'
                                ? 'بيانات تجريبية · غير مفهرس'
                                : 'Demo metadata · not indexed'
                              : language === 'ar'
                                ? 'غير مفهرس'
                                : 'Not indexed'}
                        </p>
                      </div>
                      <button
                        type="button"
                        title={language === 'ar' ? 'عرض المستند' : 'View document'}
                        onClick={() =>
                          notify(
                            'warning',
                            'Document preview unavailable',
                            'Uploaded file contents are not stored in this demo.'
                          )
                        }
                        className="rounded-md p-1 text-ink-faint hover:bg-navy-700 hover:text-sky-300"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={language === 'ar' ? 'حذف المستند' : 'Delete document'}
                        onClick={() => void removeDocument(d)}
                        disabled={uploadingDocument}
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
                  {language === 'ar'
                    ? 'تُقسّم ملفات PDF وTXT وتُفهرس محلياً في الفهرس الشعاعي للمشروع. تُرسل الأسئلة وسياق المستندات والصور/الصوت إلى خدمات الذكاء الاصطناعي السحابية المهيأة.'
                    : "PDF and TXT contents are chunked and embedded locally in the project's vector index. Questions, selected document passages, and optional images or audio are sent to the configured cloud AI services."}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>
      {liveVoiceOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#050b15]/85 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLiveVoice()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-voice-title"
            className="relative flex w-full max-w-md flex-col items-center overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-b from-navy-800 to-navy-950 px-6 py-7 text-center shadow-2xl shadow-sky-950/40"
          >
            <button
              type="button"
              onClick={closeLiveVoice}
              className="absolute right-4 top-4 rounded-lg p-2 text-ink-faint transition-colors hover:bg-navy-700 hover:text-ink"
              aria-label={t('Close live voice chat')}
            >
              <X className="h-4 w-4" />
            </button>
            <span className="chip border-sky-400/25 bg-sky-500/10 text-sky-300">
              <PhoneCall className="h-3 w-3" />
              {t('Live voice chat')}
            </span>
            <h2 id="live-voice-title" className="mt-4 text-base font-bold text-ink">
              {t('Talk to the AI Assistant')}
            </h2>
            <p className="mt-1 text-[11px] text-ink-faint">
              {ctxMeta[ctx].label} · {ctxMeta[ctx].desc}
            </p>
            <div className="relative my-7 flex h-36 w-36 items-center justify-center">
              {(liveVoiceStatus === 'listening' || liveVoiceStatus === 'speaking') && (
                <span className="absolute inset-1 animate-ping rounded-full bg-sky-400/10" />
              )}
              <span
                className={cx(
                  'relative flex h-28 w-28 items-center justify-center rounded-full border shadow-[0_0_60px_rgba(56,189,248,0.16)] transition-all',
                  liveVoiceStatus === 'error'
                    ? 'border-red-400/30 bg-red-500/10 text-red-300'
                    : liveVoiceStatus === 'thinking' || liveVoiceStatus === 'transcribing'
                      ? 'border-amber-400/30 bg-amber-500/10 text-amber-300'
                      : 'border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-blue-700/20 text-sky-200'
                )}
              >
                {liveVoiceStatus === 'requesting' ||
                liveVoiceStatus === 'transcribing' ||
                liveVoiceStatus === 'thinking' ? (
                  <LoaderCircle className="h-9 w-9 animate-spin" />
                ) : liveVoiceStatus === 'speaking' ? (
                  <Volume2 className="h-9 w-9" />
                ) : (
                  <Mic className="h-9 w-9" />
                )}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-ink" aria-live="polite">
              {liveVoiceStatus === 'requesting' && t('Requesting microphone access…')}
              {liveVoiceStatus === 'listening' && t('Listening — speak naturally')}
              {liveVoiceStatus === 'transcribing' && t('Recognizing your speech…')}
              {liveVoiceStatus === 'thinking' && t('Preparing an answer…')}
              {liveVoiceStatus === 'speaking' && t('Speaking…')}
              {liveVoiceStatus === 'error' && t('Live voice needs attention')}
            </p>
            <p className="mt-2 min-h-12 max-w-sm whitespace-pre-line text-[11px] leading-relaxed text-ink-dim">
              {liveVoiceCaption ||
                t(
                  'Your microphone stays active during the call. It pauses while the assistant responds.'
                )}
            </p>
            {liveVoiceStatus === 'error' && (
              <button
                type="button"
                onClick={() => void startLiveVoice()}
                className="mt-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-sky-500/20"
              >
                {t('Try again')}
              </button>
            )}
            <button
              type="button"
              onClick={closeLiveVoice}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/20"
            >
              <PhoneOff className="h-4 w-4" />
              {t('End voice chat')}
            </button>
          </section>
        </div>
      )}
    </>
  )
}
