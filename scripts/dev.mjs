import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendDirectory = path.join(root, 'ml')
const viteExecutable = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const configuredOrigin = process.env.ML_API_DEV_ORIGIN || 'http://127.0.0.1:8001'
const backendOrigin = new URL(configuredOrigin)
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
const pythonExecutable = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
const startupTimeoutMs = Number(process.env.ML_API_STARTUP_TIMEOUT_MS || 120_000)

if (!['http:', 'https:'].includes(backendOrigin.protocol)) {
  throw new Error(`ML_API_DEV_ORIGIN must use HTTP or HTTPS: ${configuredOrigin}`)
}
if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs <= 0) {
  throw new Error('ML_API_STARTUP_TIMEOUT_MS must be a positive number.')
}

const backendIsLocal = localHosts.has(backendOrigin.hostname)
const backendPort = Number(
  backendOrigin.port || (backendOrigin.protocol === 'https:' ? '443' : '80'),
)
let backend
let vite
let stopping = false

function stopChildren(signal = 'SIGTERM') {
  stopping = true
  for (const child of [vite, backend]) {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill(signal)
    }
  }
}

process.on('SIGINT', () => stopChildren('SIGINT'))
process.on('SIGTERM', () => stopChildren('SIGTERM'))

async function readBackendHealth() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_000)
  try {
    const response = await fetch(new URL('health', configuredOrigin.endsWith('/') ? configuredOrigin : `${configuredOrigin}/`), {
      signal: controller.signal,
    })
    if (!response.ok) return false
    const result = await response.json()
    return result.status === 'ok' && result.models_loaded === true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForBackend() {
  const startedAt = Date.now()
  let nextNoticeAt = startedAt

  while (!stopping && Date.now() - startedAt < startupTimeoutMs) {
    if (backend?.spawnError) {
      throw new Error(`Could not start Python (${pythonExecutable}): ${backend.spawnError.message}`)
    }
    if (backend && (backend.exitCode !== null || backend.signalCode !== null)) {
      throw new Error(
        `The ML service exited before becoming ready. Install its dependencies with "npm run setup:ml" and check that model files exist in ml/models.`,
      )
    }
    if (await readBackendHealth()) return

    if (Date.now() >= nextNoticeAt) {
      console.log('Waiting for the ML service and trained models to become ready...')
      nextNoticeAt = Date.now() + 10_000
    }
    await delay(1_000)
  }

  if (stopping) throw new Error('Development startup was interrupted.')
  throw new Error(
    `The ML service did not become ready within ${Math.round(startupTimeoutMs / 1000)} seconds. Check ml/models and run "npm run setup:ml".`,
  )
}

try {
  if (backendIsLocal) {
    if (await readBackendHealth()) {
      console.log(`Using the already-running ML service at ${configuredOrigin}`)
    } else {
      console.log(`Starting the ML service on ${backendOrigin.hostname}:${backendPort}...`)
      backend = spawn(
        pythonExecutable,
        [
          '-m',
          'uvicorn',
          'main:app',
          '--host',
          '127.0.0.1',
          '--port',
          String(backendPort),
        ],
        {
          cwd: backendDirectory,
          env: process.env,
          stdio: 'inherit',
        },
      )
      backend.on('error', (error) => {
        backend.spawnError = error
      })
      await waitForBackend()
    }
  } else {
    console.log(`Using the configured external ML service at ${configuredOrigin}`)
    await waitForBackend()
  }

  if (stopping) process.exitCode = 130
  else {
    console.log('Starting Vite...')
    vite = spawn(process.execPath, [viteExecutable, ...process.argv.slice(2)], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    })
    vite.on('error', (error) => {
      console.error(`Could not start Vite: ${error.message}`)
      process.exitCode = 1
      stopChildren()
    })
    vite.on('exit', (code, signal) => {
      if (!stopping) stopChildren()
      process.exitCode = code ?? (signal ? 1 : 0)
    })
    backend?.on('exit', (code, signal) => {
      if (!stopping && vite?.exitCode === null) {
        console.error(`The ML service exited unexpectedly (${signal ?? code}).`)
        stopChildren()
        process.exitCode = 1
      }
    })
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  stopChildren()
  process.exitCode = 1
}
