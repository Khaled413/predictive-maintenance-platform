import io
from contextlib import asynccontextmanager
import importlib.util
import json
import logging
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError

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
    AssistantApiKeyRequest,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantConfigResponse,
    AssistantDocumentListResponse,
    AssistantDocumentResponse,
    AssistantHealthResponse,
    AssistantSpeechRequest,
    AssistantSpeechChunksResponse,
    AssistantTranscribeResponse,
    HealthResponse,
    InspectionResponse,
    PredictionRequest,
    PredictionResponse,
    QualityHealthResponse,
)

logger = logging.getLogger(__name__)
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
VERCEL_REQUEST_BODY_LIMIT_BYTES = 4 * 1024 * 1024


def _request_upload_limit(local_limit: int) -> int:
    return (
        VERCEL_REQUEST_BODY_LIMIT_BYTES
        if os.getenv("VERCEL") == "1"
        else local_limit
    )


MAX_INSPECTION_IMAGE_BYTES = _request_upload_limit(10 * 1024 * 1024)
MAX_INSPECTION_IMAGE_PIXELS = 20_000_000
MAX_ASSISTANT_DOCUMENT_BYTES = _request_upload_limit(20 * 1024 * 1024)
MAX_ASSISTANT_DOCUMENT_PAGES = 300
MAX_ASSISTANT_IMAGE_BYTES = _request_upload_limit(10 * 1024 * 1024)
MAX_ASSISTANT_AUDIO_BYTES = _request_upload_limit(20 * 1024 * 1024)


def _assistant_engine():
    from assistant import rag_engine

    return rag_engine


def _ensure_assistant_index(application: FastAPI):
    if getattr(application.state, "assistant_index_ready", False):
        return _assistant_engine()
    with application.state.assistant_index_lock:
        if not application.state.assistant_index_ready:
            engine = _assistant_engine()
            engine.init_qdrant()
            application.state.assistant_index_ready = True
    return _assistant_engine()


def _validate_assistant_image(contents: bytes, content_type: str | None) -> str:
    if len(contents) > MAX_ASSISTANT_IMAGE_BYTES:
        limit_mb = MAX_ASSISTANT_IMAGE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Image exceeds the {limit_mb} MB upload limit.")
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WEBP image.")
    try:
        with Image.open(io.BytesIO(contents)) as decoded:
            image_format = decoded.format
            width, height = decoded.size
            if image_format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(status_code=415, detail="Unsupported image format.")
            if width * height > MAX_INSPECTION_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large.")
            decoded.verify()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.") from exc
    return {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[image_format]


def _assistant_history_text(request: AssistantChatRequest) -> str:
    return "\n".join(
        f"{'المستخدم' if item.role == 'user' else 'المساعد'}: {item.content}"
        for item in request.history[-10:]
    )


def _assistant_index_document(
    contents: bytes,
    filename: str,
    document_id: str,
    engine,
) -> tuple[int, int, list[str]]:
    extension = Path(filename).suffix.lower()
    warnings: list[str] = []
    page_count = 1
    total_chunks = 0

    if extension == ".txt":
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=415, detail="TXT files must use UTF-8 encoding.") from exc
        if not text.strip():
            raise HTTPException(status_code=422, detail="The TXT file contains no searchable text.")
        total_chunks = engine.add_document_structured(
            text=text,
            filename=filename,
            document_id=document_id,
        )
    elif extension == ".pdf":
        if not contents.startswith(b"%PDF"):
            raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF.")
        from pypdf import PdfReader

        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary_file:
                temporary_path = Path(temporary_file.name)
                temporary_file.write(contents)
            reader = PdfReader(str(temporary_path))
            if reader.is_encrypted:
                raise HTTPException(status_code=422, detail="Password-protected PDFs are not supported.")
            page_count = len(reader.pages)
            if page_count == 0:
                raise HTTPException(status_code=422, detail="The PDF contains no pages.")
            if page_count > MAX_ASSISTANT_DOCUMENT_PAGES:
                raise HTTPException(status_code=413, detail="PDFs are limited to 300 pages.")

            ocr = None
            for page_number, page in enumerate(reader.pages, start=1):
                text = page.extract_text() or ""
                try:
                    from assistant.ocr_utils import OCR_AVAILABLE, needs_ocr, ocr_pdf_page

                    if needs_ocr(text):
                        if OCR_AVAILABLE:
                            ocr = ocr or ocr_pdf_page
                            text = ocr(str(temporary_path), page_number)
                        else:
                            warnings.append("Scanned pages were skipped because OCR dependencies are unavailable.")
                except Exception:
                    logger.exception("OCR failed for %s page %s", filename, page_number)
                    warnings.append(f"OCR could not read page {page_number}.")
                if text.strip():
                    total_chunks += engine.add_document_structured(
                        text=text,
                        filename=filename,
                        page=page_number,
                        document_id=document_id,
                    )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=422, detail="The PDF could not be parsed or indexed.") from exc
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
    else:
        raise HTTPException(status_code=415, detail="Only PDF and UTF-8 TXT documents are supported.")

    if total_chunks == 0:
        raise HTTPException(
            status_code=422,
            detail="No searchable text was extracted. For scanned PDFs, install the optional OCR dependencies.",
        )
    return page_count, total_chunks, list(dict.fromkeys(warnings))

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
    application.state.assistant_index_lock = threading.Lock()
    application.state.assistant_index_ready = False

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

    @application.get(
        "/api/assistant/health",
        response_model=AssistantHealthResponse,
    )
    def assistant_health() -> dict[str, Any]:
        required_modules = (
            "groq",
            "qdrant_client",
            "sentence_transformers",
            "pypdf",
            "dotenv",
        )
        missing = [name for name in required_modules if importlib.util.find_spec(name) is None]
        if missing:
            return {
                "status": "unavailable",
                "provider_configured": False,
                "embedding_model_loaded": False,
                "indexed_documents": None,
                "max_document_bytes": MAX_ASSISTANT_DOCUMENT_BYTES,
                "max_image_bytes": MAX_ASSISTANT_IMAGE_BYTES,
                "max_audio_bytes": MAX_ASSISTANT_AUDIO_BYTES,
                "ocr_available": False,
                "speech_output_available": False,
                "message": "Install the AI Assistant dependencies with npm run setup:assistant.",
            }
        try:
            engine = _assistant_engine()
            provider_configured = bool(engine.GROQ_API_KEY)
            return {
                "status": "ready" if provider_configured else "unavailable",
                "provider_configured": provider_configured,
                "embedding_model_loaded": engine._embed_model is not None,
                "indexed_documents": len(engine.list_indexed_documents()),
                "max_document_bytes": MAX_ASSISTANT_DOCUMENT_BYTES,
                "max_image_bytes": MAX_ASSISTANT_IMAGE_BYTES,
                "max_audio_bytes": MAX_ASSISTANT_AUDIO_BYTES,
                "ocr_available": (
                    importlib.util.find_spec("fitz") is not None
                    and importlib.util.find_spec("easyocr") is not None
                ),
                "speech_output_available": importlib.util.find_spec("gradio_client") is not None,
                "message": None if provider_configured else "Configure GROQ_API_KEY in the project .env file.",
            }
        except (ImportError, OSError, RuntimeError):
            logger.exception("AI Assistant health check failed")
            return {
                "status": "unavailable",
                "provider_configured": False,
                "embedding_model_loaded": False,
                "indexed_documents": None,
                "max_document_bytes": MAX_ASSISTANT_DOCUMENT_BYTES,
                "max_image_bytes": MAX_ASSISTANT_IMAGE_BYTES,
                "max_audio_bytes": MAX_ASSISTANT_AUDIO_BYTES,
                "ocr_available": False,
                "speech_output_available": False,
                "message": "The AI Assistant could not initialize; check backend logs and local dependencies.",
            }

    @application.get(
        "/api/assistant/config",
        response_model=AssistantConfigResponse,
    )
    def assistant_config() -> dict[str, Any]:
        try:
            engine = _assistant_engine()
            keys = engine.get_groq_api_keys() if hasattr(engine, "get_groq_api_keys") else []
            if not keys and getattr(engine, "GROQ_API_KEY", None):
                keys = [engine.GROQ_API_KEY]
            configured = len(keys) > 0
            active_idx = engine.get_active_key_index() if hasattr(engine, "get_active_key_index") else 0
            if keys:
                active_idx = active_idx % len(keys)

            api_keys_info = []
            for i, k in enumerate(keys):
                masked = (
                    engine.mask_api_key(k)
                    if hasattr(engine, "mask_api_key")
                    else (f"{k[:4]}••••••••{k[-4:]}" if len(k) > 8 else "••••••••")
                )
                api_keys_info.append(
                    {
                        "id": f"key-{i + 1}",
                        "masked_key": masked,
                        "is_active": i == active_idx,
                    }
                )

            chat_model = getattr(engine, "CHAT_MODEL", "openai/gpt-oss-120b")
            stt_model = getattr(engine, "STT_MODEL", "whisper-large-v3")
            vision_model = getattr(engine, "VISION_MODEL", "qwen/qwen3.8-27b")
            auto_rotate = engine.is_auto_rotate() if hasattr(engine, "is_auto_rotate") else True
            available_chat_models = getattr(engine, "AVAILABLE_CHAT_MODELS", [])
            available_stt_models = getattr(engine, "AVAILABLE_STT_MODELS", [])

            active_masked = api_keys_info[active_idx]["masked_key"] if api_keys_info else None
            return {
                "configured": configured,
                "masked_key": active_masked,
                "model": chat_model,
                "chat_model": chat_model,
                "stt_model": stt_model,
                "vision_model": vision_model,
                "auto_rotate": auto_rotate,
                "active_key_index": active_idx,
                "api_keys": api_keys_info,
                "available_chat_models": available_chat_models,
                "available_stt_models": available_stt_models,
                "message": (
                    f"{len(keys)} active Groq API key(s) in pool."
                    if configured
                    else "Configure GROQ_API_KEY to activate AI features."
                ),
            }
        except (ImportError, OSError, RuntimeError):
            return {
                "configured": False,
                "masked_key": None,
                "model": "openai/gpt-oss-120b",
                "chat_model": "openai/gpt-oss-120b",
                "stt_model": "whisper-large-v3",
                "vision_model": "qwen/qwen3.8-27b",
                "auto_rotate": True,
                "active_key_index": 0,
                "api_keys": [],
                "available_chat_models": [],
                "available_stt_models": [],
                "message": "The AI Assistant engine is not loaded.",
            }

    @application.post(
        "/api/assistant/config",
        response_model=AssistantConfigResponse,
    )
    async def update_assistant_config(
        payload: AssistantApiKeyRequest,
    ) -> dict[str, Any]:
        try:
            engine = _assistant_engine()
        except (ImportError, OSError, RuntimeError) as exc:
            raise HTTPException(
                status_code=503,
                detail="The AI Assistant engine is unavailable.",
            ) from exc

        action = payload.action or "update"
        env_path = Path(__file__).resolve().parents[2] / ".env"

        # 1. Update models if provided
        if payload.chat_model or payload.stt_model:
            if hasattr(engine, "set_active_models"):
                engine.set_active_models(payload.chat_model, payload.stt_model)
                try:
                    from dotenv import set_key

                    if payload.chat_model:
                        set_key(str(env_path), "CHAT_MODEL", payload.chat_model)
                    if payload.stt_model:
                        set_key(str(env_path), "STT_MODEL", payload.stt_model)
                except Exception as exc:
                    logger.warning("Could not persist models to .env: %s", exc)

        # 2. Update auto-rotate policy if provided
        if payload.auto_rotate is not None and hasattr(engine, "set_auto_rotate"):
            engine.set_auto_rotate(payload.auto_rotate)
            try:
                from dotenv import set_key

                set_key(
                    str(env_path),
                    "AUTO_ROTATE_KEYS",
                    "true" if payload.auto_rotate else "false",
                )
            except Exception as exc:
                logger.warning("Could not persist AUTO_ROTATE_KEYS to .env: %s", exc)

        # 3. Handle key operations
        if action == "add":
            raw_key = payload.api_key.strip()
            if not raw_key:
                raise HTTPException(status_code=400, detail="API key cannot be empty.")
            try:
                await run_in_threadpool(engine.validate_groq_api_key, raw_key)
            except Exception as exc:
                logger.warning("Groq API key validation failed: %s", exc)
                error_msg = str(exc)
                if "401" in error_msg or "invalid_api_key" in error_msg.lower():
                    detail = "Invalid Groq API key: Authentication failed (401)."
                else:
                    detail = f"Groq API connection test failed: {error_msg}"
                raise HTTPException(status_code=400, detail=detail) from exc

            if hasattr(engine, "add_groq_api_key"):
                engine.add_groq_api_key(raw_key)
            else:
                engine.set_groq_api_key(raw_key)

            try:
                from dotenv import set_key

                keys = (
                    engine.get_groq_api_keys()
                    if hasattr(engine, "get_groq_api_keys")
                    else [raw_key]
                )
                set_key(str(env_path), "GROQ_API_KEYS", ",".join(keys))
                set_key(str(env_path), "GROQ_API_KEY", keys[0] if keys else raw_key)
            except Exception as exc:
                logger.warning("Could not persist GROQ_API_KEYS to .env: %s", exc)

        elif action == "remove":
            key_to_remove = payload.api_key.strip()
            if hasattr(engine, "remove_groq_api_key"):
                engine.remove_groq_api_key(key_to_remove)
            else:
                engine.set_groq_api_key(None)

            try:
                from dotenv import set_key

                keys = (
                    engine.get_groq_api_keys()
                    if hasattr(engine, "get_groq_api_keys")
                    else []
                )
                set_key(str(env_path), "GROQ_API_KEYS", ",".join(keys))
                set_key(str(env_path), "GROQ_API_KEY", keys[0] if keys else "")
            except Exception as exc:
                logger.warning("Could not update .env: %s", exc)

        elif action == "select":
            if payload.active_key_index is not None and hasattr(
                engine, "set_active_key_index"
            ):
                engine.set_active_key_index(payload.active_key_index)

        elif action == "clear":
            if hasattr(engine, "set_groq_api_key"):
                engine.set_groq_api_key(None)
            try:
                from dotenv import set_key

                set_key(str(env_path), "GROQ_API_KEYS", "")
                set_key(str(env_path), "GROQ_API_KEY", "")
            except Exception as exc:
                logger.warning("Could not clear keys in .env: %s", exc)

        elif action == "update" and payload.api_key.strip():
            raw_key = payload.api_key.strip()
            try:
                await run_in_threadpool(engine.validate_groq_api_key, raw_key)
            except Exception as exc:
                logger.warning("Groq API key validation failed: %s", exc)
                error_msg = str(exc)
                if "401" in error_msg or "invalid_api_key" in error_msg.lower():
                    detail = "Invalid Groq API key: Authentication failed (401)."
                else:
                    detail = f"Groq API connection test failed: {error_msg}"
                raise HTTPException(status_code=400, detail=detail) from exc

            if hasattr(engine, "add_groq_api_key"):
                engine.add_groq_api_key(raw_key)
            else:
                engine.set_groq_api_key(raw_key)

            try:
                from dotenv import set_key

                keys = (
                    engine.get_groq_api_keys()
                    if hasattr(engine, "get_groq_api_keys")
                    else [raw_key]
                )
                set_key(str(env_path), "GROQ_API_KEYS", ",".join(keys))
                set_key(str(env_path), "GROQ_API_KEY", keys[0] if keys else raw_key)
            except Exception as exc:
                logger.warning("Could not persist GROQ_API_KEYS to .env: %s", exc)

        # Return updated config
        return assistant_config()

    @application.get(
        "/api/assistant/documents",
        response_model=AssistantDocumentListResponse,
    )
    def assistant_documents() -> dict[str, Any]:
        if any(
            importlib.util.find_spec(name) is None
            for name in ("qdrant_client", "sentence_transformers", "groq")
        ):
            raise HTTPException(status_code=503, detail="AI Assistant dependencies are not installed.")
        try:
            engine = _assistant_engine()
            return {"documents": engine.list_indexed_documents()}
        except (ImportError, OSError, RuntimeError) as exc:
            logger.exception("Could not list indexed assistant documents")
            raise HTTPException(status_code=503, detail="The local document index is unavailable.") from exc

    @application.post(
        "/api/assistant/documents",
        response_model=AssistantDocumentResponse,
    )
    async def upload_assistant_document(
        file: UploadFile = File(...),
    ) -> dict[str, Any]:
        filename = Path(file.filename or "").name
        extension = Path(filename).suffix.lower()
        if not filename or extension not in {".pdf", ".txt"}:
            raise HTTPException(status_code=415, detail="Only PDF and UTF-8 TXT documents are supported.")
        contents = await file.read(MAX_ASSISTANT_DOCUMENT_BYTES + 1)
        if len(contents) > MAX_ASSISTANT_DOCUMENT_BYTES:
            limit_mb = MAX_ASSISTANT_DOCUMENT_BYTES // (1024 * 1024)
            raise HTTPException(status_code=413, detail=f"Documents are limited to {limit_mb} MB.")
        if not contents:
            raise HTTPException(status_code=422, detail="The uploaded document is empty.")

        try:
            engine = await run_in_threadpool(_ensure_assistant_index, application)
        except (ImportError, OSError, RuntimeError) as exc:
            logger.exception("AI Assistant index initialization failed")
            raise HTTPException(status_code=503, detail="The local search index could not initialize.") from exc

        document_id = str(uuid.uuid4())
        try:
            pages, chunks, warnings = await run_in_threadpool(
                _assistant_index_document,
                contents,
                filename,
                document_id,
                engine,
            )
        except HTTPException:
            try:
                await run_in_threadpool(engine.delete_document_points, document_id)
            except Exception:
                logger.exception("Could not roll back partial indexing for %s", filename)
            raise
        except Exception as exc:
            logger.exception("Document indexing failed for %s", filename)
            try:
                await run_in_threadpool(engine.delete_document_points, document_id)
            except Exception:
                logger.exception("Could not roll back partial indexing for %s", filename)
            raise HTTPException(status_code=500, detail="Document indexing failed; no success was reported.") from exc

        return {
            "document_id": document_id,
            "filename": filename,
            "pages": pages,
            "chunks": chunks,
            "warnings": warnings,
        }

    @application.delete("/api/assistant/documents/{document_id}")
    def delete_assistant_document(document_id: str) -> dict[str, bool]:
        try:
            uuid.UUID(document_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid document identifier.") from exc
        if any(
            importlib.util.find_spec(name) is None
            for name in ("qdrant_client", "sentence_transformers", "groq")
        ):
            raise HTTPException(status_code=503, detail="AI Assistant dependencies are not installed.")
        try:
            engine = _assistant_engine()
            if not any(
                item["document_id"] == document_id
                for item in engine.list_indexed_documents()
            ):
                raise HTTPException(status_code=404, detail="Indexed document not found.")
            engine.delete_document_points(document_id)
        except HTTPException:
            raise
        except (ImportError, OSError, RuntimeError) as exc:
            logger.exception("Could not delete indexed assistant document")
            raise HTTPException(status_code=503, detail="The local document index is unavailable.") from exc
        return {"deleted": True}

    @application.post(
        "/api/assistant/chat",
        response_model=AssistantChatResponse,
    )
    async def assistant_chat(request: AssistantChatRequest) -> dict[str, Any]:
        try:
            engine = _assistant_engine()
        except (ImportError, OSError, RuntimeError) as exc:
            logger.exception("AI Assistant dependencies could not load")
            raise HTTPException(status_code=503, detail="AI Assistant dependencies are unavailable.") from exc
        if not engine.GROQ_API_KEY:
            raise HTTPException(status_code=503, detail="Configure GROQ_API_KEY in the project .env file.")
        try:
            engine = await run_in_threadpool(_ensure_assistant_index, application)
            if request.document_id and not any(
                item["document_id"] == request.document_id
                for item in engine.list_indexed_documents()
            ):
                raise HTTPException(status_code=404, detail="Selected document is not indexed.")
            history = _assistant_history_text(request)
            result = await run_in_threadpool(
                engine.ask_rag,
                request.question,
                operational_context=request.operational_context,
                history_context=history,
                document_id=request.document_id,
                reasoning_mode=request.reasoning_mode,
                voice=request.voice,
            )
            return result
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("AI Assistant RAG request failed")
            raise HTTPException(status_code=502, detail="AI Assistant could not complete this request.") from exc

    @application.post(
        "/api/assistant/chat/image",
        response_model=AssistantChatResponse,
    )
    async def assistant_chat_with_image(
        question: str = Form(..., min_length=1, max_length=4000),
        context: str = Form("factory"),
        machine_id: str | None = Form(None),
        document_id: str | None = Form(None),
        history: str = Form("[]"),
        operational_context: str = Form("{}"),
        reasoning_mode: bool = Form(False),
        image: UploadFile = File(...),
    ) -> dict[str, Any]:
        contents = await image.read(MAX_ASSISTANT_IMAGE_BYTES + 1)
        image_type = _validate_assistant_image(contents, image.content_type)
        try:
            history_value = json.loads(history)
            request = AssistantChatRequest.model_validate(
                {
                    "question": question,
                    "context": context,
                    "machine_id": machine_id,
                    "document_id": document_id,
                    "history": history_value,
                    "operational_context": operational_context,
                    "reasoning_mode": reasoning_mode,
                }
            )
        except (json.JSONDecodeError, ValidationError) as exc:
            raise HTTPException(status_code=422, detail="Invalid assistant context or chat history.") from exc
        try:
            engine = _assistant_engine()
        except (ImportError, OSError, RuntimeError) as exc:
            logger.exception("AI Assistant dependencies could not load")
            raise HTTPException(status_code=503, detail="AI Assistant dependencies are unavailable.") from exc
        if not engine.GROQ_API_KEY:
            raise HTTPException(status_code=503, detail="Configure GROQ_API_KEY in the project .env file.")
        try:
            engine = await run_in_threadpool(_ensure_assistant_index, application)
            if request.document_id and not any(
                item["document_id"] == request.document_id
                for item in engine.list_indexed_documents()
            ):
                raise HTTPException(status_code=404, detail="Selected document is not indexed.")
            result = await run_in_threadpool(
                engine.ask_rag_with_image,
                request.question,
                contents,
                image_type,
                operational_context=request.operational_context,
                document_id=request.document_id,
                reasoning_mode=request.reasoning_mode,
            )
            return {**result, "intent": "image_question"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("AI Assistant image request failed")
            raise HTTPException(status_code=502, detail="AI Assistant could not analyze this image.") from exc

    @application.post(
        "/api/assistant/transcribe",
        response_model=AssistantTranscribeResponse,
    )
    async def assistant_transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
        content_type = file.content_type or ""
        if not content_type.startswith("audio/"):
            raise HTTPException(status_code=415, detail="Upload an audio recording.")
        contents = await file.read(MAX_ASSISTANT_AUDIO_BYTES + 1)
        if len(contents) > MAX_ASSISTANT_AUDIO_BYTES:
            limit_mb = MAX_ASSISTANT_AUDIO_BYTES // (1024 * 1024)
            raise HTTPException(status_code=413, detail=f"Audio recordings are limited to {limit_mb} MB.")
        if not contents:
            raise HTTPException(status_code=422, detail="The audio recording is empty.")
        try:
            engine = _assistant_engine()
            if not engine.GROQ_API_KEY:
                raise HTTPException(status_code=503, detail="Configure GROQ_API_KEY in the project .env file.")
            text = await run_in_threadpool(engine.transcribe_audio, contents, content_type)
        except HTTPException:
            raise
        except (ImportError, OSError, RuntimeError) as exc:
            logger.exception("Assistant audio transcription failed")
            raise HTTPException(status_code=502, detail="Audio transcription failed.") from exc
        except Exception as exc:
            logger.exception("Assistant audio transcription failed unexpectedly")
            raise HTTPException(status_code=502, detail=f"Audio transcription failed: {exc}") from exc
        no_speech_text = getattr(engine, "NO_SPEECH_TEXT", None)
        if not text.strip() or text == no_speech_text:
            return {"text": "", "recognized": False}
        return {"text": text, "recognized": True}

    @application.post("/api/assistant/speak")
    async def assistant_speak(request: AssistantSpeechRequest) -> Response:
        if importlib.util.find_spec("gradio_client") is None:
            raise HTTPException(status_code=503, detail="Install the AI Assistant dependencies for speech output.")
        try:
            from assistant.tts_engine import clean_for_tts, synthesize_speech_bytes

            text = clean_for_tts(request.text)
            audio = await run_in_threadpool(synthesize_speech_bytes, text, None)
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            logger.exception("Assistant speech synthesis failed")
            raise HTTPException(status_code=502, detail="Speech synthesis failed.") from exc
        return Response(content=audio, media_type="audio/wav")

    @application.post(
        "/api/assistant/speak/chunks",
        response_model=AssistantSpeechChunksResponse,
    )
    def assistant_speech_chunks(request: AssistantSpeechRequest) -> dict[str, list[str]]:
        try:
            from assistant.tts_engine import clean_for_tts, split_for_streaming, truncate_for_speech

            text = truncate_for_speech(clean_for_tts(request.text))
            if not text:
                raise HTTPException(status_code=422, detail="Speech text is empty after cleaning.")
            return {"chunks": split_for_streaming(text)}
        except HTTPException:
            raise
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            logger.exception("Could not split assistant speech into chunks")
            raise HTTPException(status_code=503, detail="Speech chunking is unavailable.") from exc

    @application.get("/api/quality/health", response_model=QualityHealthResponse)
    def quality_health() -> dict[str, Any]:
        ready, message = model_readiness()
        path = checkpoint_path()
        return {
            "status": "ready" if ready else "unavailable",
            "model_available": ready,
            "max_image_bytes": MAX_INSPECTION_IMAGE_BYTES,
            "checkpoint": path.name,
            "message": message,
        }

    @application.post("/api/inspect", response_model=InspectionResponse)
    async def inspect(image: UploadFile = File(...)) -> dict[str, Any]:
        contents = await image.read(MAX_INSPECTION_IMAGE_BYTES + 1)
        if len(contents) > MAX_INSPECTION_IMAGE_BYTES:
            limit_mb = MAX_INSPECTION_IMAGE_BYTES // (1024 * 1024)
            raise HTTPException(status_code=413, detail=f"Image exceeds the {limit_mb} MB upload limit.")
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
