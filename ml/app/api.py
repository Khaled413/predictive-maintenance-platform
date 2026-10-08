import io
from contextlib import asynccontextmanager
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError

from .config import get_settings
from .feature_engineering import maintenance_features
from .health_decision import DecisionThresholds as HealthDecisionThresholds, decide_health
from .inference import ModelBundle, infer, load_models
from .quality_inference import (
    QualityModelUnavailable,
    checkpoint_path,
    get_quality_inspector,
    model_readiness,
)
from .schemas import (
    HealthResponse,
    InspectionResponse,
    PredictionRequest,
    PredictionResponse,
    QualityHealthResponse,
)

logger = logging.getLogger(__name__)
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MAX_INSPECTION_IMAGE_BYTES = 10 * 1024 * 1024
MAX_INSPECTION_IMAGE_PIXELS = 20_000_000

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
        window = request.sensor_window
        simulated = window is None
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
            "anomaly_input_reading_count": len(window) if window is not None else 0,
            "latest_reading_at": latest_reading_at,
            "timestamp": timestamp,
        }

    @application.get("/api/quality/health", response_model=QualityHealthResponse)
    def quality_health() -> dict[str, Any]:
        ready, message = model_readiness()
        path = checkpoint_path()
        return {
            "status": "ready" if ready else "unavailable",
            "model_available": ready,
            "checkpoint": path.name,
            "message": message,
        }

    @application.post("/api/inspect", response_model=InspectionResponse)
    async def inspect(image: UploadFile = File(...)) -> dict[str, Any]:
        contents = await image.read(MAX_INSPECTION_IMAGE_BYTES + 1)
        if len(contents) > MAX_INSPECTION_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds the 10 MB upload limit.")
        try:
            with Image.open(io.BytesIO(contents)) as decoded:
                image_format = decoded.format
                width, height = decoded.size
                if image_format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(
                        status_code=415,
                        detail="Unsupported image format. Upload a JPEG, PNG, or WEBP image.",
                    )
                if width * height > MAX_INSPECTION_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="Image dimensions are too large.")
                decoded.verify()
        except HTTPException:
            raise
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.") from exc

        try:
            inspector = get_quality_inspector()
            result = await run_in_threadpool(inspector.inspect, contents, image_format)
        except QualityModelUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("PatchCore quality inspection failed")
            raise HTTPException(status_code=500, detail="PatchCore inspection failed.") from exc
        return {**result, "timestamp": datetime.now(timezone.utc)}

    return application

app = create_app()
