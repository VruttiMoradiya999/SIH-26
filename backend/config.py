"""
config.py — Shared constants, device picker, and class mappings.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
HF_REPO_ID = "dronefreak/visdrone-yolov11s"
HF_FILENAME = "best.pt"

# ---------------------------------------------------------------------------
# Tracking defaults
# ---------------------------------------------------------------------------
SLICE_WH = (1024, 1024)
OVERLAP_RATIO = 0.2
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.5
STRIDE_DEFAULT = 5
ANNOTATE_SECONDS_DEFAULT = 30.0

# ---------------------------------------------------------------------------
# VisDrone class map
# ---------------------------------------------------------------------------
VISDRONE_CLASSES = {
    0: "pedestrian",
    1: "people",
    2: "bicycle",
    3: "car",
    4: "van",
    5: "truck",
    6: "tricycle",
    7: "awning-tricycle",
    8: "bus",
    9: "motor",
}

CLASS_GROUP = {
    "pedestrian": "pedestrian",
    "people": "pedestrian",
    "bicycle": "cyclist",
    "car": "car",
    "van": "LGV",
    "truck": "HGV",
    "bus": "bus",
    "motor": "motorcycle",
    "tricycle": "three-wheeler",
    "awning-tricycle": "three-wheeler",
}

# Friendly display labels
CLASS_LABELS = {
    "car": "Car",
    "motorcycle": "Motorcycle",
    "pedestrian": "Pedestrian",
    "cyclist": "Cyclist",
    "bus": "Bus",
    "LGV": "LGV / Van",
    "HGV": "Truck / HGV",
    "three-wheeler": "Three-Wheeler",
}

# Colors per class group (hex)
CLASS_COLORS = {
    "car": "#38bdf8",
    "motorcycle": "#f43f5e",
    "pedestrian": "#94a3b8",
    "cyclist": "#10b981",
    "bus": "#a855f7",
    "LGV": "#06b6d4",
    "HGV": "#f97316",
    "three-wheeler": "#eab308",
}

# Upload / output directories
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "data" / "uploads"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "output"


def pick_device(forced: str = "auto") -> tuple[str, bool]:
    """Resolve torch device. Returns (device_str, use_fp16).
    fp16 is only safe on CUDA; MPS/CPU use fp32."""
    has_mps = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()

    if forced == "cuda":
        if not torch.cuda.is_available():
            sys.exit("--device cuda requested but no CUDA GPU is available")
        return "cuda", True
    if forced == "mps":
        if not has_mps:
            sys.exit("--device mps requested but MPS is not available")
        return "mps", False
    if forced == "cpu":
        return "cpu", False
    if forced != "auto":
        sys.exit(f"unknown device value: {forced!r}")

    # auto: cuda -> mps -> cpu
    if torch.cuda.is_available():
        return "cuda", True
    if has_mps:
        return "mps", False
    return "cpu", False
