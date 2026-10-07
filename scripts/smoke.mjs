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
  const { balancedConditionCategories, simulateMachineInputs } = await vite.ssrLoadModule('/src/utils/simulatedInputs.ts')
  const { SEED_MACHINES, DEFAULT_THRESHOLDS } = await vite.ssrLoadModule('/src/data/mockData.ts')
  const { fleetHealth } = await vite.ssrLoadModule('/src/utils/operationalMetrics.ts')
  const { healthBandLabel, maintenanceStatusFromPrediction, statusForPrediction, recommendationForStatus } = await vite.ssrLoadModule('/src/utils/predictionThresholds.ts')
  const goodScenario = simulateMachineInputs('M-012', 'Compressor', 'GOOD')
  const sameGoodScenario = simulateMachineInputs('M-012', 'Compressor', 'GOOD')
  const mediumScenario = simulateMachineInputs('M-012', 'Compressor', 'MEDIUM')
  const acceptableScenario = simulateMachineInputs('M-012', 'Compressor', 'ACCEPTABLE')
  const badScenario = simulateMachineInputs('M-012', 'Compressor', 'BAD')
  const stateByCondition = {
    GOOD: 'NORMAL',
    MEDIUM: 'DEGRADING',
    ACCEPTABLE: 'DEGRADING',
    BAD: 'CRITICAL',
  }
  const scenarioRanges = {
    GOOD: { air: [297.97, 299.43], delta: [7.95, 8.85], speed: [1698, 1782], torque: [39.9, 44.9], wear: [78, 114] },
    MEDIUM: { air: [301.47, 301.53], delta: [8.15, 8.25], speed: [1598, 1602], torque: [55.9, 56.1], wear: [188, 192] },
    ACCEPTABLE: { air: [300.58, 300.62], delta: [8.78, 8.82], speed: [1379, 1381], torque: [47.55, 47.65], wear: [245, 247] },
    BAD: { air: [303.97, 304.03], delta: [9.15, 9.25], speed: [1269, 1273], torque: [68.5, 68.7], wear: [159, 163] },
  }
  const scenarioEntries = [
    ['GOOD', goodScenario],
    ['MEDIUM', mediumScenario],
    ['ACCEPTABLE', acceptableScenario],
    ['BAD', badScenario],
  ]
  const randomizedFleet = Array.from({ length: 12 }, (_, index) =>
    simulateMachineInputs(
      `M-${String(index + 1).padStart(3, '0')}`,
      'Compressor',
    ),
  )
  const repeatedMachineInputs = Array.from({ length: 12 }, () =>
    simulateMachineInputs('M-012', 'Compressor'),
  )
  const balancedConditions = balancedConditionCategories(12)
  const balancedConditionCounts = balancedConditions.reduce((counts, condition) => {
    counts[condition]++
    return counts
  }, { GOOD: 0, MEDIUM: 0, ACCEPTABLE: 0, BAD: 0 })
  const unevenBalancedConditions = balancedConditionCategories(11)
  const unevenConditionCounts = Object.values(
    unevenBalancedConditions.reduce((counts, condition) => {
      counts[condition]++
      return counts
    }, { GOOD: 0, MEDIUM: 0, ACCEPTABLE: 0, BAD: 0 }),
  ).sort((left, right) => left - right)
  const randomizedFleetHasVariedInputs = new Set(
    randomizedFleet.map((inputs) => [
      inputs.air_temperature,
      inputs.process_temperature,
      inputs.rotational_speed,
      inputs.torque,
      inputs.tool_wear,
    ].join(':')),
  ).size >= 10
  const repeatedInputsAreUnique = new Set(
    repeatedMachineInputs.map((inputs) => [
      inputs.air_temperature,
      inputs.process_temperature,
      inputs.rotational_speed,
      inputs.torque,
      inputs.tool_wear,
    ].join(':')),
  ).size === repeatedMachineInputs.length
  const demoFleetHealth = fleetHealth(SEED_MACHINES.map((machine, index) => ({
    ...machine,
    predictionStatus: 'available',
    healthScore: 60 + index,
    failureRisk: 20 + index,
    prediction: {
      machine_input_source: 'simulated',
      sensor_input_source: 'simulated',
    },
  })))
  const healthBandLabels = [96, 85, 70, 40].map((score) => healthBandLabel(score, DEFAULT_THRESHOLDS))
  const statusRecommendationPairs = [96, 70, 41, 40].map((score) => {
    const status = statusForPrediction(
      { health_score: score, failure_probability: (100 - score) / 100 },
      DEFAULT_THRESHOLDS,
    )
    return [status, recommendationForStatus(status)]
  })
  const maintenanceDecisions = [
    maintenanceStatusFromPrediction('Operational', '2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
    maintenanceStatusFromPrediction('Warning', '2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
    maintenanceStatusFromPrediction('Critical', '2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
    maintenanceStatusFromPrediction('Operational', '2028-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z')),
  ]
  const scenariosMatchRanges = scenarioEntries
    .every(([condition, inputs]) => {
      const range = scenarioRanges[condition]
      const delta = inputs.process_temperature - inputs.air_temperature
      return inputs.simulation_state === stateByCondition[condition] &&
        inputs.air_temperature >= range.air[0] &&
        inputs.air_temperature <= range.air[1] &&
        delta >= range.delta[0] - 0.02 &&
        delta <= range.delta[1] + 0.02 &&
        inputs.rotational_speed >= range.speed[0] &&
        inputs.rotational_speed <= range.speed[1] &&
        inputs.torque >= range.torque[0] &&
        inputs.torque <= range.torque[1] &&
        inputs.tool_wear >= range.wear[0] &&
        inputs.tool_wear <= range.wear[1]
    })
  const inputsStayWithinTrainingRanges = [
    ...randomizedFleet,
    ...repeatedMachineInputs,
    goodScenario,
    mediumScenario,
    acceptableScenario,
    badScenario,
  ].every((inputs) =>
    inputs.air_temperature >= 295.3 &&
    inputs.air_temperature <= 304.5 &&
    inputs.process_temperature >= 305.7 &&
    inputs.process_temperature <= 313.8 &&
    inputs.rotational_speed >= 1168 &&
    inputs.rotational_speed <= 2886 &&
    inputs.torque >= 3.8 &&
    inputs.torque <= 76.6 &&
    inputs.tool_wear >= 0 &&
    inputs.tool_wear <= 253
  )
  if (
    JSON.stringify(goodScenario) === JSON.stringify(sameGoodScenario) ||
    !randomizedFleetHasVariedInputs ||
    !repeatedInputsAreUnique ||
    SEED_MACHINES.length !== 12 ||
    demoFleetHealth.availableCount !== 12 ||
    demoFleetHealth.isDemo !== true ||
    demoFleetHealth.averageHealth !== 66 ||
    JSON.stringify(balancedConditionCounts) !== JSON.stringify({ GOOD: 3, MEDIUM: 3, ACCEPTABLE: 3, BAD: 3 }) ||
    JSON.stringify(unevenConditionCounts) !== JSON.stringify([2, 3, 3, 3]) ||
    JSON.stringify(healthBandLabels) !== JSON.stringify([
      'Good condition',
      'Medium condition',
      'Acceptable condition',
      'Poor condition',
    ]) ||
    JSON.stringify(statusRecommendationPairs) !== JSON.stringify([
      ['Operational', 'Continue normal operation and routine maintenance.'],
      ['Warning', 'Inspect the machine soon and schedule preventive maintenance.'],
      ['Warning', 'Inspect the machine soon and schedule preventive maintenance.'],
      ['Critical', 'Stop or reduce operation and inspect the machine immediately.'],
    ]) ||
    JSON.stringify(maintenanceDecisions) !== JSON.stringify([
      'On Schedule',
      'Due Soon',
      'Immediate',
      'Overdue',
    ]) ||
    !scenariosMatchRanges ||
    !inputsStayWithinTrainingRanges ||
    scenarioEntries.some(([, profile]) =>
      profile.machine_input_source !== 'simulated' ||
      profile.sensor_input_source !== 'simulated'
    )
  ) {
    console.log('FAIL fresh randomized demo model-inputs and 12-machine fleet')
    console.log(JSON.stringify({
      repeatedCallChanged: JSON.stringify(goodScenario) !== JSON.stringify(sameGoodScenario),
      randomizedFleetHasVariedInputs,
      repeatedMachineUnique: repeatedInputsAreUnique,
      machineCount: SEED_MACHINES.length,
      demoFleetHealth,
      balancedConditionCounts,
      unevenConditionCounts,
      healthBandLabels,
      statusRecommendationPairs,
      maintenanceDecisions,
      scenarios: Object.fromEntries(scenarioEntries),
    }, null, 2))
    failures.push('fresh randomized demo model-inputs and 12-machine fleet')
  } else {
    console.log('PASS fresh randomized model inputs · 4 condition categories · 12-machine fleet · status/recommendation consistency')
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

  const inputBarProfiles = [goodScenario, mediumScenario, acceptableScenario, badScenario].map((inputs) =>
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
