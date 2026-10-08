from __future__ import annotations

import base64
import importlib.util
import io
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


DEFAULT_CHECKPOINT = (
    Path(__file__).resolve().parents[1]
    / "quality"
    / "models"
    / "food_box_patchcore.ckpt"
)
_inspector: PatchCoreInspector | None = None
_inspector_lock = threading.Lock()


class QualityModelUnavailable(RuntimeError):
    pass


def checkpoint_path() -> Path:
    configured = os.getenv("QUALITY_MODEL_CHECKPOINT")
    return Path(configured) if configured else DEFAULT_CHECKPOINT


def model_readiness() -> tuple[bool, str | None]:
    path = checkpoint_path()
    if not path.is_file():
        return False, f"PatchCore checkpoint is missing: {path}"
    if importlib.util.find_spec("anomalib") is None:
        return (
            False,
            "Quality inspection dependencies are missing; install ml/quality/requirements.txt.",
        )
    return True, None


class PatchCoreInspector:
    def __init__(self, checkpoint: Path):
        if not checkpoint.is_file():
            raise QualityModelUnavailable(
                f"PatchCore checkpoint is missing: {checkpoint}"
            )
        if importlib.util.find_spec("anomalib") is None:
            raise QualityModelUnavailable(
                "Quality inspection dependencies are missing; install ml/quality/requirements.txt."
            )

        from anomalib.engine import Engine
        from anomalib.models import Patchcore

        self.checkpoint = checkpoint
        self.model = Patchcore(
            backbone=os.getenv("QUALITY_MODEL_BACKBONE", "wide_resnet50_2"),
            layers=os.getenv("QUALITY_MODEL_LAYERS", "layer2,layer3").split(","),
            pre_trained=False,
            visualizer=False,
        )
        self.engine = Engine()
        self._predict_lock = threading.Lock()

    def inspect(self, image_bytes: bytes, image_format: str) -> dict[str, Any]:
        suffix = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}[image_format]
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as image_file:
                image_file.write(image_bytes)
                temporary_path = Path(image_file.name)

            with self._predict_lock:
                predictions = self.engine.predict(
                    model=self.model,
                    data_path=str(temporary_path),
                    ckpt_path=str(self.checkpoint),
                )
            if not predictions:
                raise RuntimeError("PatchCore returned no inspection result.")

            prediction = predictions[0]
            score = float(prediction.pred_score[0])
            if not np.isfinite(score) or score < 0:
                raise RuntimeError("PatchCore returned an invalid anomaly score.")
            label = "ANOMALOUS" if bool(prediction.pred_label[0]) else "NORMAL"
            anomaly_map = prediction.anomaly_map[0].detach().cpu().numpy()
            heatmap = _encode_heatmap(image_bytes, anomaly_map)
            return {
                "label": label,
                "score": score,
                "heatmap": heatmap,
                "prediction_source": "PatchCore",
                "model_status": "ready",
            }
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)


def get_quality_inspector() -> PatchCoreInspector:
    global _inspector
    if _inspector is None:
        with _inspector_lock:
            if _inspector is None:
                _inspector = PatchCoreInspector(checkpoint_path())
    return _inspector


def _encode_heatmap(image_bytes: bytes, anomaly_map: np.ndarray) -> str:
    values = np.asarray(anomaly_map, dtype=np.float32).squeeze()
    if values.ndim != 2 or not np.isfinite(values).all():
        raise RuntimeError("PatchCore returned an invalid anomaly heatmap.")

    minimum = float(values.min())
    maximum = float(values.max())
    normalized = (
        (values - minimum) / (maximum - minimum)
        if maximum > minimum
        else np.zeros_like(values)
    )
    red = np.clip(1.5 - np.abs(4 * normalized - 3), 0, 1)
    green = np.clip(1.5 - np.abs(4 * normalized - 2), 0, 1)
    blue = np.clip(1.5 - np.abs(4 * normalized - 1), 0, 1)
    colored = (np.stack((red, green, blue), axis=-1) * 255).astype(np.uint8)

    with Image.open(io.BytesIO(image_bytes)) as original:
        original = original.convert("RGB")
        output_size = original.size
        longest_side = max(output_size)
        if longest_side > 1536:
            scale = 1536 / longest_side
            output_size = (
                max(1, round(output_size[0] * scale)),
                max(1, round(output_size[1] * scale)),
            )
            original = original.resize(output_size, Image.Resampling.LANCZOS)
        heat = Image.fromarray(colored).resize(output_size, Image.Resampling.BILINEAR)
        overlay = Image.blend(original, heat, alpha=0.45)
        with io.BytesIO() as output:
            overlay.save(output, format="PNG")
            encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
