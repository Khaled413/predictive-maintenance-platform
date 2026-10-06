from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .feature_engineering import (
    DEFAULT_ANOMALY_MIN,
    DEFAULT_ANOMALY_THRESHOLD,
    FAILURE_FEATURE_ORDER,
    SENSOR_COLUMNS,
    ordered_anomaly_features,
    _context_feature_names,
)


@dataclass(frozen=True)
class ModelBundle:
    failure_model: Any
    failure_type_model: Any
    anomaly_model: Any
    metadata: dict[str, Any]
    failure_type_feature_names: list[str]
    anomaly_threshold: float
    anomaly_calibration_min: float


def _resolve_asset(directory: Path, kind: str, suffix: str) -> Path:
    override = os.getenv(f"{kind.upper()}_{suffix.upper()}_PATH")
    if override:
        path = Path(override)
        if not path.is_absolute():
            path = directory / path
        if path.is_file():
            return path
        raise FileNotFoundError(f"{kind} asset does not exist: {path}")
    files = sorted(directory.glob("*.joblib" if suffix == "model" else "*.json"))
    terms = {
        "failure": ("failure", "maintenance"),
        "failure_type": ("failure_type", "failure-type", "type"),
        "anomaly": ("anomaly", "isolation", "sensor"),
    }[kind]
    candidates = [
        path
        for path in files
        if any(term in path.stem.lower() for term in terms)
        and not (kind == "failure" and "type" in path.stem.lower())
        and not (kind == "failure_type" and "anomaly" in path.stem.lower())
    ]
    if len(candidates) == 1:
        return candidates[0]
    expected = {
        "failure": "failure_model.joblib",
        "failure_type": "failure_type_model.joblib",
        "anomaly": "anomaly_model.joblib",
    }[kind]
    exact = directory / expected
    if exact.is_file():
        return exact
    raise FileNotFoundError(
        f"Could not uniquely locate {kind} {suffix} in {directory}; "
        f"expected {expected} (found {[p.name for p in candidates]})"
    )


def _read_metadata(directory: Path) -> dict[str, Any]:
    metadata_files = sorted(directory.glob("*.json"))
    if not metadata_files:
        raise FileNotFoundError(f"No model metadata JSON found in {directory}")
    combined: dict[str, Any] = {}
    for path in metadata_files:
        try:
            content = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"Invalid model metadata file {path}: {exc}") from exc
        if isinstance(content, dict):
            combined[path.stem] = content
            combined.update(content)
    return combined


def _metadata_number(metadata: dict[str, Any], names: tuple[str, ...], default: float) -> float:
    def visit(value: Any, allowed: tuple[str, ...]) -> float | None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key.lower() in allowed and isinstance(child, (int, float)):
                    return float(child)
            for child in value.values():
                result = visit(child, allowed)
                if result is not None:
                    return result
        return None

    contextual = [
        value for key, value in metadata.items()
        if "anomaly" in key.lower() and isinstance(value, dict)
    ]
    for value in contextual:
        result = visit(value, names)
        if result is not None:
            return result
    result = visit(metadata, tuple(name for name in names if name != "threshold"))
    if result is not None:
        return result
    if "threshold" in names:
        result = visit(metadata, ("threshold",))
        if result is not None:
            return result
    return default


def _validate_model(model: Any, name: str, expected_features: int) -> None:
    if not callable(getattr(model, "predict_proba", None)) and name != "anomaly":
        raise ValueError(f"{name} artifact must implement predict_proba")
    if name == "anomaly" and not callable(getattr(model, "decision_function", None)):
        raise ValueError("anomaly artifact must implement decision_function")
    feature_count = getattr(model, "n_features_in_", None)
    if feature_count is not None and int(feature_count) != expected_features:
        raise ValueError(
            f"{name} model expects {feature_count} features; metadata/configuration gives "
            f"{expected_features}"
        )


def load_models(models_dir: str | Path) -> ModelBundle:
    """Load and validate all production artifacts once during application startup."""
    directory = Path(models_dir)
    if not directory.is_dir():
        raise FileNotFoundError(f"Model directory does not exist: {directory}")
    metadata = _read_metadata(directory)
    failure_path = _resolve_asset(directory, "failure", "model")
    type_path = _resolve_asset(directory, "failure_type", "model")
    anomaly_path = _resolve_asset(directory, "anomaly", "model")
    try:
        failure_model = joblib.load(failure_path)
        failure_type_model = joblib.load(type_path)
        anomaly_model = joblib.load(anomaly_path)
    except Exception as exc:
        raise RuntimeError(f"Unable to load model artifacts from {directory}: {exc}") from exc

    failure_type_feature_names = getattr(failure_type_model, "feature_names_in_", None)
    if failure_type_feature_names is None:
        failure_type_feature_names = _metadata_feature_names_for(metadata, "failure_type")
    if failure_type_feature_names is None:
        feature_count = getattr(failure_type_model, "n_features_in_", len(FAILURE_FEATURE_ORDER))
        if int(feature_count) == len(FAILURE_FEATURE_ORDER):
            failure_type_feature_names = FAILURE_FEATURE_ORDER
        else:
            raise ValueError(
                "failure-type model and metadata do not provide an ordered feature list"
            )
    failure_type_feature_names = list(failure_type_feature_names)
    failure_feature_names = getattr(failure_model, "feature_names_in_", None)
    if failure_feature_names is None:
        failure_feature_names = _metadata_feature_names_for(metadata, "failure")
    if failure_feature_names is not None and list(failure_feature_names) != FAILURE_FEATURE_ORDER:
        raise ValueError(
            "failure model feature order does not match the required maintenance feature order"
        )
    if any(name not in FAILURE_FEATURE_ORDER for name in failure_type_feature_names):
        raise ValueError("failure-type model has features that cannot be built from machine inputs")
    anomaly_feature_names = getattr(anomaly_model, "feature_names_in_", None)
    if anomaly_feature_names is None:
        anomaly_feature_names = _metadata_feature_names_for(metadata, "anomaly")
    if anomaly_feature_names is None:
        raise ValueError("anomaly model and metadata do not provide an ordered feature list")
    anomaly_feature_names = list(anomaly_feature_names)
    _validate_model(failure_model, "failure", len(FAILURE_FEATURE_ORDER))
    _validate_model(failure_type_model, "failure type", len(failure_type_feature_names))
    _validate_model(anomaly_model, "anomaly", len(anomaly_feature_names))

    classes = list(getattr(failure_model, "classes_", []))
    if classes and 1 not in classes:
        raise ValueError(f"failure model classes do not include class 1: {classes}")
    threshold = _metadata_number(
        metadata,
        (
            "anomaly_threshold",
            "anomaly_threshold_raw",
            "decision_threshold",
            "threshold",
            "score_calibration_high",
        ),
        DEFAULT_ANOMALY_THRESHOLD,
    )
    calibration_min = _metadata_number(
        metadata,
        (
            "calibration_min",
            "minimum_decision_score",
            "decision_min",
            "score_calibration_low",
        ),
        DEFAULT_ANOMALY_MIN,
    )
    if calibration_min >= threshold:
        raise ValueError("anomaly calibration minimum must be below its decision threshold")
    # Verify that the metadata order can be reproduced before accepting traffic.
    ordered_anomaly_features(
        [{sensor: 1.0 for sensor in SENSOR_COLUMNS}],
        metadata,
        anomaly_feature_names,
    )
    return ModelBundle(
        failure_model,
        failure_type_model,
        anomaly_model,
        metadata,
        failure_type_feature_names,
        threshold,
        calibration_min,
    )


def _metadata_feature_names_for(metadata: dict[str, Any], kind: str) -> list[str] | None:
    from .feature_engineering import _feature_names

    contextual = _context_feature_names(metadata, kind)
    if contextual:
        return contextual
    for key, value in metadata.items():
        if kind in key.lower().replace("-", "_") and isinstance(value, dict):
            names = _feature_names(value)
            if names:
                return names
    # Some metadata files store model-specific feature lists in a common mapping.
    for key, value in metadata.items():
        if key.lower() in {"models", "artifacts", "model_metadata"} and isinstance(value, dict):
            for model_key, model_metadata in value.items():
                if kind in model_key.lower().replace("-", "_") and isinstance(model_metadata, dict):
                    names = _feature_names(model_metadata)
                    if names:
                        return names
    generic = _feature_names(metadata)
    if kind == "anomaly" and generic and len(generic) > len(FAILURE_FEATURE_ORDER):
        return generic
    return None


def infer(
    bundle: ModelBundle,
    machine_features: dict[str, float],
    sensor_window: list[dict[str, float | None]] | None,
    failure_threshold: float = 0.50,
) -> dict[str, Any]:
    ordered_machine = pd.DataFrame(
        [[machine_features[name] for name in FAILURE_FEATURE_ORDER]],
        columns=FAILURE_FEATURE_ORDER,
    )
    failure_classes = list(bundle.failure_model.classes_)
    try:
        positive_index = failure_classes.index(1)
    except ValueError as exc:
        raise ValueError("failure model must contain positive class 1") from exc
    failure_probability = float(bundle.failure_model.predict_proba(ordered_machine)[0][positive_index])
    if not np.isfinite(failure_probability):
        raise ValueError("failure model returned a non-finite probability")
    failure_probability = float(np.clip(failure_probability, 0.0, 1.0))

    failure_type = None
    if failure_probability >= failure_threshold:
        type_classes = list(bundle.failure_type_model.classes_)
        type_input = pd.DataFrame(
            [[machine_features[name] for name in bundle.failure_type_feature_names]],
            columns=bundle.failure_type_feature_names,
        )
        failure_type = str(bundle.failure_type_model.predict(type_input)[0])
        if failure_type not in [str(label) for label in type_classes]:
            raise ValueError("failure-type prediction does not match model classes")

    if sensor_window is None:
        anomaly_score = None
        anomaly_flag = None
        decision = None
        names: list[str] = []
        anomaly_values: list[float] = []
    else:
        model_feature_names = getattr(bundle.anomaly_model, "feature_names_in_", None)
        names, anomaly_values = ordered_anomaly_features(
            sensor_window, bundle.metadata, model_feature_names
        )
        decision = float(
            bundle.anomaly_model.decision_function(
                pd.DataFrame([anomaly_values], columns=names)
            )[0]
        )
        if not np.isfinite(decision):
            raise ValueError("anomaly model returned a non-finite decision score")
        anomaly_score = float(
            np.clip(
                (bundle.anomaly_threshold - decision)
                / (bundle.anomaly_threshold - bundle.anomaly_calibration_min),
                0.0,
                1.0,
            )
        )
        anomaly_flag = bool(decision < bundle.anomaly_threshold)
    return {
        "failure_probability": failure_probability,
        "failure_type": failure_type,
        "anomaly_score": anomaly_score,
        "anomaly_flag": anomaly_flag,
        "anomaly_decision_value": decision,
        "anomaly_feature_names": names,
        "anomaly_model_inputs": {
            name: float(value) if np.isfinite(value) else None
            for name, value in zip(names, anomaly_values)
        },
    }
