from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import pandas as pd


FAILURE_FEATURE_ORDER = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
    "Type_H",
    "Type_L",
    "Type_M",
    "Temperature Difference [K]",
    "Temperature Ratio",
    "Mechanical Power Proxy",
    "Tool Wear × Torque",
    "Torque Squared",
    "Rotational Speed Squared",
]

SENSOR_COLUMNS = [
    *(f"sensor_{index:02d}" for index in range(15)),
    *(f"sensor_{index:02d}" for index in range(16, 52)),
]
DEFAULT_ANOMALY_THRESHOLD = -0.05081508432158591
DEFAULT_ANOMALY_MIN = -0.23806064172560862


def maintenance_features(
    air_temperature: float,
    process_temperature: float,
    rotational_speed: float,
    torque: float,
    tool_wear: float,
    machine_type: str,
) -> dict[str, float]:
    """Return the maintenance model inputs with the training-time column names."""
    return {
        "Air temperature [K]": float(air_temperature),
        "Process temperature [K]": float(process_temperature),
        "Rotational speed [rpm]": float(rotational_speed),
        "Torque [Nm]": float(torque),
        "Tool wear [min]": float(tool_wear),
        "Type_H": float(machine_type == "H"),
        "Type_L": float(machine_type == "L"),
        "Type_M": float(machine_type == "M"),
        "Temperature Difference [K]": float(process_temperature - air_temperature),
        "Temperature Ratio": float(process_temperature / air_temperature),
        "Mechanical Power Proxy": float(torque * rotational_speed),
        "Tool Wear × Torque": float(tool_wear * torque),
        "Torque Squared": float(torque**2),
        "Rotational Speed Squared": float(rotational_speed**2),
    }


def _feature_names(metadata: Mapping[str, Any]) -> list[str] | None:
    """Find an ordered feature-name list in common metadata layouts."""
    preferred = {
        "feature_names",
        "feature_order",
        "features",
        "input_features",
        "columns",
        "selected_features",
        "feature_columns",
        "model_features",
    }
    if isinstance(metadata, Mapping):
        for key, value in metadata.items():
            if key.lower() in preferred and isinstance(value, Sequence) and not isinstance(
                value, (str, bytes)
            ):
                if value and all(isinstance(item, str) for item in value):
                    return list(value)
        for value in metadata.values():
            if isinstance(value, Mapping):
                found = _feature_names(value)
                if found:
                    return found
    return None


def _context_feature_names(metadata: Mapping[str, Any], context: str) -> list[str] | None:
    for key, value in metadata.items():
        normalized_key = key.lower().replace("-", "_")
        if context == "failure" and "failure_type" in normalized_key:
            continue
        is_feature_key = any(
            token in normalized_key for token in ("feature", "column", "input", "order")
        )
        if context in normalized_key and is_feature_key:
            if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
                if value and all(isinstance(item, str) for item in value):
                    return list(value)
            if isinstance(value, Mapping):
                names = _feature_names(value)
                if names:
                    return names
        elif context in normalized_key and isinstance(value, Mapping):
            names = _feature_names(value)
            if names:
                return names
        if isinstance(value, Mapping):
            names = _context_feature_names(value, context)
            if names:
                return names
    return None


def _selected_sensors(metadata: Mapping[str, Any], feature_names: Sequence[str]) -> list[str]:
    if isinstance(metadata, Mapping):
        for key, value in metadata.items():
            if key.lower() in {"selected_sensors", "sensor_features", "raw_sensors"}:
                if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
                    return [str(sensor) for sensor in value]
        for value in metadata.values():
            if isinstance(value, Mapping):
                found = _selected_sensors(value, feature_names)
                if found:
                    return found
    # Preserve the order in which raw selected sensors occur in the metadata feature list.
    selected: list[str] = []
    for feature in feature_names:
        match = re.match(r"^(sensor_\d{2})(?:$|_)", feature)
        if match and match.group(1) not in selected:
            selected.append(match.group(1))
    return selected


def anomaly_feature_values(
    sensor_window: Sequence[Mapping[str, float | None]],
) -> tuple[dict[str, float], list[str]]:
    """Engineer aggregate, selected-channel, difference, and trailing-window features."""
    if not sensor_window:
        raise ValueError("sensor_window must contain at least one reading")
    frame = pd.DataFrame(sensor_window)
    for column in SENSOR_COLUMNS:
        if column not in frame:
            frame[column] = np.nan
    sensors = frame[SENSOR_COLUMNS].astype(float)

    values: dict[str, float] = {}
    row_mean = sensors.mean(axis=1, skipna=True)
    row_std = sensors.std(axis=1, skipna=True)
    row_min = sensors.min(axis=1, skipna=True)
    row_max = sensors.max(axis=1, skipna=True)
    aggregates = {
        "sensor_mean": row_mean,
        "sensor_std": row_std,
        "sensor_min": row_min,
        "sensor_max": row_max,
        "sensor_range": row_max - row_min,
        "missing_sensor_ratio": sensors.isna().mean(axis=1),
    }
    for name, series in aggregates.items():
        current = series.iloc[-1]
        values[name] = float(current) if pd.notna(current) else float("nan")
        delta = series.diff().iloc[-1] if len(series) > 1 else np.nan
        values[f"{name}_diff"] = float(delta) if pd.notna(delta) else float("nan")

    for sensor in SENSOR_COLUMNS:
        series = sensors[sensor]
        current = series.iloc[-1]
        values[sensor] = float(current) if pd.notna(current) else float("nan")
        delta = series.diff().iloc[-1] if len(series) > 1 else np.nan
        values[f"{sensor}_diff"] = float(delta) if pd.notna(delta) else float("nan")
        for window in (30, 120):
            rolling = series.rolling(window=window, min_periods=5)
            statistics = {
                "mean": rolling.mean().iloc[-1],
                "std": rolling.std().iloc[-1],
                "min": rolling.min().iloc[-1],
            }
            for statistic, result in statistics.items():
                value = float(result) if pd.notna(result) else float("nan")
                # Support naming conventions used by the training notebook metadata.
                for key in (
                    f"{sensor}_rolling_{statistic}_{window}",
                    f"{sensor}_roll_{statistic}_{window}",
                    f"{sensor}_{statistic}_{window}",
                    f"{sensor}_rolling_{window}_{statistic}",
                ):
                    values[key] = value

    for name, series in (("sensor_mean_diff", row_mean), ("sensor_std_diff", row_std)):
        delta = series.diff().iloc[-1] if len(series) > 1 else np.nan
        values[name] = float(delta) if pd.notna(delta) else float("nan")

    for window in (30, 120):
        rolling_features = {
            f"sensor_mean_rollmean_{window}m": row_mean.rolling(
                window=window, min_periods=5
            ).mean().iloc[-1],
            f"sensor_mean_rollstd_{window}m": row_mean.rolling(
                window=window, min_periods=5
            ).std().iloc[-1],
            f"sensor_std_rollmean_{window}m": row_std.rolling(
                window=window, min_periods=5
            ).mean().iloc[-1],
        }
        for name, result in rolling_features.items():
            values[name] = float(result) if pd.notna(result) else float("nan")

    # Alternative commonly used names map to the same exact computed values.
    for sensor in SENSOR_COLUMNS:
        for window in (30, 120):
            for statistic in ("mean", "std", "min"):
                canonical = f"{sensor}_rolling_{statistic}_{window}"
                for key in (
                    f"{sensor}_rolling_{window}_{statistic}",
                    f"{sensor}_roll_{statistic}_{window}",
                    f"{sensor}_{statistic}_{window}",
                ):
                    values[key] = values[canonical]

    return values, SENSOR_COLUMNS


def ordered_anomaly_features(
    sensor_window: Sequence[Mapping[str, float | None]],
    metadata: Mapping[str, Any],
    model_feature_names: Sequence[str] | None = None,
) -> tuple[list[str], list[float]]:
    names = (
        list(model_feature_names)
        if model_feature_names is not None and len(model_feature_names) > 0
        else _feature_names(metadata)
    )
    if not names:
        raise ValueError("anomaly metadata must include the ordered feature names")
    values, _ = anomaly_feature_values(sensor_window)
    unknown = [name for name in names if name not in values]
    if unknown:
        raise ValueError(f"unsupported anomaly feature names in metadata: {unknown[:5]}")
    return names, [values[name] for name in names]


def selected_sensors_from_metadata(metadata: Mapping[str, Any], feature_names: Sequence[str]) -> list[str]:
    selected = _selected_sensors(metadata, feature_names)
    return selected or SENSOR_COLUMNS[:12]
