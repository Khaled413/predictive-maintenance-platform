# Predictive Maintenance Platform

<div align="center">

[![CI](https://github.com/Khaled413/predictive-maintenance-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Khaled413/predictive-maintenance-platform/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20DB-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Enterprise-grade industrial machine health dashboard combining real-time predictive ML inference, multilingual RAG assistant, role-based access control, and automated fault alert workflows.**

</div>

## Industrial AI Platform — Machine Health & Maintenance Dashboard

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/ce1375ef-3cef-417f-b5dd-d0e13b002723" />

An industrial machine-health dashboard that combines a React application with
a Python inference service for predictive maintenance.

> **About the image:** This is concept artwork for the project, not a screenshot
> of the current application or a guarantee that every depicted integration is
> implemented.

## At a glance

- Monitor a demo fleet with machine profiles, sensor trends, alerts, and
  maintenance schedules.
- Request failure-risk and sensor-anomaly predictions from trained models
  served by FastAPI.
- Inspect prediction health, recommendations, input sources, and model status
  in the dashboard.
- Run locally with Vite and the ML service, or deploy the frontend and ML
  service together on Vercel with a persistent Qdrant Cloud index.

## Application pages

| Route           | Description                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------- |
| `/`             | Fleet overview, KPIs, filters, and machine cards                                              |
| `/machines`     | Searchable machine list and add-machine flow                                                  |
| `/machines/:id` | Machine profile, trends, prediction details, and history                                      |
| `/maintenance`  | Browser-local work orders with scheduled, in-progress, completion, and cancellation workflows |
| `/alerts`       | Machine alerts, severity filters, and recommended actions                                     |
| `/reports`      | Analytics from eligible prediction and work-order records; CSV export                         |
| `/quality`      | Explicitly simulated image-inspection demo                                                    |
| `/assistant`    | RAG assistant for indexed documents, current model outputs, and work orders                   |
| `/users`        | Enterprise user management, employee directory, and RBAC permission enforcement               |
| `/settings`     | Display thresholds, preferences, and local data management                                    |
| `/landing`      | Public landing page highlighting platform features and enterprise capabilities                |

## How predictions work

The browser sends machine features to `POST /api/predict`. The FastAPI service
loads the saved failure, failure-type, and anomaly models at startup, validates
the request, calculates health and recommendation fields, and returns the
prediction to the dashboard.

The seeded dashboard profiles use **simulated inputs** by default. Their
failure-model feature values (air/process temperature, rotational speed,
torque, and tool wear) are shown in the dashboard and sent unchanged to the
saved models. For simulated sensor inputs, health, status, and recommendation
use the failure-model probability only. The sensor anomaly model is not run on
the synthetic `sensor_XX` window because its channels are not calibrated to the
anomaly training data; anomaly score and flag are shown as unavailable rather
than treating out-of-distribution demo values as real anomalies. The dashboard's
other named sensor examples are illustrative because the anomaly dataset
channels have no verified mapping to those physical sensor names. Simulated
feature inputs are generated for a new demo fleet and saved locally; reopening
the dashboard reuses each machine's saved inputs so its result does not change
without a new evaluation. Inputs change when **Generate new demo readings** is
explicitly used. Machine features are sent to the failure model and, when
applicable, the failure-type model. A newly generated 12-machine fleet assigns
three machines to each of four condition profiles—good, medium, acceptable and
poor (كويس، متوسط، مقبول، وحش)—in shuffled random order.
Failure-model profiles are validated across all three machine-type codes, and
corner plus Monte-Carlo checks confirm that reading jitter keeps every profile
inside its predicted health band without flipping its status. The returned model
prediction—not the assigned input profile—determines displayed health, risk,
status, recommendation, active model alert, and report snapshot. These remain
simulated model results, not live telemetry.
The action clears the previous prediction, submits the new feature values to
the trained model service, and displays the returned prediction when evaluation
finishes; it does not reset work orders or other local data. Demo output is a
model calculation on simulated inputs, not a live equipment measurement or
field-calibrated reliability estimate.

## Visual quality inspection

The `/quality` page calls the optional PatchCore inference endpoint and displays
the model's normal/anomalous result, anomaly score, and heatmap. It no longer
generates a simulated inspection verdict. PatchCore detects visual anomalies;
it does not identify defect names or certify product quality.

The checkpoint is not included in this repository. See
[the quality model setup guide](ml/quality/README.md) for optional dependency
installation, checkpoint location, and training prerequisites. Until a
compatible checkpoint and `anomalib` are installed, `GET /api/quality/health`
reports the model unavailable and image inspection returns HTTP 503.

Install the optional Python dependency with `npm run setup:quality` in the
environment used by the ML service. This is separate from the default
`setup:ml` install; the existing demo and failure-prediction API do not require
anomalib.

## AI Assistant and document retrieval

The `/assistant` screen keeps the project's React design and calls the main
FastAPI service for RAG chat, PDF/TXT indexing, optional image analysis,
microphone transcription, and response speech. Embeddings and Qdrant vectors
stay local. Groq receives questions, retrieved document passages, and optional
images/audio; response text is sent to the hosted TTS service when read aloud.
The source project's `.env`, virtual environment, and standalone HTML UI are
not copied.

Install the optional runtime with `npm run setup:assistant`, then add
`GROQ_API_KEY` to the ignored root `.env` file. The first document upload or
search downloads the multilingual E5 embedding model (about 2 GB). Only PDF
and UTF-8 TXT files are supported for indexing. See
[the assistant setup guide](ml/assistant/README.md) for local storage, privacy,
model configuration, and OCR details. Missing dependencies or credentials
produce explicit unavailable/error states; the UI no longer fabricates chat
answers or claims document contents are indexed when they are not.

Machine cards and details show a compact bar for each of the five numeric
failure-model inputs. The failure-probability bar is the saved model's output
and marks the configured warning and critical risk thresholds. Each machine
receives independently generated feature values; its inputs and model outputs
stay fixed across reloads and change only when new demo readings are explicitly
requested. For simulated inputs, the displayed health score is a proxy computed
from failure probability, not a direct measurement of machine condition or
remaining useful life. Model outputs determine the displayed risk, health,
status, and recommendation. The four
condition labels are derived from the returned health score and the same
thresholds that decide the status—above the warning-threshold midpoint (كويس),
above the warning threshold (متوسط), above the critical threshold (مقبول), and
at or below the critical threshold (وحش)—so the label always agrees with the
displayed status and recommendation; they never modify the score.
Maintenance urgency is also derived from the current model status: operational
is on schedule, warning is due soon, and critical calls for immediate service.
“Overdue” is reserved for a maintenance date that has actually passed.

### Feature status

| Capability                                       | Status                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Failure probability and failure-type inference   | Trained model service                                                                                  |
| Sensor anomaly score                             | Trained anomaly model; demo sensor inputs are simulated                                                |
| Trained ML health score and model recommendation | Derived from model outputs and configured thresholds                                                   |
| Randomized demo failure-model inputs             | Generated within training-data ranges, then sent unchanged to the trained model service                |
| Dashboard's other named sensor examples          | Illustrative demo data; not model inputs                                                               |
| Maintenance work orders                          | Browser-local workflow; not connected to a CMMS                                                        |
| Actual downtime and actual cost KPIs             | Calculated only from completed orders with explicitly recorded actual values                           |
| MTBF and failure rate                            | Unavailable until machine operating-hour exposure is recorded                                          |
| Reports export                                   | CSV is generated; PDF and Excel export are unavailable                                                 |
| Arabic and English UI                            | Central translation dictionary with RTL layout                                                         |
| Global search and dashboard actions              | Search local machine, alert, and work-order records; actions navigate to existing flows                |
| Assistant responses                              | Groq answers grounded in local document retrieval and current non-demo project predictions/work orders |
| Document upload                                  | PDF/TXT parsing and local vector indexing; optional Arabic/English OCR for scanned PDFs                |
| Image quality inspection                         | Deterministic demo output; not connected to a trained vision model                                     |

Model recommendations are decision-support outputs, not safety instructions.
The demo models and simulated inputs are not calibrated or certified for
operational decisions on real equipment.

## Technology

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, Recharts, Lucide Icons
- **Inference API:** Python 3.11, FastAPI, scikit-learn, pandas, NumPy, joblib
- **AI Assistant & RAG:** Qdrant Vector Store, Hugging Face Transformers (`multilingual-e5-large`), Groq LLM API
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, RBAC permissions, Audit Logging)
- **Workflow Automation:** n8n Webhook alerts for critical telemetry faults
- **CI / CD & Tooling:** GitHub Actions, ESLint, Prettier, TypeScript strict checks, Pytest
- **Deployment:** Vercel multi-service configuration (Vite SPA + Python Serverless API)
- **State:** React Context API + Browser `localStorage` fallback for offline demo state

The serialized anomaly pipeline is version-sensitive. Both training and
inference dependencies pin `scikit-learn` to **1.7.1**; keep this version
consistent when regenerating or serving the model artifacts.

## Run locally

### Requirements

- Node.js 18 or newer
- Python 3.10 or newer
- The model artifacts in `ml/models/`

From the repository root:

```powershell
npm install
npm run setup:ml
npm run dev
```

`npm run dev` starts the ML API on `127.0.0.1:8001`, waits for its model health
check, and then starts Vite. Open the local URL printed by Vite.

To run the services in separate terminals instead:

```powershell
# Terminal 1 — from the repository root
npm run dev:ml
```

```powershell
# Terminal 2 — from the repository root
npm run dev:app
```

The Vite development proxy forwards `/api/*` to `http://127.0.0.1:8001` by
default. To use a different ML API origin, set `ML_API_DEV_ORIGIN` before
starting the app.

### Check the API

With the ML service running, open `http://127.0.0.1:8001/health` or
`http://127.0.0.1:8001/api/health`. A ready service returns:

```json
{ "status": "ok", "models_loaded": true }
```

The prediction endpoint is `POST /api/predict`. Its request schema, input-source
requirements, response fields, and configuration options are documented in
[the ML README](ml/README.md).

## Deploy to Vercel

The repository-root [vercel.json](vercel.json) defines two Vercel Services:

- `app`: the Vite frontend.
- `ml`: the FastAPI service rooted in `ml/`, including the optional assistant
  runtime dependencies.

Vercel detects the Python runtime from the FastAPI service entrypoint; its
runtime identifier should not be used to specify a Python language version.
Requests to `/api/*` are routed to the ML service; other paths are routed to
the frontend, including client-side routes. No manually copied ML service URL
is required by the browser. The backend requires the tracked model artifacts,
`GROQ_API_KEY`, and Qdrant Cloud's `QDRANT_URL` and `QDRANT_API_KEY`. The
assistant refuses to use ephemeral local Qdrant storage on Vercel.

Connect the repository to Vercel with the repository root (`./`) as the project
root, then deploy the `main` branch. After deployment:

1. Add `GROQ_API_KEY`, `QDRANT_URL`, and `QDRANT_API_KEY` to the Vercel
   project's Production and Preview environment variables. Do not put secrets
   in Git or `vercel.json`.
2. Add `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` to the Vercel environment if the
   Python bundle exceeds the standard 500 MB limit. Large Functions are
   required for the assistant's PyTorch dependency bundle and must be
   available to the project.
3. The 2 GB multilingual embedding model uses substantial memory. The local
   load used about 1.7 GB; use a plan/runtime with up to 4 GB function memory
   and verify it stays within the deployed limit.
4. Vercel functions cap request/response bodies at 4.5 MB. Uploads are
   automatically limited to 4 MB on Vercel (documents, assistant images/audio,
   and quality-inspection images); local development retains its larger limits.
5. Check `https://<your-deployment-domain>/api/health` and confirm
   `"models_loaded": true`, then check `/api/assistant/health`.
6. Upload a small test document and confirm it remains listed after a new
   function instance handles `/api/assistant/documents`.
7. Check the Vercel runtime logs if inference or assistant requests fail.

The multilingual embedding model is downloaded to `/tmp` when first used by a
function instance. Serverless temporary storage is not durable, so a cold
instance may download it again. The PatchCore endpoint remains unavailable
until the optional quality dependencies and compatible checkpoint are securely
provisioned for its service; no checkpoint is included in the repository.

## Development checks

Run the full local validation suite:

```bash
# Frontend code style, type safety, and linting
npm run format:check
npm run lint
npm run typecheck
npm run build

# Python ML and assistant test suite (56 tests)
npm run test
# Or directly with pytest:
python -m pytest ml/tests -v

# Local runtime endpoint smoke test
npm run smoke
```

## Repository layout

```text
.github/
  workflows/ci.yml    Automated GitHub Actions CI/CD test and build pipeline
  ISSUE_TEMPLATE/     Standardized bug report and feature request templates
  dependabot.yml      Automated npm and pip security updates
integrations/
  n8n/                Automated fault notification webhook workflows & docs
ml/
  app/                FastAPI routes, schemas, inference, and decision logic
  assistant/          Multilingual RAG engine, document indexing, voice TTS/STT
  quality/            PatchCore visual inspection model pipeline
  models/             Trained production model artifacts (.joblib) & metadata
  tests/              Comprehensive pytest test suite
  main.py             ASGI FastAPI service entry point
scripts/              Database seeding, RBAC testing, dev runner, and smoke tests
src/
  components/         Layout, machine cards, modals, and reusable UI elements
  context/            Application state, authentication, and user preferences
  data/               API clients, mock fleet fallback, and inspection helpers
  i18n/               Bilingual Arabic/English translations & RTL support
  lib/                Supabase client and enterprise schema bindings
  pages/              Main route views (Overview, Machines, Alerts, Assistant, etc.)
  types/              TypeScript interfaces for machines, users, RBAC, and telemetry
  utils/              Fault webhooks, audio alerts, PDF reports, and math helpers
supabase/
  migrations/         Consolidated PostgreSQL enterprise schema, RLS, and RBAC
  functions/          Edge functions (e.g. invite-user)
docs/assets/          Architecture diagrams and visual assets
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
