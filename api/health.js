const UPSTREAM_PATH = 'health'
const UPSTREAM_TIMEOUT_MS = 10_000

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const serviceUrl = process.env.ML_SERVICE_URL
  if (!serviceUrl) {
    console.error('The ML_SERVICE_URL service binding is unavailable')
    return response.status(503).json({ error: 'ML prediction service unavailable' })
  }

  let baseUrl
  try {
    baseUrl = new URL(serviceUrl.endsWith('/') ? serviceUrl : `${serviceUrl}/`)
  } catch (error) {
    console.error('The ML_SERVICE_URL service binding is invalid:', error)
    return response.status(503).json({ error: 'ML prediction service unavailable' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(new URL(UPSTREAM_PATH, baseUrl), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    const body = await upstream.text()

    response.status(upstream.status)
    response.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    )
    return response.send(body)
  } catch (error) {
    console.error('ML service health check failed:', error)
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return response.status(502).json({
      error: timedOut
        ? 'ML prediction service timed out'
        : 'ML prediction service unavailable',
    })
  } finally {
    clearTimeout(timeout)
  }
}
