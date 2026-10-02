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
a simulated source omits that window and uses the deterministic demo simulator.
The response echoes both input sources, the exact model inputs, the engineered
anomaly feature values passed to the anomaly model, the sensor-window reading
count, and whether each input group was simulated.
The demo simulator is synthetic and is not calibrated to a specific machine or
the training-data distributions. Predictions from simulated inputs are for
demonstration only, not live equipment assessment.

The `sensor_XX` channels come from the separate raw sensor dataset. That dataset
does not document physical units or a mapping to named dashboard readings such
as temperature, vibration, pressure, or power. Do not map or convert those
dashboard readings to `sensor_XX` channels without a verified source contract.
Failure probability, anomaly score, health, and the model recommendation come
from the loaded models and deterministic health-decision rules; maintenance
schedule state is separate.

Run the backend locally from this directory with
`python -m pip install -r requirements.txt` and
`python -m uvicorn main:app --host 0.0.0.0 --port 8001`. Research and notebook
dependencies are kept separately in `requirements-research.txt`. The app's
Vite proxy uses port 8001 by default; set `ML_API_DEV_ORIGIN` to override it.
In Vercel, the root service rewrite routes `/api/*` directly to this backend.
Both `/health` and `/api/health` expose the service health check.

Configuration defaults can be overridden with `FAILURE_THRESHOLD`,
`HEALTH_FAILURE_WEIGHT`, `HEALTH_ANOMALY_WEIGHT`,
`HEALTHY_SCORE_THRESHOLD`, and `WARNING_SCORE_THRESHOLD`.

Run backend tests from this directory with `python -m unittest discover -s
tests -v`.
