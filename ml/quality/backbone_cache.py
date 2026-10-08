"""Cache ImageNet backbone weights locally for PatchCore training."""

from __future__ import annotations

import urllib.request
from pathlib import Path

WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"
BACKBONE_URLS: dict[str, tuple[str, str]] = {
    "wide_resnet50_2": (
        "https://github.com/rwightman/pytorch-image-models/releases/"
        "download/v0.1-weights/wide_resnet50_racm-8234f177.pth",
        "wide_resnet50_racm-8234f177.pth",
    ),
}


def _ensure_local_weights(backbone: str) -> Path | None:
    source = BACKBONE_URLS.get(backbone)
    if source is None:
        return None
    url, filename = source
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    destination = WEIGHTS_DIR / filename
    if destination.is_file():
        return destination
    print(f"[quality] Downloading {backbone} weights to {destination} ...")
    try:
        urllib.request.urlretrieve(url, destination)
    except OSError as exc:
        print(f"[quality] Could not cache backbone weights: {exc}")
        return None
    return destination


def patch_timm_for_local_weights() -> None:
    import timm

    original_create_model = timm.create_model

    def create_model(model_name, *args, **kwargs):
        if kwargs.get("pretrained") and "pretrained_cfg_overlay" not in kwargs:
            local_path = _ensure_local_weights(model_name)
            if local_path is not None:
                kwargs.pop("pretrained_cfg", None)
                kwargs["pretrained_cfg_overlay"] = {"file": str(local_path)}
        return original_create_model(model_name, *args, **kwargs)

    timm.create_model = create_model
