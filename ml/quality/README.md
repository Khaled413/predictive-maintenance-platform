# PatchCore quality inspection

This optional module connects the former `Quality Inspection` prototype to
`POST /api/inspect`. It uses the PatchCore model trained by the prototype and
returns its normal/anomalous label, raw anomaly score, and heatmap overlay.
PatchCore does not identify defect names.

## Model requirements

The trained PatchCore checkpoint is kept locally at the default path below and
is excluded from Git because it is a large binary model. GoodsAD training
images are not included. The checkpoint came from the augmented GoodsAD
training notebook.

The prototype reports a GoodsAD `food_box` baseline of image AUROC 0.8027,
image F1 0.8000, pixel AUROC 0.9746, and pixel F1 0.3482. These benchmark
numbers have not been independently reproduced in this project. The dataset
contains retail packaging images, not images from the target production line,
so the metrics are not evidence of factory accuracy. A coreset sampling ratio
of 0.25 performed worse and took longer in the prototype; adding `layer1`
caused an out-of-memory failure. The integrated training script retains the
tested `layer2`/`layer3` and 0.1 defaults.

The default checkpoint path is:

```text
ml/quality/models/food_box_patchcore.ckpt
```

Alternatively, set `QUALITY_MODEL_CHECKPOINT` to the full path of the
checkpoint. Keep model files out of source control.

## Install and run

In the same Python environment used to run the ML API:

```powershell
npm run setup:quality
python -m pip check
$env:QUALITY_MODEL_CHECKPOINT = "E:\models\food_box_patchcore.ckpt"
npm run dev
```

The optional runtime installs PyTorch's CPU build, so PatchCore can run without
a CUDA GPU. The former prototype pinned an unsupported `anomalib[core]` extra;
the integrated requirements use the published `cpu` extra instead. The
quality requirements constrain shared API dependencies to the versions in
`ml/requirements.txt` so installing PatchCore does not upgrade dependencies
used by the other prediction models.

If the checkpoint is not available, download the GoodsAD `food_box` category
into `ml/quality/data/GoodsAD/food_box`. The dataset should contain
`train/good`, `test/good`, one `test/<defect-type>` folder, and a matching
`ground_truth/<defect-type>` mask folder for each defect type. Then prepare
and train the model:

```powershell
python ml/quality/prepare_goodsad.py `
  --dataset-root "ml\quality\data\GoodsAD\food_box" `
  --output-dir "ml\quality\data\GoodsAD_merged\food_box"
python ml/quality/train_folder.py `
  --normal-dir "ml\quality\data\GoodsAD\food_box\train\good" `
  --abnormal-dir "ml\quality\data\GoodsAD_merged\food_box\abnormal" `
  --mask-dir "ml\quality\data\GoodsAD_merged\food_box\masks" `
  --normal-test-dir "ml\quality\data\GoodsAD\food_box\test\good" `
  --category food_box
```

Training checkpoints and outputs are kept under `ml/quality/results/`. To use
a newly trained checkpoint for API inference, copy the compatible `.ckpt` to
the default checkpoint path above or set `QUALITY_MODEL_CHECKPOINT` to its
full path.

That benchmark dataset is a stand-in, not production-line imagery. Before
operational use, evaluate and calibrate PatchCore's decision threshold on
representative production images.

The API status endpoint is `GET /api/quality/health`. Image requests accept
JPEG, PNG, or WEBP files up to 10 MB. The endpoint returns HTTP 503 when the
checkpoint or optional dependency is missing; it never falls back to a
synthetic result. Uploaded images are processed temporarily and are not retained
in the prediction results directory.

The standard Vercel service installs only `ml/requirements.txt`. To enable
PatchCore in production, install the optional quality requirements into that
service and securely provision the checkpoint at the default path (or set
`QUALITY_MODEL_CHECKPOINT`). Until both are provisioned, quality inspection
reports unavailable; this does not affect failure prediction.

## Model configuration

- `QUALITY_MODEL_BACKBONE`: default `wide_resnet50_2`
- `QUALITY_MODEL_LAYERS`: comma-separated feature layers; default `layer2,layer3`
- `QUALITY_MODEL_CHECKPOINT`: checkpoint file path

The training notebook is kept in `notebooks/food_box_augmented_training.ipynb`.
The integrated training, data preparation, and single-image inference scripts
are `train_folder.py`, `prepare_goodsad.py`, and `infer.py`. Benchmark data and
generated checkpoints stay outside source control.
