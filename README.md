# Predictive Maintenance Platform

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
  service together on Vercel.

## Application pages

| Route | Description |
| --- | --- |
| `/` | Fleet overview, KPIs, filters, and machine cards |
| `/machines` | Searchable machine list and add-machine flow |
| `/machines/:id` | Machine profile, trends, prediction details, and history |
| `/maintenance` | Scheduled, in-progress, completed, and historical maintenance |
| `/alerts` | Machine alerts, severity filters, and recommended actions |
| `/reports` | Fleet analytics, charts, and report exports |
| `/quality` | Image-inspection demo and inspection history |
| `/assistant` | Assistant demo and document knowledge-base interface |
| `/settings` | Display thresholds, preferences, and local data management |

## How predictions work

The browser sends machine features to `POST /api/predict`. The FastAPI service
loads the saved failure, failure-type, and anomaly models at startup, validates
the request, calculates health and recommendation fields, and returns the
prediction to the dashboard.

The seeded dashboard profiles use deterministic **simulated inputs** by
default. Sensor readings shown in machine cards are explicitly illustrative;
they are not mapped to, or used as, model inputs. The anomaly model uses
`sensor_XX` data from a separate dataset whose channels do not have a verified
mapping to the dashboard's named physical sensors. Do not treat demo output as
a live equipment assessment.

### Feature status

| Capability | Status |
| --- | --- |
| Failure probability and failure-type inference | Trained model service |
| Sensor anomaly score | Trained anomaly model; demo sensor inputs are simulated |
| Health score and model recommendation | Derived from model outputs and configured thresholds |
| Dashboard sensor readings and seeded machine profiles | Illustrative demo data |
| Maintenance scheduling, alerts, reports, and preferences | Interactive application flows |
| Assistant responses and image quality inspections | Simulated demo features |

Model recommendations are decision-support outputs, not safety instructions.
The demo models and simulated inputs are not calibrated or certified for
operational decisions on real equipment.

## Technology

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, Recharts
- **Inference API:** Python, FastAPI, scikit-learn, pandas, NumPy, joblib
- **Deployment:** Vercel multi-service configuration
- **State:** Browser `localStorage` for demo application state

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
{"status":"ok","models_loaded":true}
```

The prediction endpoint is `POST /api/predict`. Its request schema, input-source
requirements, response fields, and configuration options are documented in
[the ML README](ml/README.md).

## Deploy to Vercel

The repository-root [vercel.json](vercel.json) defines two services:

- `app`: the Vite frontend.
- `ml`: the FastAPI service rooted in `ml/`.

Requests to `/api/*` are routed to the ML service; other paths are routed to
the frontend, including client-side routes. No manually copied ML service URL
is required by the browser.

Connect the repository to Vercel with the repository root (`./`) as the project
root, then deploy the `main` branch. After deployment:

1. Check `https://<your-deployment-domain>/api/health` and confirm
   `"models_loaded": true`.
2. Load the application and check the Vercel runtime logs if predictions fail.
3. Confirm the deployment uses the committed model artifacts and the pinned
   ML dependency versions.

## Development checks

```powershell
npm run build
npm run typecheck
npm run smoke
```

Run the Python inference-service tests from the repository root:

```powershell
Push-Location ml
python -m unittest discover -s tests -v
Pop-Location
```

## Repository layout

```text
ml/
  app/                FastAPI routes, schemas, inference, and decision logic
  models/             Trained model artifacts and metadata
  tests/              Inference API and model-service tests
  main.py             Vercel/FastAPI entry point
public/               Static frontend assets
scripts/              Local development and smoke-test scripts
src/
  components/         Shared layout, machine, and UI components
  context/            Application and preference state
  data/               Seed demo data and prediction API client
  pages/              Route-level screens
  types/              Shared TypeScript models
  utils/              Formatting, simulation, and application helpers
docs/assets/          Project documentation artwork
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
