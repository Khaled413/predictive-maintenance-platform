from __future__ import annotations

import hashlib
import math

from .feature_engineering import SENSOR_COLUMNS


_STATE_SCALE = {"NORMAL": 0.0, "DEGRADING": 1.0, "CRITICAL": 2.5}


def simulate_sensor_window(
    machine_id: str,
    state: str,
    air_temperature: float,
    process_temperature: float,
    rotational_speed: float,
    torque: float,
    tool_wear: float,
    rows: int = 120,
) -> list[dict[str, float | None]]:
    """Generate deterministic, correlated sensor INPUTS (never model outputs)."""
    machine_offset = int(hashlib.sha256(machine_id.encode("utf-8")).hexdigest()[:8], 16) % 1000 / 1000
    degradation = _STATE_SCALE[state]
    temperature_load = max(0.0, process_temperature - air_temperature)
    mechanical_load = max(0.0, (torque * rotational_speed) / 100_000.0)
    wear_load = max(0.0, tool_wear / 200.0)
    window: list[dict[str, float | None]] = []
    for minute in range(rows):
        progress = (minute + 1) / rows
        record: dict[str, float] = {}
        for index, sensor in enumerate(SENSOR_COLUMNS):
            phase = (index % 7) * 0.37 + machine_offset
            baseline = 35.0 + index * 0.61 + (index % 5) * 4.0
            amplitude = 0.12 + (index % 4) * 0.035
            normal_variation = amplitude * math.sin(minute / (5.0 + index % 9) + phase)
            load_correlation = (
                0.018 * temperature_load
                + 0.55 * mechanical_load
                + 0.20 * wear_load
            ) * ((index % 6) + 1) / 6
            trend = degradation * progress * (0.35 + (index % 8) * 0.12)
            record[sensor] = baseline + normal_variation + load_correlation + trend
        window.append(record)
    return window
