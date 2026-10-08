from __future__ import annotations

import asyncio
import base64
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
import numpy as np
from PIL import Image
from starlette.datastructures import UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import create_app
from app.quality_inference import (
    QualityModelUnavailable,
    _encode_heatmap,
    model_readiness,
)
from app.schemas import InspectionResponse, QualityHealthResponse


def png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (8, 6), color=(80, 120, 160)).save(output, format="PNG")
    return output.getvalue()


class QualityModelReadinessTests(unittest.TestCase):
    def test_reports_missing_checkpoint_without_claiming_model_ready(self):
        with patch(
            "app.quality_inference.checkpoint_path",
            return_value=Path("missing-patchcore.ckpt"),
        ):
            ready, message = model_readiness()
        self.assertFalse(ready)
        self.assertIn("checkpoint is missing", message)

    def test_heatmap_is_a_png_data_url_with_original_dimensions(self):
        encoded = _encode_heatmap(png_bytes(), np.array([[0.0, 1.0], [0.25, 0.75]]))
        self.assertTrue(encoded.startswith("data:image/png;base64,"))
        heatmap_bytes = base64.b64decode(encoded.split(",", 1)[1])
        with Image.open(io.BytesIO(heatmap_bytes)) as heatmap:
            self.assertEqual(heatmap.size, (8, 6))


class QualityApiTests(unittest.TestCase):
    def setUp(self):
        self.application = create_app(Path(__file__).resolve().parents[1] / "models")
        self.inspect_route = next(
            route
            for route in self.application.routes
            if getattr(route, "path", None) == "/api/inspect"
        )
        self.health_route = next(
            route
            for route in self.application.routes
            if getattr(route, "path", None) == "/api/quality/health"
        )

    def test_quality_health_reports_checkpoint_unavailability(self):
        with patch(
            "app.api.model_readiness", return_value=(False, "checkpoint missing")
        ), patch("app.api.checkpoint_path", return_value=Path("missing.ckpt")):
            result = self.health_route.endpoint()
        QualityHealthResponse.model_validate(result)
        self.assertEqual(result["status"], "unavailable")
        self.assertFalse(result["model_available"])

    def test_inspection_calls_patchcore_and_returns_real_result_contract(self):
        expected = {
            "label": "ANOMALOUS",
            "score": 0.8234,
            "heatmap": "data:image/png;base64,aGVhdG1hcA==",
            "prediction_source": "PatchCore",
            "model_status": "ready",
        }

        class FakeInspector:
            def inspect(self, image_bytes: bytes, image_format: str):
                self.image_bytes = image_bytes
                self.image_format = image_format
                return expected

        inspector = FakeInspector()
        upload = UploadFile(filename="sample.png", file=io.BytesIO(png_bytes()))
        with patch("app.api.get_quality_inspector", return_value=inspector):
            result = asyncio.run(self.inspect_route.endpoint(upload))
        InspectionResponse.model_validate(result)
        self.assertEqual(result["label"], "ANOMALOUS")
        self.assertEqual(result["score"], 0.8234)
        self.assertEqual(inspector.image_format, "PNG")
        self.assertTrue(inspector.image_bytes.startswith(b"\x89PNG"))

    def test_missing_quality_model_returns_explicit_service_unavailable(self):
        upload = UploadFile(filename="sample.png", file=io.BytesIO(png_bytes()))
        with patch(
            "app.api.get_quality_inspector",
            side_effect=QualityModelUnavailable("PatchCore checkpoint is missing."),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(self.inspect_route.endpoint(upload))
        self.assertEqual(raised.exception.status_code, 503)

    def test_rejects_oversized_image_before_model_call(self):
        upload = UploadFile(
            filename="large.png", file=io.BytesIO(b"x" * (10 * 1024 * 1024 + 1))
        )
        with patch("app.api.get_quality_inspector") as get_inspector:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(self.inspect_route.endpoint(upload))
        self.assertEqual(raised.exception.status_code, 413)
        get_inspector.assert_not_called()

    def test_rejects_images_with_excessive_pixel_count(self):
        image = io.BytesIO()
        Image.new("RGB", (4500, 4500), color=(0, 0, 0)).save(image, format="PNG")
        upload = UploadFile(
            filename="huge-dimensions.png", file=io.BytesIO(image.getvalue())
        )
        with patch("app.api.get_quality_inspector") as get_inspector:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(self.inspect_route.endpoint(upload))
        self.assertEqual(raised.exception.status_code, 413)
        get_inspector.assert_not_called()


if __name__ == "__main__":
    unittest.main()
