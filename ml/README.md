# Machine Learning workspace

The raw datasets are intentionally kept separate because they feed different
pipelines:

- `data/raw/predictive_maintenance.csv` supports failure prediction and failure
  type classification.
- `data/raw/sensor.csv` supports sensor behavior, anomaly detection, and trend
  analysis.

Raw files are source copies and must not be modified. Cleaning and feature
engineering outputs belong in `data/processed/`; trained artifacts belong in
`models/`; generated evaluation output belongs in `reports/`.

The deployed inference service combines the model outputs through its health
decision engine:

`Failure model + anomaly model -> machine health score -> recommendation`

## Inference service

The FastAPI entrypoint is `main:app` when Vercel runs the internal Python service
from this `ml/` directory. Production artifacts and JSON metadata belong in
`models/`: a failure classifier, failure-type classifier, anomaly pipeline, and
their feature/calibration metadata. The service loads and validates the models
once during startup and fails clearly if an artifact is missing or incompatible.
The training and inference environments pin scikit-learn to 1.7.1 because the
serialized anomaly pipeline uses version-specific `SimpleImputer` state.

`POST /api/predict` accepts machine inputs in the training units (K, rpm, Nm,
and min), an explicit `machine_input_source` (`simulated` or `provided`), and
an explicit `sensor_input_source` (`simulated` or `provided`). A provided sensor
source requires an ordered `sensor_window` of timestamped one-minute `sensor_XX` readings;
a simulated source omits that window, so the anomaly model is not evaluated for
that request. The dashboard's illustrative sensor values are not calibrated
`sensor_XX` readings.
Each request can include `decision_thresholds` with `health_warning`,
`health_critical`, `risk_warning`, and `risk_critical` percentages. These limits
determine the returned status and recommendation; critical status is triggered
when either the health score reaches its critical limit or failure risk reaches
its critical limit. Omitted limits use backend configuration defaults.
The response echoes both input sources, the exact machine-model inputs, the
engineered anomaly feature values when a provided sensor window is evaluated,
the sensor-window reading count, and whether each input group was simulated.
When no calibrated sensor window is provided, anomaly score and flag are
unavailable and the reading count is zero. Predictions from simulated machine
inputs are for demonstration only, not live equipment assessment.

The `sensor_XX` channels come from the separate raw sensor dataset. That dataset
does not document physical units or a mapping to named dashboard readings such
as temperature, vibration, pressure, or power. Do not map or convert those
dashboard readings to `sensor_XX` channels without a verified source contract.
Failure probability, anomaly score, health, and the model recommendation come
from the loaded models and deterministic health-decision rules; maintenance
schedule state is separate.

### Evaluation limits

The checked-in training notebook reports a held-out failure-model F1 of 0.88
(68 positive examples), and failure-type macro F1 of 0.95 (68 examples).
The anomaly notebook now uses chronological event holdouts: historical NORMAL
rows for training, the penultimate anomaly event for threshold selection, and
the final anomaly event for a one-time test. A two-hour embargo protects the
120-minute rolling features at the training/validation boundary. On the current
sensor data, the final event window reports PR-AUC 0.79, recall 0.95, precision
0.07, and F1 0.13; it detects 72 of 76 abnormal rows but also flags 955 of 8,640
normal rows. This is one held-out event, not a reliable estimate of performance
across future failures, and the current threshold is too noisy for unattended
operational alerts. The dataset contains only seven `BROKEN` rows across seven
anomaly events. These results are dataset-specific, not evidence of field
accuracy. The anomaly model is not calibrated to the dashboard's illustrative
physical sensor readings, which are not used as anomaly-model inputs. A model
reported as `ready` means its artifact loaded, not that it is accurate or
suitable for operational/safety decisions.

Run the backend locally from this directory with
`python -m pip install -r requirements.txt` and
`python -m uvicorn main:app --host 0.0.0.0 --port 8001`. Research and notebook
dependencies are kept separately in `requirements-research.txt`. The app's
Vite proxy uses port 8001 by default; set `ML_API_DEV_ORIGIN` to override it.
In Vercel, the root service rewrite routes `/api/*` directly to this backend.
Both `/health` and `/api/health` expose the service health check.
The health response reports readiness for the failure-probability,
failure-type, and anomaly models independently. A failure-type prediction is
invoked only when failure probability meets `FAILURE_THRESHOLD`.

Configuration defaults can be overridden with `FAILURE_THRESHOLD`,
`HEALTH_FAILURE_WEIGHT`, `HEALTH_ANOMALY_WEIGHT`,
`HEALTHY_SCORE_THRESHOLD`, `WARNING_SCORE_THRESHOLD`, and
`RISK_WARNING_THRESHOLD`, `CRITICAL_FAILURE_THRESHOLD` (default `0.70`),
`HEALTH_FAILURE_WEIGHT`, and `HEALTH_ANOMALY_WEIGHT`. Per-request dashboard
thresholds override the health and risk severity limits for that prediction.

Run backend tests from this directory with `python -m unittest discover -s
tests -v`.
