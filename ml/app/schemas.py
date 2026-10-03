from datetime import datetime
import math
import re
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    field_validator,
    model_validator,
)

from .feature_engineering import SENSOR_COLUMNS

SENSOR_COLUMN_NAMES = set(SENSOR_COLUMNS)


MachineType = Literal["H", "L", "M"]
SimulationState = Literal["NORMAL", "DEGRADING", "CRITICAL"]


class DecisionThresholds(BaseModel):
    health_warning: int = Field(ge=0, le=100)
    health_critical: int = Field(ge=0, le=100)
    risk_warning: int = Field(ge=0, le=100)
    risk_critical: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def critical_limits_must_be_stricter(self) -> "DecisionThresholds":
        if self.health_critical >= self.health_warning:
            raise ValueError("health_critical must be below health_warning")
        if self.risk_critical <= self.risk_warning:
            raise ValueError("risk_critical must be above risk_warning")
        return self


class PredictionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    machine_id: str = Field(min_length=1, max_length=128)
    machine_type: MachineType = Field(alias="type")
    air_temperature: FiniteFloat = Field(alias="Air temperature [K]", gt=0)
    process_temperature: FiniteFloat = Field(alias="Process temperature [K]", gt=0)
    rotational_speed: FiniteFloat = Field(alias="Rotational speed [rpm]", gt=0)
    torque: FiniteFloat = Field(alias="Torque [Nm]", gt=0)
    tool_wear: FiniteFloat = Field(alias="Tool wear [min]", ge=0)
    machine_input_source: Literal["simulated", "provided"]
    sensor_input_source: Literal["simulated", "provided"]
    simulation_state: SimulationState = "NORMAL"
    sensor_window: list[dict[str, object]] | None = None
    decision_thresholds: DecisionThresholds | None = None

    @model_validator(mode="after")
    def sensor_source_must_match_window(self) -> "PredictionRequest":
        if self.sensor_input_source == "provided" and self.sensor_window is None:
            raise ValueError(
                "sensor_window is required when sensor_input_source is provided"
            )
        if self.sensor_input_source == "simulated" and self.sensor_window is not None:
            raise ValueError(
                "sensor_window must be omitted when sensor_input_source is simulated"
            )
        return self

    @field_validator("machine_id")
    @classmethod
    def machine_id_must_not_be_whitespace(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("machine_id must not be blank")
        return value.strip()

    @field_validator("sensor_window")
    @classmethod
    def sensor_window_must_be_ordered_minute_readings(
        cls, readings: list[dict[str, object]] | None
    ) -> list[dict[str, object]] | None:
        if readings is None:
            return None
        if not readings:
            raise ValueError("sensor_window must contain at least one reading")
        timestamped: list[datetime] = []
        has_timestamp = ["timestamp" in reading for reading in readings]
        if not all(has_timestamp):
            raise ValueError("each provided sensor reading must include a timestamp")
        for index, reading in enumerate(readings):
            unsupported_keys = [
                key
                for key in reading
                if key != "timestamp"
                and not re.fullmatch(r"sensor_\d{2}", key)
            ]
            if unsupported_keys:
                raise ValueError(
                    f"unsupported sensor reading fields: {unsupported_keys}"
                )
            sensor_keys = [
                key for key in reading if re.fullmatch(r"sensor_\d{2}", key)
            ]
            invalid_sensor_keys = [
                key
                for key in reading
                if key.startswith("sensor_") and key not in SENSOR_COLUMN_NAMES
            ]
            if invalid_sensor_keys:
                raise ValueError(f"unsupported sensor columns: {invalid_sensor_keys}")
            if not sensor_keys:
                raise ValueError(f"sensor reading {index} contains no sensor values")
            if all(reading[key] is None for key in sensor_keys):
                raise ValueError(f"sensor reading {index} contains no numeric sensor values")
            for key in sensor_keys:
                value = reading[key]
                if value is not None and (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(float(value))
                ):
                    raise ValueError(f"{key} must be a finite number or null")
            if all(has_timestamp):
                timestamp_value = reading["timestamp"]
                if not isinstance(timestamp_value, str):
                    raise ValueError("sensor timestamps must be ISO-8601 strings")
                try:
                    timestamped.append(datetime.fromisoformat(timestamp_value.replace("Z", "+00:00")))
                except ValueError as exc:
                    raise ValueError("sensor timestamps must be valid ISO-8601 strings") from exc
        if timestamped:
            for previous, current in zip(timestamped, timestamped[1:]):
                try:
                    elapsed = (current - previous).total_seconds()
                except TypeError as exc:
                    raise ValueError("sensor timestamps must use consistent timezone information") from exc
                if elapsed != 60:
                    raise ValueError("sensor timestamps must be strictly increasing 1-minute readings")
        return readings


class PredictionResponse(BaseModel):
    machine_id: str
    inputs: dict[str, str | float]
    machine_input_source: Literal["simulated", "provided"]
    sensor_input_source: Literal["simulated", "provided"]
    failure_probability: float = Field(ge=0, le=1)
    failure_type: str | None
    anomaly_score: float = Field(ge=0, le=1)
    anomaly_flag: bool
    health_score: float = Field(ge=0, le=100)
    status: Literal["Operational", "Warning", "Critical"]
    recommendation: str
    prediction_source: Literal["Trained ML Models"]
    data_source: Literal["Simulated Sensor Data", "Provided Sensor Data"]
    machine_inputs_simulated: bool
    sensor_inputs_simulated: bool
    anomaly_features_used: list[str]
    anomaly_model_inputs: dict[str, FiniteFloat | None]
    anomaly_input_reading_count: int = Field(ge=1)
    latest_reading_at: datetime
    timestamp: datetime


class HealthResponse(BaseModel):
    status: Literal["ok", "not_ready"]
    models_loaded: bool
    failure_model: Literal["ready", "unavailable"]
    failure_type_model: Literal["ready", "unavailable"]
    anomaly_model: Literal["ready", "unavailable"]
    model_version: str | None
    last_prediction_at: datetime | None


class InspectionResponse(BaseModel):
    label: Literal["NORMAL", "ANOMALOUS"]
    score: float = Field(ge=0, le=1)
    prediction_source: Literal["Placeholder Heuristic"]
    model_status: Literal["placeholder"]
    timestamp: datetime
