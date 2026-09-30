import assert from 'node:assert/strict'
import { test } from 'node:test'
import handler from '../api/predict.js'
import healthHandler from '../api/health.js'

function createResponse() {
  const result = { headers: {}, statusCode: null, body: null }
  return {
    result,
    setHeader(name, value) {
      result.headers[name] = value
      return this
    },
    status(statusCode) {
      result.statusCode = statusCode
      return this
    },
    json(body) {
      result.body = body
      return this
    },
    send(body) {
      result.body = body
      return this
    },
  }
}

test('rejects methods other than POST', async () => {
  const response = createResponse()
  await handler({ method: 'GET' }, response)

  assert.equal(response.result.statusCode, 405)
  assert.equal(response.result.headers.Allow, 'POST')
})

test('reports an unavailable internal service binding', async (t) => {
  const originalBinding = process.env.ML_SERVICE_URL
  const originalError = console.error
  t.after(() => {
    if (originalBinding === undefined) delete process.env.ML_SERVICE_URL
    else process.env.ML_SERVICE_URL = originalBinding
    console.error = originalError
  })

  delete process.env.ML_SERVICE_URL
  console.error = () => {}

  const response = createResponse()
  await handler({ method: 'POST', body: {} }, response)

  assert.equal(response.result.statusCode, 503)
  assert.equal(response.result.body.error, 'ML prediction service unavailable')
})

test('forwards prediction requests to the bound ML service', async (t) => {
  const originalBinding = process.env.ML_SERVICE_URL
  const originalFetch = globalThis.fetch
  let upstreamRequest

  t.after(() => {
    if (originalBinding === undefined) delete process.env.ML_SERVICE_URL
    else process.env.ML_SERVICE_URL = originalBinding
    globalThis.fetch = originalFetch
  })

  process.env.ML_SERVICE_URL = 'https://ml.internal.example/service'
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options }
    return new Response('{"health_score":82}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const response = createResponse()
  const payload = { machine_id: 'M-001', type: 'L' }
  await handler({ method: 'POST', body: payload }, response)

  assert.equal(upstreamRequest.url, 'https://ml.internal.example/service/api/predict')
  assert.equal(upstreamRequest.options.method, 'POST')
  assert.equal(upstreamRequest.options.body, JSON.stringify(payload))
  assert.equal(response.result.statusCode, 200)
  assert.equal(response.result.body, '{"health_score":82}')
  assert.equal(response.result.headers['Cache-Control'], 'no-store')
})

test('rejects health methods other than GET', async () => {
  const response = createResponse()
  await healthHandler({ method: 'POST' }, response)

  assert.equal(response.result.statusCode, 405)
  assert.equal(response.result.headers.Allow, 'GET')
})

test('forwards health checks to the bound ML service', async (t) => {
  const originalBinding = process.env.ML_SERVICE_URL
  const originalFetch = globalThis.fetch
  let upstreamRequest

  t.after(() => {
    if (originalBinding === undefined) delete process.env.ML_SERVICE_URL
    else process.env.ML_SERVICE_URL = originalBinding
    globalThis.fetch = originalFetch
  })

  process.env.ML_SERVICE_URL = 'https://ml.internal.example/service'
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options }
    return new Response('{"status":"ok","models_loaded":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const response = createResponse()
  await healthHandler({ method: 'GET' }, response)

  assert.equal(upstreamRequest.url, 'https://ml.internal.example/service/health')
  assert.equal(upstreamRequest.options.method, 'GET')
  assert.equal(response.result.statusCode, 200)
  assert.equal(response.result.body, '{"status":"ok","models_loaded":true}')
  assert.equal(response.result.headers['Cache-Control'], 'no-store')
})
