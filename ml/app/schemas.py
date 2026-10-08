from datetime import datetime
import math
import re
from typing import Any, Literal

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
    anomaly_score: float | None = Field(ge=0, le=1)
    anomaly_flag: bool | None
    health_score: float = Field(ge=0, le=100)
    status: Literal["Operational", "Warning", "Critical"]
    recommendation: str
    prediction_source: Literal["Trained ML Models"]
    data_source: Literal["Simulated Sensor Data", "Provided Sensor Data"]
    machine_inputs_simulated: bool
    sensor_inputs_simulated: bool
    anomaly_features_used: list[str]
    anomaly_model_inputs: dict[str, FiniteFloat | None]
    anomaly_input_reading_count: int = Field(ge=0)
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
    model_config = ConfigDict(protected_namespaces=())

    label: Literal["NORMAL", "ANOMALOUS"]
    score: FiniteFloat = Field(ge=0)
    heatmap: str
    prediction_source: Literal["PatchCore"]
    model_status: Literal["ready"]
    timestamp: datetime


class QualityHealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: Literal["ready", "unavailable"]
    model_available: bool
    checkpoint: str
    message: str | None


class AssistantHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AssistantChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    context: Literal["factory", "machine", "knowledge", "document"] = "factory"
    machine_id: str | None = Field(default=None, max_length=128)
    document_id: str | None = Field(default=None, max_length=64)
    history: list[AssistantHistoryMessage] = Field(default_factory=list, max_length=12)
    operational_context: str = Field(default="{}", max_length=20000)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value.strip()

    @field_validator("operational_context")
    @classmethod
    def operational_context_must_be_json(cls, value: str) -> str:
        import json

        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("operational_context must be valid JSON") from exc
        if not isinstance(parsed, dict):
            raise ValueError("operational_context must be a JSON object")
        return value

    @model_validator(mode="after")
    def selected_context_must_have_its_identifier(self) -> "AssistantChatRequest":
        if self.context == "machine" and not self.machine_id:
            raise ValueError("machine_id is required for machine context")
        if self.context == "document" and not self.document_id:
            raise ValueError("document_id is required for document context")
        return self


class AssistantSource(BaseModel):
    filename: str
    page: int | None = None
    machine: str | None = None
    section: str | None = None
    subsection: str | None = None
    topic: str | None = None
    error_code: str | None = None
    content_type: str | None = None
    score: FiniteFloat = Field(ge=0, le=1)


class AssistantChatResponse(BaseModel):
    answer: str
    sources: list[AssistantSource] = Field(default_factory=list)
    intent: str
    image_analysis: str | None = None


class AssistantHealthResponse(BaseModel):
    status: Literal["ready", "unavailable"]
    provider_configured: bool
    embedding_model_loaded: bool
    indexed_documents: int | None
    ocr_available: bool
    speech_output_available: bool
    message: str | None


class AssistantDocumentResponse(BaseModel):
    document_id: str
    filename: str
    pages: int
    chunks: int = Field(ge=1)
    warnings: list[str] = Field(default_factory=list)


class IndexedAssistantDocument(BaseModel):
    document_id: str
    filename: str
    pages: int = Field(ge=0)
    chunks: int = Field(ge=1)
    uploaded_at: int = Field(ge=0)


class AssistantDocumentListResponse(BaseModel):
    documents: list[IndexedAssistantDocument]


class AssistantSpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)

    @field_validator("text")
    @classmethod
    def speech_text_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value.strip()


class AssistantSpeechChunksResponse(BaseModel):
    chunks: list[str]
