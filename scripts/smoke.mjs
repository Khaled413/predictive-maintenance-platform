/**
 * Runtime smoke test (development only — not part of the shipped app).
 *
 * Renders every route through react-dom/server inside a memory router to catch
 * runtime errors (bad hooks, undefined access, invalid props) that TypeScript
 * cannot detect. No browser or backend required.
 *
 * Usage:  node scripts/smoke.mjs
 */
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'

/** [route under test, route pattern, page module] */
const ROUTES = [
  ['/', '/', '/src/pages/OverviewPage.tsx'],
  ['/machines', '/machines', '/src/pages/MachinesPage.tsx'],
  ['/machines/M-003', '/machines/:id', '/src/pages/MachineDetailsPage.tsx'],
  ['/maintenance', '/maintenance', '/src/pages/MaintenancePage.tsx'],
  ['/quality', '/quality', '/src/pages/QualityPage.tsx'],
  ['/assistant', '/assistant', '/src/pages/AssistantPage.tsx'],
  ['/alerts', '/alerts', '/src/pages/AlertsPage.tsx'],
  ['/reports', '/reports', '/src/pages/ReportsPage.tsx'],
  ['/settings', '/settings', '/src/pages/SettingsPage.tsx'],
]

// ---------------------------------------------------------------------------
// Minimal browser globals so libraries that probe the DOM during render do not
// crash the server render.
// ---------------------------------------------------------------------------
const noop = () => {}
globalThis.window = globalThis.window ?? {
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  location: { pathname: '/', reload: noop, href: 'http://localhost/' },
}
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop }
globalThis.window.localStorage = globalThis.localStorage
globalThis.ResizeObserver =
  globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} }

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const failures = []

try {
  const { MemoryRouter, Route, Routes } = await vite.ssrLoadModule('react-router-dom')
  const { AppProvider } = await vite.ssrLoadModule('/src/context/AppContext.tsx')
  const { PreferencesProvider } = await vite.ssrLoadModule('/src/context/PreferencesContext.tsx')
  const { default: AppLayout } = await vite.ssrLoadModule('/src/components/layout/AppLayout.tsx')
  const { default: RiskBar } = await vite.ssrLoadModule('/src/components/ui/RiskBar.tsx')
  const { default: ModelInputBars } = await vite.ssrLoadModule('/src/components/ui/ModelInputBars.tsx')
  const { DEMO_HEALTH_BAND_COUNT, healthBandForSlot, simulateMachineInputs } = await vite.ssrLoadModule('/src/utils/simulatedInputs.ts')
  const { healthBandLabel, maintenanceStatusFromPrediction } = await vite.ssrLoadModule('/src/utils/predictionThresholds.ts')
  const normalScenario = simulateMachineInputs('M-012', 'Compressor', undefined, 'VERY_GOOD')
  const sameNormalScenario = simulateMachineInputs('M-012', 'Compressor', undefined, 'VERY_GOOD')
  const degradingScenario = simulateMachineInputs('M-012', 'Compressor', undefined, 'MEDIUM')
  const criticalScenario = simulateMachineInputs('M-012', 'Compressor', undefined, 'POOR')
  const sameProfileFleet = Array.from({ length: 12 }, (_, index) =>
    simulateMachineInputs(
      `M-${String(index + 1).padStart(3, '0')}`,
      'Compressor',
      undefined,
      'VERY_GOOD',
    ),
  )
  const sameProfileInputsAreUnique = new Set(
    sameProfileFleet.map((inputs) => [
      inputs.air_temperature,
      inputs.process_temperature,
      inputs.rotational_speed,
      inputs.torque,
      inputs.tool_wear,
    ].join(':')),
  ).size === sameProfileFleet.length
  const fleetScenarioStates = Array.from(
    { length: DEMO_HEALTH_BAND_COUNT * 3 },
    (_, slot) => healthBandForSlot(slot),
  )
  const stateCounts = fleetScenarioStates.reduce((counts, state) => {
    counts[state]++
    return counts
  }, { VERY_GOOD: 0, GOOD: 0, MEDIUM: 0, BELOW_AVERAGE: 0, POOR: 0 })
  const healthBandLabels = [96, 85, 73, 60, 45].map(healthBandLabel)
  const maintenanceDecisions = [
    maintenanceStatusFromPrediction('Operational', '2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
    maintenanceStatusFromPrediction('Warning', '2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
    maintenanceStatusFromPrediction('Critical', '2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
    maintenanceStatusFromPrediction('Operational', '2028-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
  ]
  const hasDistinctProfiles = [normalScenario, degradingScenario, criticalScenario]
    .every((profile, index, profiles) =>
      index === 0 || JSON.stringify(profile) !== JSON.stringify(profiles[index - 1]),
    )
  if (
    JSON.stringify(normalScenario) !== JSON.stringify(sameNormalScenario) ||
    !hasDistinctProfiles ||
    !sameProfileInputsAreUnique ||
    Object.values(stateCounts).some((count) => count !== 3) ||
    JSON.stringify(healthBandLabels) !== JSON.stringify([
      'Very good health',
      'Good health',
      'Medium health',
      'Below average health',
      'Poor health',
    ]) ||
    JSON.stringify(maintenanceDecisions) !== JSON.stringify([
      'On Schedule',
      'Due Soon',
      'Immediate',
      'Overdue',
    ]) ||
    normalScenario.simulation_state !== 'NORMAL' ||
    degradingScenario.simulation_state !== 'DEGRADING' ||
    criticalScenario.simulation_state !== 'CRITICAL' ||
    [normalScenario, degradingScenario, criticalScenario].some((profile) =>
      profile.machine_input_source !== 'simulated' ||
      profile.sensor_input_source !== 'simulated' ||
      profile.air_temperature < 297 ||
      profile.air_temperature > 305 ||
      profile.process_temperature <= profile.air_temperature ||
      profile.rotational_speed < 1100 ||
      profile.rotational_speed > 1800 ||
      profile.torque < 25 ||
      profile.torque > 75 ||
      profile.tool_wear < 0 ||
      profile.tool_wear > 250
    )
  ) {
    console.log('FAIL deterministic demo model-input profiles')
    failures.push('deterministic demo model-input profiles')
  } else {
    console.log('PASS deterministic demo profiles · five model-health bands and output-based maintenance urgency')
  }

  const riskBarHtml = renderToString(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(RiskBar, {
        value: 64,
        warningThreshold: 50,
        criticalThreshold: 70,
      }),
    ),
  )
  if (
    !riskBarHtml.includes('role="progressbar"') ||
    !riskBarHtml.includes('aria-valuenow="64"') ||
    !riskBarHtml.includes('Warning limit 50%') ||
    !riskBarHtml.includes('Critical limit 70%')
  ) {
    console.log('FAIL risk bar threshold display')
    failures.push('risk bar threshold display')
  } else {
    console.log('PASS risk bar displays configured warning and critical limits')
  }

  const inputBarProfiles = [normalScenario, degradingScenario, criticalScenario].map((inputs) =>
    renderToString(
      React.createElement(
        PreferencesProvider,
        null,
        React.createElement(ModelInputBars, { inputs }),
      ),
    ),
  )
  const hasFiveBarsPerScenario = inputBarProfiles.every(
    (html) => (html.match(/role="meter"/g) ?? []).length === 5,
  )
  const hasCompactReadingRows = inputBarProfiles.every(
    (html) => html.includes('grid-cols-[minmax') && html.includes('rounded-full'),
  )
  const removedDisplayDisclaimer = inputBarProfiles.every(
    (html) => !html.includes('certified operating limits'),
  )
  if (!hasFiveBarsPerScenario || !hasCompactReadingRows || !removedDisplayDisclaimer) {
    console.log('FAIL per-reading demo input bars')
    failures.push('per-reading demo input bars')
  } else {
    console.log('PASS five compact model-input bars per scenario · input values and status colors')
  }

  for (const [route, pattern, modulePath] of ROUTES) {
    try {
      const Page = (await vite.ssrLoadModule(modulePath)).default
      const tree = React.createElement(
        MemoryRouter,
        { initialEntries: [route] },
        React.createElement(
          AppProvider,
          null,
          React.createElement(
            PreferencesProvider,
            null,
            React.createElement(
              Routes,
              null,
              React.createElement(
                Route,
                { element: React.createElement(AppLayout) },
                React.createElement(Route, { path: pattern, element: React.createElement(Page) }),
              ),
            ),
          ),
        ),
      )
      const html = renderToString(tree)
      const ok = html.length > 500
      console.log(`${ok ? 'PASS ' : 'EMPTY'} ${route.padEnd(16)} ${String(html.length).padStart(7)} bytes`)
      if (!ok) failures.push(route)
      if (route === '/machines/M-003') {
        const hasMaintenanceSeparation =
          html.includes('Maintenance is overdue.') &&
          html.includes('separate from the model status and recommendation')
        const hasSensorSourceDisclosure =
          html.includes('Show illustrative sensor examples (not model inputs)')
        if (!hasMaintenanceSeparation || !hasSensorSourceDisclosure) {
          console.log('FAIL /machines/M-003 missing maintenance or sensor-source disclosure')
          failures.push('/machines/M-003 disclosures')
        }
      }
      if (route === '/reports') {
        const hasSensorModelMetrics =
          html.includes('Avg. Sensor Anomaly Score') &&
          html.includes('Model Output Trends')
        if (!hasSensorModelMetrics) {
          console.log('FAIL /reports missing sensor-model prediction metrics')
          failures.push('/reports sensor-model metrics')
        }
      }
      if (route === '/') {
        const showsModelInputs = html.includes('Inputs used by failure model')
        const exposesUnrelatedSensorExamples = html.includes('Illustrative Sensor Examples')
        const hasScenarioAction = html.includes('Generate new demo readings')
        if (!showsModelInputs || exposesUnrelatedSensorExamples || !hasScenarioAction) {
          console.log('FAIL / is missing model-input disclosure or demo scenario action')
          failures.push('/ model-input disclosure or demo scenario action')
        }
      }
    } catch (err) {
      console.log(`ERROR ${route.padEnd(16)} ${err && err.message}`)
      failures.push(route)
    }
  }
} catch (err) {
  console.error('Smoke test could not start:', err)
  failures.push('bootstrap')
} finally {
  await vite.close()
}

if (failures.length) {
  console.error(`\n${failures.length} route(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nAll routes rendered successfully.')
