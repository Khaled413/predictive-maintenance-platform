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

`POST /api/predict` accepts machine inputs and either an ordered `sensor_window`
of one-minute readings or a `simulation_state` (`NORMAL`, `DEGRADING`, or
`CRITICAL`). Simulated sensor readings are deterministic and explicitly labeled
in the response; failure probability, anomaly score, health, and recommendations
come from the loaded models and deterministic health-decision rules.

Run the backend locally from this directory with
`python -m pip install -r requirements.txt` and
`python -m uvicorn main:app --host 0.0.0.0 --port 8001`. Research and notebook
dependencies are kept separately in `requirements-research.txt`. The app's
Vite proxy uses port 8001 by default; set `ML_API_DEV_ORIGIN` to override it.
In Vercel, the app function calls this internal service through the
`ML_SERVICE_URL` binding.

Configuration defaults can be overridden with `FAILURE_THRESHOLD`,
`HEALTH_FAILURE_WEIGHT`, `HEALTH_ANOMALY_WEIGHT`,
`HEALTHY_SCORE_THRESHOLD`, and `WARNING_SCORE_THRESHOLD`.

Run backend tests from this directory with `python -m unittest discover -s
tests -v`.
