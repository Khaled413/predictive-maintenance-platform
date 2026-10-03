from contextlib import asynccontextmanager
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException

from .config import get_settings
from .feature_engineering import maintenance_features
from .health_decision import DecisionThresholds as HealthDecisionThresholds, decide_health
from .inference import ModelBundle, infer, load_models
from .schemas import HealthResponse, PredictionRequest, PredictionResponse
from .simulator import simulate_sensor_window

logger = logging.getLogger(__name__)
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def create_app(models_dir: str | Path | None = None) -> FastAPI:
    configured_models_dir = Path(models_dir or os.getenv("MODEL_DIR", DEFAULT_MODELS_DIR))

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        try:
            get_settings()
            application.state.model_bundle = load_models(configured_models_dir)
            logger.info("Loaded predictive-maintenance models from %s", configured_models_dir)
        except Exception:
            logger.exception("Could not initialize predictive-maintenance models from %s", configured_models_dir)
            raise
        yield

    application = FastAPI(title="Predictive Maintenance Inference API", lifespan=lifespan)

    @application.get("/api/health", response_model=HealthResponse)
    @application.get("/health", response_model=HealthResponse)
    def health() -> dict[str, Any]:
        bundle = getattr(application.state, "model_bundle", None)
        failure_model_ready = isinstance(bundle, ModelBundle) and bundle.failure_model is not None
        failure_type_model_ready = (
            isinstance(bundle, ModelBundle) and bundle.failure_type_model is not None
        )
        anomaly_model_ready = isinstance(bundle, ModelBundle) and bundle.anomaly_model is not None
        loaded = failure_model_ready and failure_type_model_ready and anomaly_model_ready
        version = (
            bundle.metadata.get("model_version")
            if loaded and isinstance(bundle.metadata.get("model_version"), str)
            else None
        )
        return {
            "status": "ok" if loaded else "not_ready",
            "models_loaded": loaded,
            "failure_model": "ready" if failure_model_ready else "unavailable",
            "failure_type_model": "ready" if failure_type_model_ready else "unavailable",
            "anomaly_model": "ready" if anomaly_model_ready else "unavailable",
            "model_version": version,
            "last_prediction_at": getattr(application.state, "last_prediction_at", None),
        }

    @application.post("/api/predict", response_model=PredictionResponse)
    def predict(request: PredictionRequest) -> dict[str, Any]:
        bundle = getattr(application.state, "model_bundle", None)
        if not isinstance(bundle, ModelBundle):
            raise HTTPException(status_code=503, detail="Inference models are not loaded")
        machine_features = maintenance_features(
            request.air_temperature,
            request.process_temperature,
            request.rotational_speed,
            request.torque,
            request.tool_wear,
            request.machine_type,
        )
        simulated = request.sensor_window is None
        if simulated:
            window = simulate_sensor_window(
                request.machine_id,
                request.simulation_state,
                request.air_temperature,
                request.process_temperature,
                request.rotational_speed,
                request.torque,
                request.tool_wear,
            )
        else:
            window = request.sensor_window
        try:
            settings = get_settings()
            result = infer(
                bundle,
                machine_features,
                window,
                settings.failure_threshold,
            )
            configured_thresholds = request.decision_thresholds
            decision_thresholds = (
                HealthDecisionThresholds(
                    health_warning=configured_thresholds.health_warning,
                    health_critical=configured_thresholds.health_critical,
                    risk_warning=configured_thresholds.risk_warning,
                    risk_critical=configured_thresholds.risk_critical,
                )
                if configured_thresholds
                else None
            )
            decision = decide_health(
                result["failure_probability"],
                result["anomaly_score"],
                settings,
                decision_thresholds,
            )
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        timestamp = datetime.now(timezone.utc)
        application.state.last_prediction_at = timestamp
        latest_reading_at = (
            window[-1]["timestamp"]
            if request.sensor_window is not None
            else timestamp
        )
        return {
            "machine_id": request.machine_id,
            "inputs": {
                "type": request.machine_type,
                "air_temperature": request.air_temperature,
                "process_temperature": request.process_temperature,
                "rotational_speed": request.rotational_speed,
                "torque": request.torque,
                "tool_wear": request.tool_wear,
                "simulation_state": request.simulation_state,
                "machine_input_source": request.machine_input_source,
                "sensor_input_source": request.sensor_input_source,
            },
            "machine_input_source": request.machine_input_source,
            "sensor_input_source": request.sensor_input_source,
            "failure_probability": result["failure_probability"],
            "failure_type": result["failure_type"],
            "anomaly_score": result["anomaly_score"],
            "anomaly_flag": result["anomaly_flag"],
            "health_score": decision.health_score,
            "status": {
                "healthy": "Operational",
                "warning": "Warning",
                "critical": "Critical",
            }[decision.status],
            "recommendation": decision.recommendation,
            "prediction_source": "Trained ML Models",
            "data_source": (
                "Simulated Sensor Data" if simulated else "Provided Sensor Data"
            ),
            "machine_inputs_simulated": request.machine_input_source == "simulated",
            "sensor_inputs_simulated": simulated,
            "anomaly_features_used": result["anomaly_feature_names"],
            "anomaly_model_inputs": result["anomaly_model_inputs"],
            "anomaly_input_reading_count": len(window),
            "latest_reading_at": latest_reading_at,
            "timestamp": timestamp,
        }

    return application


app = create_app()
