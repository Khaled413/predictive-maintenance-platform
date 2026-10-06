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
from app.health_decision import DecisionThresholds as HealthDecisionThresholds
from app.inference import ModelBundle, infer, load_models
from app.schemas import HealthResponse, PredictionRequest, PredictionResponse
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
        self.calls = 0

    def decision_function(self, features):
        self.calls += 1
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


RECOMMENDATION_BY_STATUS = {
    "healthy": "Continue normal operation and routine maintenance.",
    "warning": "Inspect the machine soon and schedule preventive maintenance.",
    "critical": "Stop or reduce operation and inspect the machine immediately.",
}


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
        self.assertAlmostEqual(
            values["sensor_mean_rollmin_30m"],
            np.mean(list(readings[0].values())),
        )
        self.assertAlmostEqual(
            values["sensor_mean_rollmax_30m"],
            np.mean(list(readings[-1].values())),
        )
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
        self.assertEqual(decide_health(0.70, 0.0).status, "critical")
        self.assertEqual(decide_health(0.699, 0.0).status, "warning")
        self.assertEqual(decide_health(0.01, None).health_score, 99)
        self.assertEqual(decide_health(0.01, None).status, "healthy")
        limits = HealthDecisionThresholds(
            health_warning=80,
            health_critical=40,
            risk_warning=50,
            risk_critical=80,
        )
        self.assertEqual(decide_health(0.719, 0.0, thresholds=limits).status, "warning")
        self.assertEqual(decide_health(0.80, 0.0, thresholds=limits).status, "critical")
        health_critical_limits = HealthDecisionThresholds(
            health_warning=70,
            health_critical=65,
            risk_warning=90,
            risk_critical=95,
        )
        self.assertEqual(
            decide_health(0.10, 0.80, thresholds=health_critical_limits).status,
            "critical",
        )
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

    def test_sensor_anomaly_is_skipped_when_no_calibrated_window_is_available(self):
        bundle = fake_bundle()
        result = infer(
            bundle,
            maintenance_features(300, 310, 1500, 40, 20, "H"),
            None,
        )
        self.assertIsNone(result["anomaly_score"])
        self.assertIsNone(result["anomaly_flag"])
        self.assertEqual(result["anomaly_feature_names"], [])
        self.assertEqual(result["anomaly_model_inputs"], {})
        self.assertEqual(bundle.anomaly_model.calls, 0)

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
            "machine_input_source": "simulated",
            "sensor_input_source": "simulated",
        }
        self.assertEqual(PredictionRequest.model_validate(payload).machine_type, "M")
        for change in (
            {"type": "X"},
            {"Torque [Nm]": -1},
            {"Air temperature [K]": float("nan")},
            {"machine_id": ""},
            {"Air temperature [°C]": 25},
            {
                "sensor_input_source": "provided",
                "sensor_window": [
                    {"timestamp": "2026-09-30T12:00:00Z", "sensor_00": 1},
                    {"timestamp": "2026-09-30T12:02:00Z", "sensor_00": 2},
                ]
            },
            {
                "sensor_input_source": "provided",
                "sensor_window": [{"Temperature": 25, "unit": "°C"}],
            },
            {"machine_input_source": None},
            {"sensor_input_source": None},
        ):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                PredictionRequest.model_validate({**payload, **change})
        with self.assertRaisesRegex(ValidationError, "sensor_window is required"):
            PredictionRequest.model_validate(
                {**payload, "sensor_input_source": "provided"}
            )
        with self.assertRaisesRegex(ValidationError, "sensor_window must be omitted"):
            PredictionRequest.model_validate(
                {
                    **payload,
                    "sensor_window": [
                        {"timestamp": "2026-09-30T12:00:00Z", "sensor_00": 1}
                    ],
                }
            )
        with self.assertRaisesRegex(ValidationError, "risk_critical must be above risk_warning"):
            PredictionRequest.model_validate({
                **payload,
                "decision_thresholds": {
                    "health_warning": 70,
                    "health_critical": 40,
                    "risk_warning": 80,
                    "risk_critical": 70,
                },
            })

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
        self.assertAlmostEqual(bundle.anomaly_threshold, bundle.metadata["threshold"])
        self.assertAlmostEqual(
            bundle.anomaly_calibration_min,
            bundle.metadata["calibration_min"],
        )
        self.assertAlmostEqual(bundle.anomaly_threshold, -bundle.metadata["threshold_score"])
        self.assertLess(bundle.anomaly_calibration_min, bundle.anomaly_threshold)
        machine = maintenance_features(300, 310, 1500, 40, 20, "H")
        sensor_window = simulate_sensor_window(
            "artifact-integration", "NORMAL", 300, 310, 1500, 40, 20
        )
        result = infer(bundle, machine, sensor_window)
        self.assertGreaterEqual(result["failure_probability"], 0)
        self.assertLessEqual(result["failure_probability"], 1)
        self.assertGreaterEqual(result["anomaly_score"], 0)
        self.assertLessEqual(result["anomaly_score"], 1)
        self.assertEqual(
            len(result["anomaly_feature_names"]),
            bundle.metadata["feature_count"],
        )

    def test_demo_profiles_keep_saved_model_outputs_bounded(self):
        models_path = Path(__file__).resolve().parents[1] / "models"
        if not list(models_path.glob("*.joblib")) or not list(models_path.glob("*.json")):
            self.skipTest("Local model artifacts are not present in ml/models")
        bundle = load_models(models_path)
        profiles = {
            "NORMAL": (298, 8, 1700, 40, 80),
            "DEGRADING": (301, 11, 1450, 60, 150),
            "CRITICAL": (303, 11, 1250, 65, 200),
        }
        for state, (base_air, base_delta, base_speed, base_torque, base_wear) in profiles.items():
            for machine_type in ("H", "L", "M"):
                for offset in range(5):
                    air = base_air + offset * 0.35
                    process = air + base_delta + offset * 0.2
                    speed = base_speed + offset * 20
                    torque = base_torque + offset * 1.2
                    wear = base_wear + offset * 8
                    features = maintenance_features(
                        air, process, speed, torque, wear, machine_type
                    )
                    sensor_window = simulate_sensor_window(
                        f"M-{offset:03d}",
                        state,
                        air,
                        process,
                        speed,
                        torque,
                        wear,
                    )
                    result = infer(bundle, features, sensor_window)
                    self.assertGreaterEqual(
                        result["failure_probability"], 0, (state, machine_type, offset)
                    )
                    self.assertLessEqual(
                        result["failure_probability"], 1, (state, machine_type, offset)
                    )
                    self.assertGreaterEqual(result["anomaly_score"], 0)
                    self.assertLessEqual(result["anomaly_score"], 1)
                    health = decide_health(
                        result["failure_probability"],
                        result["anomaly_score"],
                        settings=Settings(),
                    )
                    self.assertGreaterEqual(health.health_score, 0)
                    self.assertLessEqual(health.health_score, 100)

    def test_calibrated_profiles_produce_three_failure_model_statuses_without_sensor_scores(self):
        models_path = Path(__file__).resolve().parents[1] / "models"
        if not list(models_path.glob("*.joblib")) or not list(models_path.glob("*.json")):
            self.skipTest("Local model artifacts are not present in ml/models")
        bundle = load_models(models_path)
        profiles = {
            "H": {
                "NORMAL": (298, 8, 1700, 40, 80),
                "MEDIUM": (301.5, 8.2, 1600, 56, 190),
                "DEGRADING": (300.6, 8.8, 1380, 47.6, 246),
                "CRITICAL": (304, 9.2, 1271, 68.6, 161),
            },
            "L": {
                "NORMAL": (298, 8, 1700, 40, 80),
                "MEDIUM": (301.5, 8.6, 1550, 56, 110),
                "DEGRADING": (302.4, 8.6, 1317, 59.4, 179),
                "CRITICAL": (298.5, 10.9, 1360, 60.9, 187),
            },
            "M": {
                "NORMAL": (298, 8, 1700, 40, 80),
                "MEDIUM": (300.5, 8.2, 1550, 56, 150),
                "DEGRADING": (302, 8.5, 1381, 58.4, 201),
                "CRITICAL": (299.91, 9.99, 1325, 72.3, 247),
            },
        }
        expected_statuses = {
            "NORMAL": "healthy",
            "MEDIUM": "healthy",
            "DEGRADING": "warning",
            "CRITICAL": "critical",
        }
        for machine_type, scenarios in profiles.items():
            for state, (air, delta, speed, torque, wear) in scenarios.items():
                for offset in (-1, 0, 1):
                    features = maintenance_features(
                        air + offset * 0.01,
                        air + delta + offset * 0.02,
                        speed + offset,
                        torque + offset * 0.03,
                        wear + offset,
                        machine_type,
                    )
                    result = infer(bundle, features, None)
                    decision = decide_health(
                        result["failure_probability"], result["anomaly_score"], Settings()
                    )
                    self.assertIsNone(result["anomaly_score"])
                    self.assertIsNone(result["anomaly_flag"])
                    self.assertEqual(decision.status, expected_statuses[state])

    def test_demo_fleet_health_outputs_are_bounded_for_uncalibrated_inputs(self):
        models_path = Path(__file__).resolve().parents[1] / "models"
        if not list(models_path.glob("*.joblib")) or not list(models_path.glob("*.json")):
            self.skipTest("Local model artifacts are not present in ml/models")
        bundle = load_models(models_path)
        profiles = {
            "H": {
                "VERY_GOOD": (301.972, 12.319, 1504.874, 30.893, 126.125),
                "GOOD": (295.051, 10.170, 1740.251, 55.076, 141.465),
                "MEDIUM": (304.354, 10.645, 1220.673, 55.278, 227.439),
                "BELOW_AVERAGE": (302.321, 9.651, 1326.154, 63.769, 185.677),
                "POOR": (298.944, 10.938, 1254.748, 74.698, 153.463),
            },
            "L": {
                "VERY_GOOD": (301.735, 13.830, 1760.690, 48.394, 36.694),
                "GOOD": (296.726, 9.792, 1631.205, 55.954, 14.147),
                "MEDIUM": (301.441, 9.793, 1500.820, 59.099, 81.284),
                "BELOW_AVERAGE": (296.847, 12.332, 1486.586, 71.258, 114.001),
                "POOR": (303.841, 10.173, 1406.069, 68.702, 232.151),
            },
            "M": {
                "VERY_GOOD": (303.176, 11.934, 1392.994, 59.179, 53.999),
                "GOOD": (301.863, 12.049, 1345.884, 47.886, 235.360),
                "MEDIUM": (295.973, 8.304, 1339.230, 28.738, 37.044),
                "BELOW_AVERAGE": (300.490, 11.234, 1757.902, 64.052, 146.660),
                "POOR": (299.909, 9.985, 1325.063, 72.296, 246.892),
            },
        }
        health_bands = (
            "VERY_GOOD",
            "GOOD",
            "MEDIUM",
            "BELOW_AVERAGE",
            "POOR",
        )
        machine_types = ("M", "M", "H", "L", "L", "H", "M", "M", "M", "L", "M", "H")
        sensor_states = {
            "VERY_GOOD": "NORMAL",
            "GOOD": "NORMAL",
            "MEDIUM": "DEGRADING",
            "BELOW_AVERAGE": "DEGRADING",
            "POOR": "CRITICAL",
        }
        input_tuples = set()

        for index, machine_type in enumerate(machine_types, start=1):
            band = health_bands[(index - 1) % len(health_bands)]
            base_air, base_delta, base_speed, base_torque, base_wear = profiles[machine_type][band]
            air = round(base_air + ((index * 7) % 13 - 6) * 0.01, 2)
            delta = base_delta + ((index * 5) % 11 - 5) * 0.02
            process = round(air + delta, 2)
            speed = int(base_speed + (index * 7) % 17 - 8 + 0.5)
            torque = round(base_torque + ((index * 7) % 13 - 6) * 0.03, 2)
            wear = int(base_wear + (index * 7) % 19 - 9 + 0.5)
            input_tuple = (air, process, speed, torque, wear)
            self.assertNotIn(input_tuple, input_tuples)
            input_tuples.add(input_tuple)

            features = maintenance_features(
                air, process, speed, torque, wear, machine_type
            )
            sensor_window = simulate_sensor_window(
                f"M-{index:03d}",
                sensor_states[band],
                air,
                process,
                speed,
                torque,
                wear,
            )
            result = infer(bundle, features, sensor_window)
            health = decide_health(
                result["failure_probability"], result["anomaly_score"], Settings()
            ).health_score
            self.assertGreaterEqual(health, 0, (index, band, health))
            self.assertLessEqual(health, 100, (index, band, health))

        self.assertEqual(len(input_tuples), len(machine_types))


class ModelDecisionTests(unittest.TestCase):
    """Status, health band and recommendation must always agree with each other."""

    def test_decide_health_recommendation_is_always_consistent_with_status(self):
        for step in range(101):
            probability = step / 100
            decision = decide_health(probability, None, Settings())
            self.assertEqual(
                decision.recommendation, RECOMMENDATION_BY_STATUS[decision.status], probability
            )
            expected = (
                "critical"
                if probability >= 0.60
                else "warning"
                if probability >= 0.30
                else "healthy"
            )
            self.assertEqual(decision.status, expected, probability)
        for step in range(0, 101, 5):
            anomaly = step / 100
            for probability in (0.0, 0.25, 0.5, 0.75, 1.0):
                decision = decide_health(probability, anomaly, Settings())
                self.assertEqual(
                    decision.recommendation,
                    RECOMMENDATION_BY_STATUS[decision.status],
                    (probability, anomaly),
                )

    def test_four_demo_conditions_map_to_health_bands_with_matching_status(self):
        models_path = Path(__file__).resolve().parents[1] / "models"
        if not list(models_path.glob("*.joblib")) or not list(models_path.glob("*.json")):
            self.skipTest("Local model artifacts are not present in ml/models")
        bundle = load_models(models_path)
        # Must mirror src/utils/simulatedInputs.ts exactly.
        profiles = {
            "H": {
                "GOOD": (298, 8, 1700, 40, 80),
                "MEDIUM": (301.5, 8.2, 1600, 56, 190),
                "ACCEPTABLE": (300.6, 8.8, 1380, 47.6, 246),
                "BAD": (304, 9.2, 1271, 68.6, 161),
            },
            "L": {
                "GOOD": (298, 8, 1700, 40, 80),
                "MEDIUM": (301.5, 8.6, 1550, 56, 110),
                "ACCEPTABLE": (302.4, 8.6, 1317, 59.4, 179),
                "BAD": (298.5, 10.9, 1360, 60.9, 187),
            },
            "M": {
                "GOOD": (298, 8, 1700, 40, 80),
                "MEDIUM": (300.5, 8.2, 1550, 56, 150),
                "ACCEPTABLE": (302, 8.5, 1381, 58.4, 201),
                "BAD": (299.91, 9.99, 1325, 72.3, 247),
            },
        }
        jitter_limits = {
            "GOOD": (0.03, 0.05, 2, 0.1, 2),
            "MEDIUM": (0.03, 0.05, 2, 0.1, 2),
            "ACCEPTABLE": (0.02, 0.02, 1, 0.05, 1),
            "BAD": (0.03, 0.05, 2, 0.1, 2),
        }
        offset_spans = {"GOOD": (0.0, 4.0), "MEDIUM": (0.0,), "ACCEPTABLE": (0.0,), "BAD": (0.0,)}
        expected_status = {
            "GOOD": "healthy",
            "MEDIUM": "healthy",
            "ACCEPTABLE": "warning",
            "BAD": "critical",
        }

        def band(score: float) -> str:
            if score > 85:
                return "GOOD"
            if score > 70:
                return "MEDIUM"
            if score > 40:
                return "ACCEPTABLE"
            return "BAD"

        checked = 0
        for machine_type, conditions in profiles.items():
            for condition, (air, delta, speed, torque, wear) in conditions.items():
                limits = jitter_limits[condition]
                jitters = [(0.0, 0.0, 0.0, 0.0, 0.0)]
                for dimension, limit in enumerate(limits):
                    for sign in (-1, 1):
                        jitter = [0.0] * 5
                        jitter[dimension] = sign * limit
                        jitters.append(tuple(jitter))
                for offset in offset_spans[condition]:
                    for jitter in jitters:
                        sampled_air = round(air + offset * 0.35 + jitter[0], 2)
                        process = round(sampled_air + delta + offset * 0.2 + jitter[1], 2)
                        features = maintenance_features(
                            sampled_air,
                            process,
                            round(speed + offset * 20 + jitter[2]),
                            round(torque + offset * 1.2 + jitter[3], 2),
                            round(wear + offset * 8 + jitter[4]),
                            machine_type,
                        )
                        result = infer(bundle, features, None)
                        decision = decide_health(result["failure_probability"], None, Settings())
                        checked += 1
                        context = (machine_type, condition, offset, jitter)
                        self.assertEqual(band(decision.health_score), condition, context)
                        self.assertEqual(decision.status, expected_status[condition], context)
                        self.assertEqual(
                            decision.recommendation,
                            RECOMMENDATION_BY_STATUS[decision.status],
                            context,
                        )
        self.assertGreaterEqual(checked, 100)


class ApiTests(unittest.TestCase):
    def test_prediction_endpoint_structures_genuine_outputs_and_simulation_label(self):
        from app.api import create_app

        application = create_app(Path(__file__).resolve().parents[1] / "models")
        application.state.model_bundle = fake_bundle()
        predict_route = next(route for route in application.routes if getattr(route, "path", None) == "/api/predict")
        health_route = next(route for route in application.routes if getattr(route, "path", None) == "/health")
        public_health_route = next(
            route for route in application.routes if getattr(route, "path", None) == "/api/health"
        )
        payload = {
            "machine_id": "machine-1",
            "type": "H",
            "Air temperature [K]": 300,
            "Process temperature [K]": 310,
            "Rotational speed [rpm]": 1500,
            "Torque [Nm]": 40,
            "Tool wear [min]": 20,
            "machine_input_source": "simulated",
            "sensor_input_source": "simulated",
            "simulation_state": "DEGRADING",
            "decision_thresholds": {
                "health_warning": 60,
                "health_critical": 20,
                "risk_warning": 50,
                "risk_critical": 80,
            },
        }
        result = predict_route.endpoint(PredictionRequest.model_validate(payload))
        PredictionResponse.model_validate(result)
        self.assertEqual(result["machine_id"], "machine-1")
        self.assertEqual(result["failure_probability"], 0.75)
        self.assertEqual(result["failure_type"], "Overstrain Failure")
        self.assertEqual(result["status"], "Warning")
        self.assertIn("schedule preventive maintenance", result["recommendation"])
        self.assertTrue(result["sensor_inputs_simulated"])
        self.assertEqual(result["data_source"], "Simulated Sensor Data")
        self.assertEqual(result["anomaly_input_reading_count"], 0)
        self.assertIsNone(result["anomaly_score"])
        self.assertIsNone(result["anomaly_flag"])
        self.assertEqual(result["anomaly_model_inputs"], {})
        self.assertEqual(result["prediction_source"], "Trained ML Models")
        self.assertIn(result["status"], {"Operational", "Warning", "Critical"})
        self.assertEqual(result["inputs"]["air_temperature"], 300)
        self.assertEqual(result["machine_input_source"], "simulated")
        self.assertEqual(result["sensor_input_source"], "simulated")
        self.assertTrue(result["machine_inputs_simulated"])
        self.assertTrue(result["sensor_inputs_simulated"])
        self.assertEqual(result["inputs"]["machine_input_source"], "simulated")
        self.assertEqual(result["inputs"]["sensor_input_source"], "simulated")
        self.assertEqual(result["anomaly_features_used"], [])
        self.assertIn("timestamp", result)
        health_result = health_route.endpoint()
        public_health_result = public_health_route.endpoint()
        self.assertEqual(health_result["status"], "ok")
        self.assertEqual(health_result["failure_model"], "ready")
        self.assertEqual(health_result["failure_type_model"], "ready")
        self.assertEqual(health_result["anomaly_model"], "ready")
        self.assertTrue(health_result["models_loaded"])
        HealthResponse.model_validate(health_result)
        self.assertEqual(public_health_result["status"], "ok")

    def test_provided_machine_and_sensor_inputs_are_not_replaced_by_simulation(self):
        from app.api import create_app

        application = create_app(Path(__file__).resolve().parents[1] / "models")
        application.state.model_bundle = fake_bundle()
        predict_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/predict"
        )
        payload = {
            "machine_id": "machine-provided",
            "type": "M",
            "Air temperature [K]": 298.1,
            "Process temperature [K]": 308.6,
            "Rotational speed [rpm]": 1551,
            "Torque [Nm]": 42.8,
            "Tool wear [min]": 0,
            "machine_input_source": "provided",
            "sensor_input_source": "provided",
            "sensor_window": [{"timestamp": "2026-09-30T12:00:00Z", "sensor_00": 2.5}],
        }
        request = PredictionRequest.model_validate(payload)
        result = predict_route.endpoint(request)

        PredictionResponse.model_validate(result)
        self.assertEqual(result["machine_input_source"], "provided")
        self.assertEqual(result["sensor_input_source"], "provided")
        self.assertFalse(result["machine_inputs_simulated"])
        self.assertFalse(result["sensor_inputs_simulated"])
        self.assertEqual(result["data_source"], "Provided Sensor Data")
        self.assertEqual(result["inputs"]["air_temperature"], 298.1)
        self.assertEqual(result["inputs"]["rotational_speed"], 1551)
        self.assertEqual(result["anomaly_input_reading_count"], 1)
        self.assertIsNotNone(result["anomaly_score"])
        self.assertIsNotNone(result["anomaly_flag"])
        self.assertEqual(set(result["anomaly_model_inputs"]), set(result["anomaly_features_used"]))
        self.assertEqual(result["anomaly_model_inputs"]["sensor_mean"], 2.5)

    def test_successful_prediction_without_failure_type_keeps_exact_probability(self):
        from app.api import create_app

        application = create_app(Path(__file__).resolve().parents[1] / "models")
        application.state.model_bundle = fake_bundle(probability=0.49949)
        predict_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/predict"
        )
        payload = {
            "machine_id": "machine-no-failure-type",
            "type": "M",
            "Air temperature [K]": 300,
            "Process temperature [K]": 310,
            "Rotational speed [rpm]": 1500,
            "Torque [Nm]": 40,
            "Tool wear [min]": 20,
            "machine_input_source": "simulated",
            "sensor_input_source": "simulated",
        }
        result = predict_route.endpoint(PredictionRequest.model_validate(payload))

        PredictionResponse.model_validate(result)
        self.assertEqual(result["failure_probability"], 0.49949)
        self.assertIsNone(result["failure_type"])


    def test_real_service_route_keeps_status_recommendation_and_band_aligned(self):
        from app.api import create_app

        models_path = Path(__file__).resolve().parents[1] / "models"
        if not list(models_path.glob("*.joblib")) or not list(models_path.glob("*.json")):
            self.skipTest("Local model artifacts are not present in ml/models")
        application = create_app(models_path)
        application.state.model_bundle = load_models(models_path)
        predict_route = next(
            route
            for route in application.routes
            if getattr(route, "path", None) == "/api/predict"
        )
        # Must mirror src/utils/simulatedInputs.ts exactly.
        profiles = {
            "H": {
                "GOOD": (298, 8, 1700, 40, 80),
                "MEDIUM": (301.5, 8.2, 1600, 56, 190),
                "ACCEPTABLE": (300.6, 8.8, 1380, 47.6, 246),
                "BAD": (304, 9.2, 1271, 68.6, 161),
            },
            "L": {
                "GOOD": (298, 8, 1700, 40, 80),
                "MEDIUM": (301.5, 8.6, 1550, 56, 110),
                "ACCEPTABLE": (302.4, 8.6, 1317, 59.4, 179),
                "BAD": (298.5, 10.9, 1360, 60.9, 187),
            },
            "M": {
                "GOOD": (298, 8, 1700, 40, 80),
                "MEDIUM": (300.5, 8.2, 1550, 56, 150),
                "ACCEPTABLE": (302, 8.5, 1381, 58.4, 201),
                "BAD": (299.91, 9.99, 1325, 72.3, 247),
            },
        }
        state_by_condition = {
            "GOOD": "NORMAL",
            "MEDIUM": "DEGRADING",
            "ACCEPTABLE": "DEGRADING",
            "BAD": "CRITICAL",
        }
        status_by_condition = {
            "GOOD": "Operational",
            "MEDIUM": "Operational",
            "ACCEPTABLE": "Warning",
            "BAD": "Critical",
        }
        recommendation_by_status = {
            "Operational": RECOMMENDATION_BY_STATUS["healthy"],
            "Warning": RECOMMENDATION_BY_STATUS["warning"],
            "Critical": RECOMMENDATION_BY_STATUS["critical"],
        }

        def in_band(condition: str, health: float) -> bool:
            if condition == "GOOD":
                return health > 85
            if condition == "MEDIUM":
                return 70 < health <= 85
            if condition == "ACCEPTABLE":
                return 40 < health <= 70
            return health <= 40

        checked = 0
        for machine_type, conditions in profiles.items():
            for condition, (air, delta, speed, torque, wear) in conditions.items():
                payload = {
                    "machine_id": f"route-{machine_type}-{condition}",
                    "type": machine_type,
                    "Air temperature [K]": air,
                    "Process temperature [K]": air + delta,
                    "Rotational speed [rpm]": speed,
                    "Torque [Nm]": torque,
                    "Tool wear [min]": wear,
                    "machine_input_source": "simulated",
                    "sensor_input_source": "simulated",
                    "simulation_state": state_by_condition[condition],
                }
                request = PredictionRequest.model_validate(payload)
                result = predict_route.endpoint(request)
                PredictionResponse.model_validate(result)
                context = (machine_type, condition, result["health_score"])
                checked += 1
                self.assertTrue(
                    in_band(condition, result["health_score"]), context
                )
                self.assertEqual(result["status"], status_by_condition[condition], context)
                self.assertEqual(
                    result["recommendation"],
                    recommendation_by_status[result["status"]],
                    context,
                )
                self.assertEqual(result["prediction_source"], "Trained ML Models", context)
                self.assertIsNone(result["anomaly_score"], context)
                self.assertIsNone(result["anomaly_flag"], context)
        self.assertEqual(checked, 12)


if __name__ == "__main__":
    unittest.main()
