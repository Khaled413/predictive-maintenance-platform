import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import numpy as np
from pydantic import ValidationError

from app.config import Settings
from app.feature_engineering import (
    DEFAULT_ANOMALY_MIN,
    DEFAULT_ANOMALY_THRESHOLD,
    FAILURE_FEATURE_ORDER,
    anomaly_feature_values,
    maintenance_features,
    ordered_anomaly_features,
)
from app.health_decision import decide_health
from app.inference import ModelBundle, infer, load_models
from app.schemas import PredictionRequest, PredictionResponse
from app.simulator import simulate_sensor_window


class FakeFailureModel:
    classes_ = np.array([0, 1])
    n_features_in_ = 14

    def __init__(self, probability):
        self.probability = probability
        self.calls = 0

    def predict_proba(self, features):
        self.calls += 1
        self.assert_features(features)
        return np.array([[1 - self.probability, self.probability]])

    @staticmethod
    def assert_features(features):
        assert features.shape == (1, 14)


class FakeTypeModel:
    classes_ = np.array(
        ["Heat Dissipation Failure", "No Failure", "Overstrain Failure", "Power Failure", "Tool Wear Failure"]
    )
    n_features_in_ = 14

    def __init__(self):
        self.calls = 0

    def predict_proba(self, features):
        return np.full((1, len(self.classes_)), 1 / len(self.classes_))

    def predict(self, features):
        self.calls += 1
        return np.array(["Overstrain Failure"])


class FakeAnomalyModel:
    feature_names_in_ = np.array(["sensor_mean"])
    n_features_in_ = 1

    def __init__(self, score):
        self.score = score

    def decision_function(self, features):
        self.assert_features(features)
        return np.array([self.score])

    @staticmethod
    def assert_features(features):
        assert features.shape == (1, 1)


def fake_bundle(probability=0.75, decision=-0.10):
    return ModelBundle(
        FakeFailureModel(probability),
        FakeTypeModel(),
        FakeAnomalyModel(decision),
        {"feature_names": ["sensor_mean"]},
        FAILURE_FEATURE_ORDER,
        DEFAULT_ANOMALY_THRESHOLD,
        DEFAULT_ANOMALY_MIN,
    )


class FeatureEngineeringTests(unittest.TestCase):
    def test_failure_features_have_exact_order_and_formulas(self):
        features = maintenance_features(300, 310, 1500, 40, 20, "M")
        self.assertEqual(list(features), FAILURE_FEATURE_ORDER)
        self.assertEqual(features["Type_H"], 0)
        self.assertEqual(features["Type_L"], 0)
        self.assertEqual(features["Type_M"], 1)
        self.assertEqual(features["Temperature Difference [K]"], 10)
        self.assertAlmostEqual(features["Temperature Ratio"], 310 / 300)
        self.assertEqual(features["Mechanical Power Proxy"], 60000)
        self.assertEqual(features["Tool Wear × Torque"], 800)
        self.assertEqual(features["Torque Squared"], 1600)
        self.assertEqual(features["Rotational Speed Squared"], 2250000)

    def test_old_sensor_aggregates_differences_and_rolling_values(self):
        first = {f"sensor_{index:02d}": float(index) for index in range(52) if index != 15}
        readings = [
            {key: value + offset for key, value in first.items()}
            for offset in range(5)
        ]
        values, columns = anomaly_feature_values(readings)
        self.assertEqual(len(columns), 51)
        self.assertAlmostEqual(values["sensor_mean"], np.mean(list(readings[-1].values())))
        self.assertEqual(values["sensor_mean_diff"], 1.0)
        self.assertEqual(values["sensor_00_diff"], 1.0)
        self.assertEqual(values["sensor_00_rolling_mean_30"], 2.0)
        self.assertEqual(values["missing_sensor_ratio"], 0.0)
        names, ordered = ordered_anomaly_features(
            [readings[-1]], {"feature_order": ["sensor_mean", "sensor_00"]},
        )
        self.assertEqual(names, ["sensor_mean", "sensor_00"])
        self.assertEqual(ordered, [values["sensor_mean"], readings[-1]["sensor_00"]])
        names, ordered = ordered_anomaly_features(
            [readings[-1]],
            {"feature_order": ["sensor_mean", "sensor_00"]},
            np.array(["sensor_mean", "sensor_00"]),
        )
        self.assertEqual(names, ["sensor_mean", "sensor_00"])
        self.assertEqual(ordered, [values["sensor_mean"], readings[-1]["sensor_00"]])


class HealthDecisionTests(unittest.TestCase):
    def test_default_formula_thresholds_and_clamping(self):
        self.assertEqual(decide_health(0, 0).health_score, 100)
        self.assertEqual(decide_health(1, 1).health_score, 0)
        self.assertEqual(decide_health(0.5, 0.5).health_score, 50)
        self.assertEqual(decide_health(0.1, 0.1).status, "healthy")
        self.assertEqual(decide_health(0.5, 0.5).status, "warning")
        self.assertEqual(decide_health(0.8, 1).status, "critical")
        custom = Settings(failure_weight=1, anomaly_weight=0, healthy_threshold=80, warning_threshold=50)
        self.assertEqual(decide_health(0.25, 1, custom).health_score, 75)


class InferenceTests(unittest.TestCase):
    def test_failure_and_anomaly_outputs_are_model_driven(self):
        machine = maintenance_features(300, 310, 1500, 40, 20, "H")
        window = [{"sensor_00": 2.5}]
        result = infer(fake_bundle(), machine, window)
        self.assertEqual(result["failure_probability"], 0.75)
        self.assertEqual(result["failure_type"], "Overstrain Failure")
        self.assertTrue(result["anomaly_flag"])
        self.assertGreater(result["anomaly_score"], 0)
        self.assertLessEqual(result["anomaly_score"], 1)

    def test_failure_type_is_skipped_below_threshold(self):
        bundle = fake_bundle(probability=0.49)
        result = infer(
            bundle,
            maintenance_features(300, 310, 1500, 40, 20, "H"),
            [{"sensor_00": 2.5}],
        )
        self.assertIsNone(result["failure_type"])
        self.assertEqual(bundle.failure_type_model.calls, 0)

    def test_simulator_is_deterministic_and_correlated(self):
        args = ("machine-1", "CRITICAL", 300.0, 310.0, 1500.0, 40.0, 20.0)
        first = simulate_sensor_window(*args, rows=6)
        self.assertEqual(first, simulate_sensor_window(*args, rows=6))
        self.assertEqual(len(first), 6)
        from app.feature_engineering import SENSOR_COLUMNS

        self.assertEqual(set(first[0]), set(SENSOR_COLUMNS))


class SchemaAndLoadingTests(unittest.TestCase):
    def test_request_rejects_invalid_type_numeric_and_nonfinite_inputs(self):
        payload = {
            "machine_id": "machine-1",
            "type": "M",
            "Air temperature [K]": 300,
            "Process temperature [K]": 310,
            "Rotational speed [rpm]": 1500,
            "Torque [Nm]": 40,
            "Tool wear [min]": 20,
        }
        self.assertEqual(PredictionRequest.model_validate(payload).machine_type, "M")
        for change in (
            {"type": "X"},
            {"Torque [Nm]": -1},
            {"Air temperature [K]": float("nan")},
            {"machine_id": ""},
            {
                "sensor_window": [
                    {"timestamp": "2026-09-30T12:00:00Z", "sensor_00": 1},
                    {"timestamp": "2026-09-30T12:02:00Z", "sensor_00": 2},
                ]
            },
        ):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                PredictionRequest.model_validate({**payload, **change})

    def test_loader_fails_clearly_when_artifacts_are_absent(self):
        with TemporaryDirectory() as directory:
            with self.assertRaisesRegex(FileNotFoundError, "metadata"):
                load_models(Path(directory))

    def test_loader_reads_and_validates_all_three_models_once(self):
        models_path = Path(__file__).resolve().parents[1] / "models"
        expected_models = [FakeFailureModel(0.7), FakeTypeModel(), FakeAnomalyModel(-0.1)]
        with (
            patch(
                "app.inference._read_metadata",
                return_value={"anomaly_metadata": {"feature_names": ["sensor_mean"]}},
            ),
            patch("app.inference._resolve_asset", side_effect=["failure.joblib", "type.joblib", "anomaly.joblib"]),
            patch("app.inference.joblib.load", side_effect=expected_models) as load,
        ):
            bundle = load_models(models_path)
        self.assertIs(bundle.failure_model, expected_models[0])
        self.assertIs(bundle.failure_type_model, expected_models[1])
        self.assertIs(bundle.anomaly_model, expected_models[2])
        self.assertEqual(load.call_count, 3)

    def test_loader_validates_loaded_artifacts_and_feature_metadata(self):
        models_path = Path(__file__).resolve().parents[1] / "models"
        if not list(models_path.glob("*.joblib")) or not list(models_path.glob("*.json")):
            self.skipTest("Local model artifacts are not present in ml/models")
        bundle = load_models(models_path)
        self.assertIsNotNone(bundle.failure_model)
        self.assertIsNotNone(bundle.failure_type_model)
        self.assertIsNotNone(bundle.anomaly_model)
        self.assertAlmostEqual(bundle.anomaly_threshold, DEFAULT_ANOMALY_THRESHOLD)
        self.assertAlmostEqual(bundle.anomaly_calibration_min, DEFAULT_ANOMALY_MIN)
        machine = maintenance_features(300, 310, 1500, 40, 20, "H")
        sensor_window = simulate_sensor_window(
            "artifact-integration", "NORMAL", 300, 310, 1500, 40, 20
        )
        result = infer(bundle, machine, sensor_window)
        self.assertGreaterEqual(result["failure_probability"], 0)
        self.assertLessEqual(result["failure_probability"], 1)
        self.assertGreaterEqual(result["anomaly_score"], 0)
        self.assertLessEqual(result["anomaly_score"], 1)
        self.assertEqual(len(result["anomaly_feature_names"]), 38)


class ApiTests(unittest.TestCase):
    def test_prediction_endpoint_structures_genuine_outputs_and_simulation_label(self):
        from app.api import create_app

        application = create_app(Path(__file__).resolve().parents[1] / "models")
        application.state.model_bundle = fake_bundle()
        predict_route = next(route for route in application.routes if getattr(route, "path", None) == "/api/predict")
        health_route = next(route for route in application.routes if getattr(route, "path", None) == "/health")
        payload = {
            "machine_id": "machine-1",
            "type": "H",
            "Air temperature [K]": 300,
            "Process temperature [K]": 310,
            "Rotational speed [rpm]": 1500,
            "Torque [Nm]": 40,
            "Tool wear [min]": 20,
            "simulation_state": "DEGRADING",
        }
        result = predict_route.endpoint(PredictionRequest.model_validate(payload))
        PredictionResponse.model_validate(result)
        self.assertEqual(result["machine_id"], "machine-1")
        self.assertEqual(result["failure_probability"], 0.75)
        self.assertTrue(result["sensor_inputs_simulated"])
        self.assertEqual(result["data_source"], "Simulated Sensor Data")
        self.assertEqual(result["prediction_source"], "Trained ML Models")
        self.assertIn(result["status"], {"Operational", "Warning", "Critical"})
        self.assertEqual(result["inputs"]["air_temperature"], 300)
        self.assertIn("timestamp", result)
        self.assertEqual(health_route.endpoint()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
