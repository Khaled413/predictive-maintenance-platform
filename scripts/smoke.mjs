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
          html.includes('Illustrative demo readings; not model inputs')
        if (!hasMaintenanceSeparation || !hasSensorSourceDisclosure) {
          console.log('FAIL /machines/M-003 missing maintenance or sensor-source disclosure')
          failures.push('/machines/M-003 disclosures')
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
