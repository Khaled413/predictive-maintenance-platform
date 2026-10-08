"""Train PatchCore from normal images, optionally evaluating known defects."""

from __future__ import annotations

import argparse

from backbone_cache import patch_timm_for_local_weights

patch_timm_for_local_weights()

from anomalib.data import Folder  # noqa: E402
from anomalib.engine import Engine  # noqa: E402
from anomalib.models import Patchcore  # noqa: E402
from torchvision.transforms import v2  # noqa: E402


def build_lighting_augmentation() -> v2.Transform:
    return v2.ColorJitter(brightness=0.2, contrast=0.2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normal-dir", required=True)
    parser.add_argument("--abnormal-dir")
    parser.add_argument("--mask-dir")
    parser.add_argument("--normal-test-dir")
    parser.add_argument("--category", default="cubii")
    parser.add_argument("--backbone", default="wide_resnet50_2")
    parser.add_argument("--layers", nargs="+", default=["layer2", "layer3"])
    parser.add_argument("--coreset-sampling-ratio", type=float, default=0.1)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--augment", action="store_true")
    args = parser.parse_args()

    datamodule = Folder(
        name=args.category,
        normal_dir=args.normal_dir,
        abnormal_dir=args.abnormal_dir,
        mask_dir=args.mask_dir,
        normal_test_dir=args.normal_test_dir,
        train_batch_size=args.batch_size,
        eval_batch_size=args.batch_size,
        num_workers=args.num_workers,
        train_augmentations=build_lighting_augmentation() if args.augment else None,
    )
    model = Patchcore(
        backbone=args.backbone,
        layers=args.layers,
        pre_trained=True,
        coreset_sampling_ratio=args.coreset_sampling_ratio,
    )
    engine = Engine(default_root_dir="ml/quality/results")
    print(f"Training PatchCore on normal images in {args.normal_dir}")
    test_results = engine.train(model=model, datamodule=datamodule)
    for result in test_results:
        print("\n=== Test results ===")
        for key, value in result.items():
            formatted = f"{value:.4f}" if isinstance(value, float) else str(value)
            print(f"{key}: {formatted}")
    print(
        f"\nCheckpoint saved to: {engine.trainer.checkpoint_callback.best_model_path}"
    )


if __name__ == "__main__":
    main()
