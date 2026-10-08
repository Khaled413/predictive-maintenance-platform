"""Run a PatchCore checkpoint on one image and save its anomaly heatmap."""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

from backbone_cache import patch_timm_for_local_weights

patch_timm_for_local_weights()

from anomalib.engine import Engine  # noqa: E402
from anomalib.models import Patchcore  # noqa: E402


def find_latest_checkpoint(results_dir: str = "ml/quality/results") -> Path:
    candidates = sorted(
        Path(results_dir).rglob("*.ckpt"), key=lambda item: item.stat().st_mtime
    )
    if not candidates:
        raise SystemExit(
            f"No PatchCore checkpoint found under {results_dir}/; train a model or pass --ckpt."
        )
    return candidates[-1]


def save_heatmap(
    image_path: Path,
    anomaly_map: np.ndarray,
    pred_score: float,
    pred_label: str,
    output_path: Path,
) -> None:
    image = Image.open(image_path).convert("RGB")
    values = anomaly_map.squeeze()
    values = (values - values.min()) / (values.max() - values.min() + 1e-8)
    figure, axes = plt.subplots(1, 2, figsize=(8, 4))
    axes[0].imshow(image)
    axes[0].set_title("Input")
    axes[0].axis("off")
    axes[1].imshow(image)
    axes[1].imshow(values, cmap="jet", alpha=0.5)
    axes[1].set_title(f"{pred_label} (score={pred_score:.3f})")
    axes[1].axis("off")
    figure.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(output_path, dpi=150)
    plt.close(figure)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--ckpt")
    parser.add_argument("--backbone", default="wide_resnet50_2")
    parser.add_argument("--layers", nargs="+", default=["layer2", "layer3"])
    parser.add_argument("--out-dir", default="results/inference")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.is_file():
        raise SystemExit(f"Image not found: {image_path}")
    checkpoint = Path(args.ckpt) if args.ckpt else find_latest_checkpoint()
    model = Patchcore(backbone=args.backbone, layers=args.layers, pre_trained=False)
    predictions = Engine().predict(
        model=model,
        data_path=str(image_path),
        ckpt_path=str(checkpoint),
    )
    if not predictions:
        raise SystemExit("PatchCore returned no prediction.")
    result = predictions[0]
    score = float(result.pred_score[0])
    label = "ANOMALOUS" if bool(result.pred_label[0]) else "NORMAL"
    output_path = Path(args.out_dir) / f"{image_path.stem}_result.png"
    save_heatmap(
        image_path,
        result.anomaly_map[0].detach().cpu().numpy(),
        score,
        label,
        output_path,
    )
    print(f"Image: {image_path}")
    print(f"Result: {label} (score={score:.4f})")
    print(f"Heatmap saved to: {output_path}")


if __name__ == "__main__":
    main()
