from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "quality"))

from prepare_goodsad import prepare_dataset


class GoodsADPreparationTests(unittest.TestCase):
    def build_dataset(self, root: Path) -> Path:
        dataset = root / "food_box"
        for defect in ("deformation", "opened", "surface_damage"):
            image_dir = dataset / "test" / defect
            mask_dir = dataset / "ground_truth" / defect
            image_dir.mkdir(parents=True)
            mask_dir.mkdir(parents=True)
            (image_dir / "item.jpg").write_bytes(b"image")
            (mask_dir / "item.png").write_bytes(b"mask")
        return dataset

    def test_pairs_each_defect_image_with_its_mask_and_prefixes_names(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dataset = self.build_dataset(root)
            output = root / "merged"
            self.assertEqual(prepare_dataset(dataset, output), (3, 3))
            for defect in ("deformation", "opened", "surface_damage"):
                self.assertEqual(
                    (output / "abnormal" / f"{defect}_item.jpg").read_bytes(),
                    b"image",
                )
                self.assertEqual(
                    (output / "masks" / f"{defect}_item.png").read_bytes(),
                    b"mask",
                )

    def test_missing_mask_fails_before_creating_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dataset = self.build_dataset(root)
            (dataset / "ground_truth" / "opened" / "item.png").unlink()
            output = root / "merged"
            with self.assertRaises(FileNotFoundError):
                prepare_dataset(dataset, output)
            self.assertFalse(output.exists())

    def test_refuses_to_overwrite_existing_prepared_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dataset = self.build_dataset(root)
            output = root / "merged"
            existing_images = output / "abnormal"
            existing_images.mkdir(parents=True)
            (existing_images / "keep.txt").write_text("preserve", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                prepare_dataset(dataset, output)
            self.assertEqual(
                (existing_images / "keep.txt").read_text(encoding="utf-8"),
                "preserve",
            )


if __name__ == "__main__":
    unittest.main()
