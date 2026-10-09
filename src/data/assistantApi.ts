export interface AssistantHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantRequest {
  question: string
  context: 'factory' | 'machine' | 'knowledge' | 'document'
  machineId?: string
  documentId?: string
  history: AssistantHistoryItem[]
  operationalContext: string
}

export interface AssistantSource {
  filename: string
  page: number | null
  machine: string | null
  section: string | null
  subsection: string | null
  topic: string | null
  error_code: string | null
  content_type: string | null
  score: number
}

export interface AssistantReply {
  answer: string
  sources: AssistantSource[]
  intent: string
  image_analysis?: string | null
}

export interface AssistantHealth {
  status: 'ready' | 'unavailable'
  provider_configured: boolean
  embedding_model_loaded: boolean
  indexed_documents: number | null
  max_document_bytes: number
  max_image_bytes: number
  max_audio_bytes: number
  ocr_available: boolean
  speech_output_available: boolean
  message: string | null
}

export interface IndexedAssistantDocument {
  document_id: string
  filename: string
  pages: number
  chunks: number
  uploaded_at: number
}

export interface IndexedAssistantDocumentResult {
  document_id: string
  filename: string
  pages: number
  chunks: number
  warnings: string[]
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    let detail = ''
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object' && 'detail' in body) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      }
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`Assistant request failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  return (await response.json()) as T
}

function isAssistantReply(value: unknown): value is AssistantReply {
  if (!value || typeof value !== 'object') return false
  const reply = value as Partial<AssistantReply>
  return typeof reply.answer === 'string' &&
    Array.isArray(reply.sources) &&
    reply.sources.every((source) =>
      !!source &&
      typeof source.filename === 'string' &&
      typeof source.score === 'number' &&
      (source.page === null || typeof source.page === 'number'),
    ) &&
    typeof reply.intent === 'string'
}

export async function getAssistantHealth(): Promise<AssistantHealth> {
  const result = await requestJson<AssistantHealth>('/api/assistant/health', {
    cache: 'no-store',
  })
  if (
    (result.status !== 'ready' && result.status !== 'unavailable') ||
    typeof result.provider_configured !== 'boolean' ||
    typeof result.embedding_model_loaded !== 'boolean' ||
    !Number.isInteger(result.max_document_bytes) ||
    result.max_document_bytes <= 0 ||
    !Number.isInteger(result.max_image_bytes) ||
    result.max_image_bytes <= 0 ||
    !Number.isInteger(result.max_audio_bytes) ||
    result.max_audio_bytes <= 0 ||
    typeof result.ocr_available !== 'boolean' ||
    typeof result.speech_output_available !== 'boolean' ||
    !(result.indexed_documents === null || typeof result.indexed_documents === 'number') ||
    !(result.message === null || typeof result.message === 'string')
  ) {
    throw new Error('Assistant returned an invalid health response')
  }
  return result
}

export async function listIndexedAssistantDocuments(): Promise<IndexedAssistantDocument[]> {
  const result = await requestJson<{ documents: IndexedAssistantDocument[] }>('/api/assistant/documents')
  if (
    !result ||
    !Array.isArray(result.documents) ||
    !result.documents.every((document) =>
      typeof document.document_id === 'string' &&
      typeof document.filename === 'string' &&
      typeof document.pages === 'number' &&
      typeof document.chunks === 'number' &&
      typeof document.uploaded_at === 'number',
    )
  ) {
    throw new Error('Assistant returned an invalid document list')
  }
  return result.documents
}

export async function askAssistant(
  request: AssistantRequest,
  image?: File | null,
): Promise<AssistantReply> {
  let response: unknown
  if (image) {
    const form = new FormData()
    form.append('image', image)
    form.append('question', request.question)
    form.append('context', request.context)
    form.append('machine_id', request.machineId ?? '')
    form.append('document_id', request.documentId ?? '')
    form.append('history', JSON.stringify(request.history))
    form.append('operational_context', request.operationalContext)
    response = await requestJson<unknown>('/api/assistant/chat/image', {
      method: 'POST',
      body: form,
    })
  } else {
    response = await requestJson<unknown>('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: request.question,
        context: request.context,
        machine_id: request.machineId,
        document_id: request.documentId,
        history: request.history,
        operational_context: request.operationalContext,
      }),
    })
  }
  if (!isAssistantReply(response)) {
    throw new Error('Assistant returned an invalid response')
  }
  return response
}

export async function uploadAssistantDocument(file: File): Promise<IndexedAssistantDocumentResult> {
  const form = new FormData()
  form.append('file', file)
  const result = await requestJson<IndexedAssistantDocumentResult>('/api/assistant/documents', {
    method: 'POST',
    body: form,
  })
  if (
    typeof result.document_id !== 'string' ||
    typeof result.filename !== 'string' ||
    typeof result.pages !== 'number' ||
    typeof result.chunks !== 'number' ||
    !Array.isArray(result.warnings)
  ) {
    throw new Error('Assistant returned an invalid document indexing result')
  }
  return result
}

export async function deleteIndexedAssistantDocument(documentId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(
    `/api/assistant/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
  )
}

export async function transcribeAssistantAudio(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append('file', blob, 'recording.webm')
  const result = await requestJson<{ text: string }>('/api/assistant/transcribe', {
    method: 'POST',
    body: form,
  })
  if (typeof result.text !== 'string' || !result.text.trim()) {
    throw new Error('Assistant could not recognize speech in this recording')
  }
  return result.text.trim()
}

export async function synthesizeAssistantSpeech(text: string): Promise<Blob> {
  const response = await fetch('/api/assistant/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null
    const detail = typeof body?.detail === 'string' ? body.detail : ''
    throw new Error(`Speech request failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  return response.blob()
}

export async function splitAssistantSpeech(text: string): Promise<string[]> {
  const result = await requestJson<{ chunks: string[] }>('/api/assistant/speak/chunks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!Array.isArray(result.chunks) || result.chunks.some((chunk) => typeof chunk !== 'string' || !chunk.trim())) {
    throw new Error('Assistant returned invalid speech chunks')
  }
  return result.chunks
}
