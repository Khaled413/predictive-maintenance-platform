export interface QualityModelStatus {
  status: 'ready' | 'unavailable'
  model_available: boolean
  max_image_bytes: number
  checkpoint: string
  message: string | null
}

export interface QualityInspectionResponse {
  label: 'NORMAL' | 'ANOMALOUS'
  score: number
  heatmap: string
  prediction_source: 'PatchCore'
  model_status: 'ready'
  timestamp: string
}

function isQualityModelStatus(value: unknown): value is QualityModelStatus {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<QualityModelStatus>
  return (
    (result.status === 'ready' || result.status === 'unavailable') &&
    typeof result.model_available === 'boolean' &&
    typeof result.max_image_bytes === 'number' &&
    Number.isInteger(result.max_image_bytes) &&
    result.max_image_bytes > 0 &&
    typeof result.checkpoint === 'string' &&
    (result.message === null || typeof result.message === 'string')
  )
}

function isQualityInspectionResponse(value: unknown): value is QualityInspectionResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<QualityInspectionResponse>
  return (
    (result.label === 'NORMAL' || result.label === 'ANOMALOUS') &&
    typeof result.score === 'number' &&
    Number.isFinite(result.score) &&
    result.score >= 0 &&
    typeof result.heatmap === 'string' &&
    result.heatmap.startsWith('data:image/png;base64,') &&
    result.prediction_source === 'PatchCore' &&
    result.model_status === 'ready' &&
    typeof result.timestamp === 'string' &&
    !Number.isNaN(Date.parse(result.timestamp))
  )
}

async function readError(response: Response) {
  const body = await response.text()
  try {
    const payload: unknown = JSON.parse(body)
    if (
      payload &&
      typeof payload === 'object' &&
      'detail' in payload &&
      typeof payload.detail === 'string'
    ) {
      return payload.detail
    }
  } catch {
    // Keep the response text as the explicit service error.
  }
  return body || `Request failed (${response.status})`
}

export async function getQualityModelStatus(): Promise<QualityModelStatus> {
  const response = await fetch('/api/quality/health')
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'The running ML backend does not expose the PatchCore endpoint yet. Restart the backend with "npm run dev" to load the updated API.'
      )
    }
    throw new Error(await readError(response))
  }
  const result: unknown = await response.json()
  if (!isQualityModelStatus(result)) {
    throw new Error('Quality service returned an invalid readiness response.')
  }
  return result
}

export async function inspectQualityImage(
  file: File
): Promise<QualityInspectionResponse> {
  const form = new FormData()
  form.append('image', file)
  const response = await fetch('/api/inspect', { method: 'POST', body: form })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const result: unknown = await response.json()
  if (!isQualityInspectionResponse(result)) {
    throw new Error('Quality service returned an invalid PatchCore result.')
  }
  return result
}
