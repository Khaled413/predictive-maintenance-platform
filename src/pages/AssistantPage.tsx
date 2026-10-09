import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bot,
  BrainCircuit,
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
  SendHorizonal,
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
import type { ChatMessage, Conversation, KnowledgeDoc, Machine, MaintenanceRecord } from '../types'
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
  { key: 'factory', label: 'Entire Factory', desc: 'Current model outputs and work orders' },
  { key: 'machine', label: 'Specific Machine', desc: 'Current model output for one machine' },
  { key: 'knowledge', label: 'Knowledge Base', desc: 'Answers grounded in indexed documents' },
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

const DOC_TYPES = ['PDF', 'TXT']
const VERCEL_REQUEST_BODY_LIMIT_BYTES = 4 * 1024 * 1024

function formatUploadLimit(bytes: number) {
  const megabytes = bytes / (1024 * 1024)
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${megabytes.toFixed(1)} MB`
}

function buildOperationalContext(
  context: AskContext,
  machineId: string,
  machines: Machine[],
  maintenance: MaintenanceRecord[],
) {
  if (context !== 'factory' && context !== 'machine') return JSON.stringify({ scope: context })
  const scopedMachines = context === 'machine'
    ? machines.filter((machine) => machine.id === machineId)
    : machines
  const predictions = scopedMachines.filter(hasProvidedPrediction).map((machine) => {
    const prediction = machine.prediction!
    return {
      machine_id: machine.id,
      name: machine.name,
      type: machine.type,
      health_score: prediction.health_score,
      failure_probability: prediction.failure_probability,
      failure_type: prediction.failure_type,
      status: prediction.status,
      recommendation: prediction.recommendation,
      prediction_source: prediction.prediction_source,
      data_source: prediction.data_source,
      machine_inputs_simulated: prediction.machine_inputs_simulated,
      sensor_inputs_simulated: prediction.sensor_inputs_simulated,
      latest_reading_at: prediction.latest_reading_at,
      timestamp: prediction.timestamp,
    }
  })
  const workOrders = maintenance
    .filter((record) =>
      !record.isDemo &&
      (context !== 'machine' || record.machineId === machineId),
    )
    .slice(0, 100)
    .map((record) => ({
      machine_id: record.machineId,
      type: record.type,
      reason: record.reason,
      priority: record.priority,
      date: record.date,
      status: record.status,
      actual_cost: record.actualCost,
      completion_notes: record.completionNotes,
    }))
  return JSON.stringify({
    scope: context,
    generated_at: new Date().toISOString(),
    source: 'Current project model outputs and non-demo work orders',
    model_predictions: predictions,
    unavailable_prediction_machine_ids: scopedMachines
      .filter((machine) => !hasProvidedPrediction(machine))
      .map((machine) => machine.id),
    work_orders: workOrders,
    rule: 'Illustrative sensor display values and demo records are excluded.',
  })
}

function formatSources(
  sources: { filename: string; page: number | null; section: string | null }[],
) {
  return sources.map((source) =>
    `${source.filename}${source.page ? ` · p. ${source.page}` : ''}${source.section ? ` · ${source.section}` : ''}`,
  )
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
  const [liveVoiceStatus, setLiveVoiceStatus] = useState<'idle' | 'requesting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'>('idle')
  const [liveVoiceCaption, setLiveVoiceCaption] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
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
  const liveVoiceRetryTimerRef = useRef<number | null>(null)
  const liveVoiceMessagesRef = useRef<ChatMessage[]>([])
  const liveVoiceContextRef = useRef<{
    context: AskContext
    machineId: string
    documentId?: string
    operationalContext: string
  } | null>(null)
  const indexedSyncStarted = useRef(false)
  const initialDocuments = useRef(documents)
  const appActions = useRef({ addDocument, notify })
  const indexedDocs = documents.filter((document) => !!document.indexedDocumentId)
  appActions.current = { addDocument, notify }

  const ctxMeta: CtxMap = {
    factory: { label: 'Entire Factory', desc: 'Answers across the whole fleet' },
    machine: { label: 'Specific Machine', desc: machineId },
    knowledge: { label: 'Knowledge Base', desc: `${indexedDocs.length} indexed documents` },
    document: { label: 'Uploaded Document', desc: indexedDocs.find((d) => d.id === docId)?.name ?? 'Select an indexed file' },
  }

  useEffect(() => {
    void getAssistantHealth()
      .then((health) => {
        setAssistantHealth(health)
      })
      .catch((error: unknown) => {
        setAssistantHealth(null)
        appActions.current.notify('warning', 'AI Assistant status unavailable', error instanceof Error ? error.message : 'Could not reach the assistant API.')
      })
    if (indexedSyncStarted.current) return
    indexedSyncStarted.current = true
    void listIndexedAssistantDocuments()
      .then((serverDocuments) => {
        serverDocuments.forEach((document) => {
          if (initialDocuments.current.some((stored) => stored.indexedDocumentId === document.document_id)) return
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
      .catch((error: unknown) => appActions.current.notify(
        'warning',
        'Indexed documents could not be loaded',
        error instanceof Error ? error.message : 'Could not load the local document index.',
      ))
  }, [])

  useEffect(() => {
    if (indexedDocs.some((document) => document.id === docId)) return
    setDocId(indexedDocs[0]?.id ?? '')
  }, [docId, indexedDocs])

  useEffect(() => () => {
    recorderRef.current?.stop()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    audioRef.current?.pause()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    liveVoiceActiveRef.current = false
    liveVoiceSessionRef.current += 1
    if (liveVoiceAnimationRef.current !== null) cancelAnimationFrame(liveVoiceAnimationRef.current)
    if (liveVoiceRetryTimerRef.current !== null) window.clearTimeout(liveVoiceRetryTimerRef.current)
    if (liveVoiceRecorderRef.current?.state !== 'inactive') liveVoiceRecorderRef.current?.stop()
    liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    void liveVoiceAudioContextRef.current?.close()
    liveVoiceAudioRef.current?.pause()
    if (liveVoiceAudioUrlRef.current) URL.revokeObjectURL(liveVoiceAudioUrlRef.current)
    liveVoiceAudioStopRef.current?.()
  }, [])

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || typing || (ctx === 'document' && !docId)) {
      if (ctx === 'document' && !docId) {
        notify('warning', 'Select an indexed document', 'Upload and index a PDF or TXT file before asking about one document.')
      }
      return
    }
    const currentImage = imageFile
    if (currentImage && currentImage.size > (assistantHealth?.max_image_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES)) {
      notify(
        'warning',
        'Image exceeds the upload limit',
        `Choose an image smaller than ${formatUploadLimit(assistantHealth?.max_image_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES)}.`,
      )
      return
    }
    const previousMessages = messages
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: currentImage ? `${text}\n[Image attached: ${currentImage.name}]` : text,
      timestamp: nowIso(),
    }
    setMessages([...previousMessages, userMsg])
    setInput('')
    setImageFile(null)
    setTyping(true)
    try {
      const reply = await askAssistant({
        question: text,
        context: ctx,
        machineId: ctx === 'machine' ? machineId : undefined,
        documentId: ctx === 'document'
          ? indexedDocs.find((document) => document.id === docId)?.indexedDocumentId
          : undefined,
        history: previousMessages.slice(-10).map(({ role, content }) => ({ role, content })),
        operationalContext: buildOperationalContext(ctx, machineId, machines, maintenance),
      }, currentImage)
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply.image_analysis
          ? `Image analysis:\n${reply.image_analysis}\n\n${reply.answer}`
          : reply.answer,
        sources: formatSources(reply.sources),
        timestamp: nowIso(),
      }
      setMessages((m) => [...m, assistantMsg])
      setAssistantHealth((health) => health ? { ...health, embedding_model_loaded: true } : health)
      refreshTimestamp()
    } catch (error) {
      setImageFile(currentImage)
      notify('error', 'AI Assistant request failed', error instanceof Error ? error.message : 'The assistant could not complete the request.')
    } finally {
      setTyping(false)
    }
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
    const maxDocumentBytes = assistantHealth?.max_document_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES
    if (file.size > maxDocumentBytes) {
      notify(
        'warning',
        'Document exceeds the upload limit',
        `Choose a document smaller than ${formatUploadLimit(maxDocumentBytes)}.`,
      )
      return
    }
    const sizeMb = file.size / (1024 * 1024)
    const size = sizeMb < 1 ? `${Math.max(1, Math.round(sizeMb * 1000))} KB` : `${(sizeMb).toFixed(1)} MB`
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
      setAssistantHealth((health) => health
        ? { ...health, indexed_documents: (health.indexed_documents ?? 0) + 1, embedding_model_loaded: true }
        : health)
      notify(
        indexed.warnings.length ? 'warning' : 'success',
        indexed.warnings.length ? 'Document indexed with warnings' : 'Document indexed',
        `${file.name} · ${indexed.chunks} searchable sections${indexed.warnings.length ? ` · ${indexed.warnings.join(' ')}` : ''}`,
      )
      refreshTimestamp()
    } catch (error) {
      notify('error', 'Document indexing failed', error instanceof Error ? error.message : 'The document was not indexed.')
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
      notify('warning', 'Microphone unavailable', 'This browser does not support audio recording.')
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
        notify('error', 'Recording failed', 'The browser could not record microphone audio.')
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        recorderRef.current = null
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!audio.size) return
        const maxAudioBytes = assistantHealth?.max_audio_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES
        if (audio.size > maxAudioBytes) {
          notify(
            'warning',
            'Recording exceeds the upload limit',
            `Keep recordings under ${formatUploadLimit(maxAudioBytes)}.`,
          )
          return
        }
        setTranscribing(true)
        void transcribeAssistantAudio(audio)
          .then((text) => setInput((current) => current ? `${current} ${text}` : text))
          .then(() => notify('success', 'Audio transcribed', 'Review the recognized text before sending.'))
          .catch((error: unknown) => notify('error', 'Audio transcription failed', error instanceof Error ? error.message : 'The audio could not be transcribed.'))
          .finally(() => setTranscribing(false))
      }
      recorder.start()
      setRecording(true)
    } catch (error) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      notify('error', 'Microphone access failed', error instanceof Error ? error.message : 'Allow microphone access and try again.')
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
      notify('error', 'Speech playback failed', error instanceof Error ? error.message : 'Could not generate speech.')
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
    if (liveVoiceRecorderRef.current?.state !== 'inactive') liveVoiceRecorderRef.current?.stop()
    liveVoiceRecorderRef.current = null
    liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    liveVoiceStreamRef.current = null
    void liveVoiceAudioContextRef.current?.close()
    liveVoiceAudioContextRef.current = null
    liveVoiceAudioStopRef.current?.()
    liveVoiceAudioStopRef.current = null
    liveVoiceAudioRef.current?.pause()
    liveVoiceAudioRef.current = null
    if (liveVoiceAudioUrlRef.current) URL.revokeObjectURL(liveVoiceAudioUrlRef.current)
    liveVoiceAudioUrlRef.current = null
  }

  const startLiveVoiceTurn = async (session: number): Promise<void> => {
    const stream = liveVoiceStreamRef.current
    if (!liveVoiceActiveRef.current || !stream || session !== liveVoiceSessionRef.current) return

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
        notify('error', 'Live voice recording failed', 'The browser could not record microphone audio.')
        closeLiveVoice()
      }
      recorder.onstop = () => {
        if (liveVoiceRecorderRef.current === recorder) liveVoiceRecorderRef.current = null
        if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
        if (!hasSpoken) {
          liveVoiceRetryTimerRef.current = window.setTimeout(() => void startLiveVoiceTurn(session), 150)
          return
        }
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!audio.size) {
          liveVoiceRetryTimerRef.current = window.setTimeout(() => void startLiveVoiceTurn(session), 150)
          return
        }
        void processLiveVoiceTurn(audio, session)
      }

      recorder.start()
      const detectSpeech = () => {
        if (stopped || !liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
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
      notify('error', 'Live voice unavailable', error instanceof Error ? error.message : 'Could not start microphone recording.')
      closeLiveVoice()
    }
  }

  const playLiveVoiceAudio = (speech: Blob, session: number): Promise<void> => {
    if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return Promise.resolve()
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
      audioPlayer.onerror = () => finish(new Error('The generated speech could not be played.'))
      void audioPlayer.play().catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error('The generated speech could not be played.'))
      })
    })
  }

  const processLiveVoiceTurn = async (audio: Blob, session: number) => {
    if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
    const maxAudioBytes = assistantHealth?.max_audio_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES
    if (audio.size > maxAudioBytes) {
      notify(
        'warning',
        'Voice turn exceeds the upload limit',
        `Keep each spoken turn under ${formatUploadLimit(maxAudioBytes)}.`,
      )
      liveVoiceRetryTimerRef.current = window.setTimeout(() => void startLiveVoiceTurn(session), 150)
      return
    }
    setLiveVoiceStatus('transcribing')
    try {
      const question = await transcribeAssistantAudio(audio)
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
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
      setLiveVoiceStatus('thinking')

      const reply = await askAssistant({
        question,
        context: context.context,
        machineId: context.context === 'machine' ? context.machineId : undefined,
        documentId: context.documentId,
        history: previousMessages.slice(-10).map(({ role, content }) => ({ role, content })),
        operationalContext: context.operationalContext,
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
      setLiveVoiceCaption(reply.answer)
      setAssistantHealth((health) => health ? { ...health, embedding_model_loaded: true } : health)
      refreshTimestamp()

      setLiveVoiceStatus('speaking')
      const speechChunks = await splitAssistantSpeech(reply.answer)
      if (!speechChunks.length) throw new Error('The assistant response could not be prepared for speech.')
      const pendingSpeech: Promise<Blob>[] = []
      const startSpeech = (index: number) => {
        pendingSpeech[index] = synthesizeAssistantSpeech(speechChunks[index])
        return pendingSpeech[index]
      }
      if (speechChunks.length) startSpeech(0)
      for (let index = 0; index < speechChunks.length; index += 1) {
        if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
        const speech = await pendingSpeech[index]
        if (index + 1 < speechChunks.length) startSpeech(index + 1)
        await playLiveVoiceAudio(speech, session)
      }
    } catch (error) {
      if (!liveVoiceActiveRef.current || session !== liveVoiceSessionRef.current) return
      notify(
        'error',
        'Live voice response failed',
        error instanceof Error ? error.message : 'The assistant could not complete this voice turn.',
      )
    }

    if (liveVoiceActiveRef.current && session === liveVoiceSessionRef.current) {
      liveVoiceRetryTimerRef.current = window.setTimeout(() => void startLiveVoiceTurn(session), 150)
    }
  }

  const startLiveVoice = async () => {
    if (liveVoiceActiveRef.current) return
    if (assistantHealth?.status !== 'ready') {
      notify('warning', 'Assistant unavailable', assistantHealth?.message ?? 'Wait for the assistant status check to finish.')
      return
    }
    const selectedDocumentId = ctx === 'document'
      ? indexedDocs.find((document) => document.id === docId)?.indexedDocumentId
      : undefined
    if (ctx === 'document' && !selectedDocumentId) {
      notify('warning', 'Select an indexed document', 'Upload and index a PDF or TXT file before starting a document-scoped voice chat.')
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
      operationalContext: buildOperationalContext(ctx, machineId, machines, maintenance),
    }
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
      setLiveVoiceStatus('error')
      notify('error', 'Microphone access failed', error instanceof Error ? error.message : 'Allow microphone access and try again.')
    }
  }

  const removeDocument = async (document: KnowledgeDoc) => {
    try {
      if (document.indexedDocumentId) {
        await deleteIndexedAssistantDocument(document.indexedDocumentId)
        setAssistantHealth((health) => health
          ? { ...health, indexed_documents: Math.max(0, (health.indexed_documents ?? 1) - 1) }
          : health)
      }
      deleteDocument(document.id)
      notify('info', 'Document deleted', `${document.name} removed from the knowledge base.`)
    } catch (error) {
      notify('error', 'Document deletion failed', error instanceof Error ? error.message : 'The indexed document was not deleted.')
    }
  }
return (
  <>
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
            <span
              className={cx(
                'chip',
                assistantHealth?.status === 'ready'
                  ? 'border-sky-400/25 bg-sky-500/10 text-sky-300'
                  : 'border-amber-400/25 bg-amber-500/10 text-amber-300',
              )}
              title={assistantHealth?.message ?? 'RAG with local embeddings and current project data'}
            >
              <Sparkles className="h-3 w-3" />
              {assistantHealth === null ? 'Checking assistant' : assistantHealth.status === 'ready' ? 'RAG assistant' : 'Assistant setup needed'}
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
                Answers use current, non-demo model outputs and work orders, plus indexed document sources. Demo sensor values are excluded.
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
                {msg.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => void speakMessage(msg)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] text-ink-faint transition-colors hover:bg-navy-700 hover:text-sky-300"
                    aria-label={speakingMessage === msg.id ? 'Stop speaking' : 'Read response aloud'}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    {speakingMessage === msg.id ? 'Stop audio' : 'Read aloud'}
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
<div className="border-t border-line px-3 py-3">
          {imageFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-500/5 px-2.5 py-1.5 text-[10.5px] text-ink-dim">
              <ImagePlus className="h-3.5 w-3.5 shrink-0 text-sky-300" />
              <span className="min-w-0 flex-1 truncate">{imageFile.name}</span>
              <button type="button" onClick={() => setImageFile(null)} aria-label="Remove attached image">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/60 px-3 py-2.5">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={typing}
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-navy-700 hover:text-sky-300 disabled:opacity-40"
              aria-label="Attach an image for visual analysis"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void startLiveVoice()}
              disabled={typing || transcribing || assistantHealth?.status !== 'ready'}
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sky-500/10 hover:text-sky-300 disabled:opacity-40"
              aria-label="Start live voice chat"
              title="Start live voice chat"
            >
              <PhoneCall className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void toggleRecording()}
              disabled={typing || transcribing}
              className={cx(
                'rounded-lg p-1.5 transition-colors disabled:opacity-40',
                recording ? 'bg-red-500/15 text-red-300' : 'text-ink-faint hover:bg-navy-700 hover:text-sky-300',
              )}
              aria-label={recording ? 'Stop recording' : 'Record a voice question'}
              title={recording ? 'Stop recording' : transcribing ? 'Transcribing audio' : 'Record a voice question'}
            >
              {recording ? <MicOff className="h-4 w-4" /> : transcribing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={imageFile ? 'Ask a question about this image…' : 'Ask about machines, maintenance, documents…'}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint outline-none"
              aria-label="Chat message"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim() || typing || transcribing}
              className="btn-primary btn-sm px-2.5"
              aria-label="Send message"
            >
              {typing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-ink-faint">
            <BrainCircuit className="h-3 w-3" />
            {assistantHealth?.status === 'ready'
              ? 'Local document search · project model data · Groq AI'
              : assistantHealth?.message ?? 'Connect the assistant runtime and configure GROQ_API_KEY to begin.'}
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
              {!indexedDocs.length && <option value="">No indexed documents available</option>}
              {indexedDocs.map((d) => (
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
              {indexedDocs.length} indexed
            </span>
          </div>
          <div className="mt-2.5">
            <div id="assistant-document-upload">
              <UploadZone
                accept=".pdf,.txt"
                label={uploadingDocument ? 'Indexing document…' : 'Upload and index'}
                hint={`PDF · UTF-8 TXT · max ${formatUploadLimit(assistantHealth?.max_document_bytes ?? VERCEL_REQUEST_BODY_LIMIT_BYTES)}`}
                onFile={(file) => void handleDocUpload(file)}
                compact
                icon={<Database className="h-[18px] w-[18px]" />}
              />
            </div>
          </div>
          <div className="thin-scroll mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {[...documents]
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
                      {d.indexedDocumentId
                        ? `${d.pages ?? 0} pages · ${d.chunkCount ?? 0} searchable sections`
                        : d.isDemo
                          ? 'Demo metadata · not indexed'
                          : 'Not indexed'}
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
              PDF and TXT contents are chunked and embedded locally in the project&apos;s vector index. Questions, selected document passages, and optional images or audio are sent to the configured cloud AI services.
            </p>
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
              aria-label="Close live voice chat"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="chip border-sky-400/25 bg-sky-500/10 text-sky-300">
              <PhoneCall className="h-3 w-3" />
              LIVE VOICE CHAT
            </span>
            <h2 id="live-voice-title" className="mt-4 text-base font-bold text-ink">Talk to the AI Assistant</h2>
            <p className="mt-1 text-[11px] text-ink-faint">{ctxMeta[ctx].label} · {ctxMeta[ctx].desc}</p>
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
                      : 'border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-blue-700/20 text-sky-200',
                )}
              >
                {liveVoiceStatus === 'requesting' || liveVoiceStatus === 'transcribing' || liveVoiceStatus === 'thinking'
                  ? <LoaderCircle className="h-9 w-9 animate-spin" />
                  : liveVoiceStatus === 'speaking'
                    ? <Volume2 className="h-9 w-9" />
                    : <Mic className="h-9 w-9" />}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-ink" aria-live="polite">
              {liveVoiceStatus === 'requesting' && 'Requesting microphone access…'}
              {liveVoiceStatus === 'listening' && 'Listening — speak naturally'}
              {liveVoiceStatus === 'transcribing' && 'Recognizing your speech…'}
              {liveVoiceStatus === 'thinking' && 'Preparing an answer…'}
              {liveVoiceStatus === 'speaking' && 'Speaking…'}
              {liveVoiceStatus === 'error' && 'Microphone could not be started'}
            </p>
            <p className="mt-2 min-h-12 max-w-sm whitespace-pre-line text-[11px] leading-relaxed text-ink-dim">
              {liveVoiceCaption || 'Your microphone stays active during the call. It pauses while the assistant responds.'}
            </p>
            <button
              type="button"
              onClick={closeLiveVoice}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/20"
            >
              <PhoneOff className="h-4 w-4" />
              End voice chat
            </button>
          </section>
        </div>
      )}
    </>
  )
}