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

The model outputs are designed to be combined by the application's future
Prediction/Health Engine:

`Failure model + anomaly model + trend -> machine health score -> recommendation`

