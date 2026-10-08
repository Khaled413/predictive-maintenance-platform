"""Flatten GoodsAD defect folders into matching PatchCore evaluation folders."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

IMAGE_SUFFIXES = {".bmp", ".jpeg", ".jpg", ".png", ".webp"}
DEFAULT_DEFECT_TYPES = ("deformation", "opened", "surface_damage")


def prepare_dataset(
    dataset_root: Path,
    output_dir: Path,
    defect_types: tuple[str, ...] = DEFAULT_DEFECT_TYPES,
) -> tuple[int, int]:
    abnormal_dir = output_dir / "abnormal"
    masks_dir = output_dir / "masks"
    if any(
        folder.exists() and any(folder.iterdir())
        for folder in (abnormal_dir, masks_dir)
    ):
        raise FileExistsError(
            f"Output contains files already; choose a new destination: {output_dir}"
        )

    image_pairs: list[tuple[str, Path, Path]] = []
    for defect_type in defect_types:
        image_dir = dataset_root / "test" / defect_type
        mask_dir = dataset_root / "ground_truth" / defect_type
        if not image_dir.is_dir() or not mask_dir.is_dir():
            raise FileNotFoundError(
                f"Expected test and ground-truth folders for {defect_type}: "
                f"{image_dir} and {mask_dir}"
            )

        masks_by_stem: dict[str, Path] = {}
        for mask in mask_dir.iterdir():
            if mask.is_file():
                key = mask.stem.casefold()
                if key in masks_by_stem:
                    raise ValueError(f"Multiple masks share the filename stem: {key}")
                masks_by_stem[key] = mask

        images = sorted(
            file
            for file in image_dir.iterdir()
            if file.is_file() and file.suffix.lower() in IMAGE_SUFFIXES
        )
        if not images:
            raise ValueError(f"No supported defect images found in {image_dir}")
        image_stems = [image.stem.casefold() for image in images]
        if len(image_stems) != len(set(image_stems)):
            raise ValueError(
                f"Multiple defect images share a filename stem in {image_dir}"
            )
        used_mask_stems: set[str] = set()
        for image in images:
            image_stem = image.stem.casefold()
            mask = masks_by_stem.get(image_stem)
            if mask is None:
                raise FileNotFoundError(
                    f"No matching ground-truth mask found for {image}"
                )
            used_mask_stems.add(image_stem)
            image_pairs.append((defect_type, image, mask))
        extra_masks = set(masks_by_stem) - used_mask_stems
        if extra_masks:
            raise ValueError(
                f"Ground-truth masks do not have matching images in {mask_dir}: "
                f"{sorted(extra_masks)}"
            )

    abnormal_dir.mkdir(parents=True, exist_ok=True)
    masks_dir.mkdir(parents=True, exist_ok=True)
    for defect_type, image, mask in image_pairs:
        image_name = f"{defect_type}_{image.name}"
        mask_name = f"{Path(image_name).stem}{mask.suffix.lower()}"
        shutil.copy2(image, abnormal_dir / image_name)
        shutil.copy2(mask, masks_dir / mask_name)

    return len(image_pairs), len(image_pairs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    image_count, mask_count = prepare_dataset(args.dataset_root, args.output_dir)
    print(f"Prepared {image_count} defect images and {mask_count} matching masks.")
    print(f"Images: {args.output_dir / 'abnormal'}")
    print(f"Masks: {args.output_dir / 'masks'}")


if __name__ == "__main__":
    main()
