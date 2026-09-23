# Industrial AI Platform — Machine Health & Maintenance Dashboard

**Predict • Prevent • Optimize**

A production-quality front-end prototype of an industrial AI monitoring and
predictive-maintenance platform, built for factories, engineering teams and
enterprise demonstrations. Dark industrial aesthetic, compact enterprise
dashboard density, and a fully interactive (backend-free) experience.

> **Prototype notice.** There is **no machine-learning backend** in this project.
> Health scores, failure risk, maintenance recommendations, RAG-style assistant
> answers and computer-vision inspection results are produced by deterministic
> *mock* logic in `src/data/mockData.ts` and `src/utils/helpers.ts`. The data
> layer and component boundaries are structured so a real API / model service
> can be connected later.

---

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 (custom industrial dark theme) |
| Icons | lucide-react |
| Charts | Recharts |
| Routing | react-router-dom v6 |

---

## Getting Started

```bash
npm install
npm run dev       # dev server (Vite)
npm run build     # production build -> dist/
npm run preview   # preview the production build
npm run typecheck # tsc --noEmit
```

Node.js 18+ recommended.

---

## Pages

The persistent left sidebar (collapses to an overlay drawer on mobile) contains:

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | Overview | KPI cards, machine filters, machine card grid |
| `/machines` | Machines | Fleet list, search, filters, Add Machine flow |
| `/machines/:id` | Machine Profile | Telemetry charts, AI analysis, histories |
| `/maintenance` | Maintenance | Upcoming / Scheduled / In Progress / Completed / History |
| `/quality` | AI Quality Inspection | Image upload, simulated defect detection, history & analytics |
| `/assistant` | AI Assistant | Copilot chat, context selector, Knowledge Base (RAG) |
| `/alerts` | Alerts Center | Severity filters, recommended actions, deep links |
| `/reports` | Reports & Analytics | Date filters, analytics charts, exports |

---

## Core Product Flows

1. **Predictive maintenance**
   `Machine Data → Data Processing → Health Score → Failure Risk →
   Explainable AI ("Why?") → Maintenance Recommendation → Tracking → History`
2. **Document intelligence / RAG**
   `Document Upload → Knowledge Base → RAG Assistant → Context-aware Answer →
   Source Citation` (simulated from document metadata; API-ready)
3. **Computer-vision quality inspection**
   `Product Image → Inspection → Defect Detection → PASS/FAIL → Quality Analytics`

---

## Project Layout

```
src/
├─ components/
│  ├─ layout/        Sidebar, TopHeader, AppLayout, route metadata
│  ├─ machine/       MachineCard, AddMachineModal (incl. historical-data ingest)
│  └─ ui/            KpiCard, CircularHealth, RiskBar, SensorList, StatusBadge,
│                    ChartCard (+ ChartTooltip), WhyCard, UploadZone, Modal,
│                    ConfirmDialog, Toasts, MachineVisual, Field, Panel, ...
├─ context/AppContext.tsx   Global state + localStorage persistence + toasts
├─ data/mockData.ts         Synthetic machines, maintenance, alerts, inspections,
│                           documents, health trends and event markers
├─ pages/                   One module per route
├─ types/index.ts           Machine, MaintenanceRecord, Alert, Inspection,
│                           KnowledgeDoc, Thresholds, enums
└─ utils/helpers.ts         Status derivation, threshold logic, formatters
```

### Data model (abridged)

```ts
Machine           { id, name, type, status, healthScore, failureRisk,
                    maintenanceStatus, temperature, vibration, pressure, power,
                    speed, likelyReason, recommendation, lastMaintenance,
                    nextMaintenance, location, sensors, history, events }
MaintenanceRecord { id, machineId, type, priority, status, date, technician,
                    cost, downtime, notes }
Alert             { id, machineId, severity, type, message, timestamp, status,
                    recommendedAction }
Inspection        { id, productId, image, result, defectType, confidence,
                    timestamp, summary }
KnowledgeDoc      { id, name, type, size, uploadDate, status, source }
Thresholds        { healthWarning, healthCritical, riskWarning, riskCritical }
```

---

## What Is Actually Functional

Everything is client-side and interactive — nothing is a static mockup:

- Click a machine card → full machine profile with charts and event markers
- **Add Machine** → appears immediately in the list; optional CSV / XLSX / JSON
  historical upload with a validation report, a staged processing simulation
  (Validation → Feature Processing → Health → Risk → Recommendation) and a
  generated health trend
- Schedule / edit / complete maintenance → machine maintenance status updates
- Upload documents → appear in the Knowledge Base; the assistant cites them as sources
- Upload a product image → simulated inspection with bounding-box annotation
- Filters, search, threshold changes, alerts and toasts all update live state
- Settings thresholds recalculate statuses fleet-wide (with an impact preview)
- Loading, empty, success and error states plus confirmation dialogs for destructive actions

State is persisted to `localStorage` under `iap-state-v3`. Settings → Data
Management can reset the seed dataset or clear the cached state.

---

## Extending to a Real Backend

The seams for a real implementation are already in place:

- `src/data/mockData.ts` — replace the seed generators with API responses
- `src/context/AppContext.tsx` — replace localStorage persistence with fetch/SWR
- Assistant RAG — replace the mock retrieval in `pages/AssistantPage.tsx` with a
  vector-store query (embeddings + document chunks) returning `sources[]`
- Inspection — replace the mock classifier with a vision endpoint returning
  `{ result, defectType, confidence, boxes[] }`
- Model service — expose `predictHealth(machine)` / `predictRisk(machine)` and
  remove the deterministic generators in `utils/helpers.ts`

---

## License

MIT — see [LICENSE](./LICENSE).
