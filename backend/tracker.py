"""
tracker.py — Robust detection, tracking, and speed estimation pipeline.

Uses VisDrone-tuned YOLO11s with supervision InferenceSlicer and ByteTrack.
Features:
- Online track class voting (eliminates rapid label flickering between car/truck/motor).
- Real-time kinematic speed estimation (km/h) displayed on bounding boxes.
- Post-tracking quality filtering (removes spurious short-lived false detections).
- High-performance parquet export with per-frame speeds and ground coordinates.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Callable

import cv2
import numpy as np
import pandas as pd
import supervision as sv
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

from config import (
    HF_REPO_ID,
    HF_FILENAME,
    SLICE_WH,
    OVERLAP_RATIO,
    CONF_THRESHOLD,
    IOU_THRESHOLD,
    STRIDE_DEFAULT,
    ANNOTATE_SECONDS_DEFAULT,
    CLASS_GROUP,
    CLASS_LABELS,
    CLASS_COLORS,
    pick_device,
)

# Nadir drone ground sampling distance (approx 0.035 m/px for 4K at ~70m altitude)
DEFAULT_METERS_PER_PIXEL = 0.035

# ---------------------------------------------------------------------------
# Model caching
# ---------------------------------------------------------------------------
_model_cache: dict = {}


def get_model() -> YOLO:
    """Load the VisDrone YOLO11s model, downloading from HF Hub if needed."""
    if "model" not in _model_cache:
        weights = hf_hub_download(repo_id=HF_REPO_ID, filename=HF_FILENAME)
        _model_cache["model"] = YOLO(weights)
    return _model_cache["model"]


# ---------------------------------------------------------------------------
# Slicer & Tracker builders
# ---------------------------------------------------------------------------

def build_slicer(model: YOLO, device: str, use_half: bool) -> sv.InferenceSlicer:
    """Build a supervision InferenceSlicer with tiled inference."""

    def callback(image_slice: np.ndarray) -> sv.Detections:
        predict_kwargs = dict(device=device, conf=CONF_THRESHOLD, verbose=False)
        if use_half:
            predict_kwargs["quantize"] = 16
        result = model.predict(image_slice, **predict_kwargs)[0]
        return sv.Detections.from_ultralytics(result)

    base_kwargs = dict(
        callback=callback,
        slice_wh=SLICE_WH,
        overlap_filter=sv.OverlapFilter.NON_MAX_SUPPRESSION,
        iou_threshold=IOU_THRESHOLD,
        thread_workers=1,
    )
    try:
        return sv.InferenceSlicer(
            overlap_wh=(
                int(SLICE_WH[0] * OVERLAP_RATIO),
                int(SLICE_WH[1] * OVERLAP_RATIO),
            ),
            **base_kwargs,
        )
    except TypeError:
        return sv.InferenceSlicer(
            overlap_ratio_wh=(OVERLAP_RATIO, OVERLAP_RATIO),
            **base_kwargs,
        )


def build_tracker(frame_rate: float) -> sv.ByteTrack:
    """Build ByteTrack tracker with high matching threshold to prevent ID switches."""
    try:
        return sv.ByteTrack(
            track_activation_threshold=CONF_THRESHOLD,
            lost_track_buffer=45,
            minimum_matching_threshold=0.85,
            frame_rate=max(frame_rate, 1.0),
        )
    except TypeError:
        return sv.ByteTrack(
            track_thresh=CONF_THRESHOLD,
            track_buffer=45,
            match_thresh=0.85,
            frame_rate=max(frame_rate, 1.0),
        )


# ---------------------------------------------------------------------------
# Tracking Pipeline
# ---------------------------------------------------------------------------

def run_tracking(
    video_path: Path,
    out_dir: Path,
    *,
    stride: int = STRIDE_DEFAULT,
    start_sec: float = 0.0,
    max_seconds: float = 0.0,
    annotate_seconds: float = ANNOTATE_SECONDS_DEFAULT,
    meters_per_pixel: float = DEFAULT_METERS_PER_PIXEL,
    min_track_len: int = 3,
    device_override: str = "auto",
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """
    Run the detect → track → smooth → speed estimate → export pipeline.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = out_dir / "tracks.parquet"
    annotated_path = out_dir / "tracks_annotated.mp4"

    device, use_half = pick_device(device_override)
    model = get_model()
    class_names = model.names

    slicer = build_slicer(model, device, use_half)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    sampled_fps = source_fps / stride
    video_duration_s = total_frames / source_fps

    end_sec = start_sec + max_seconds if max_seconds > 0 else video_duration_s
    end_sec = min(end_sec, video_duration_s)
    window_s = max(end_sec - start_sec, 0.0)
    expected_processed = max(int(window_s * source_fps / stride), 1)

    start_frame = int(round(start_sec * source_fps))
    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    tracker = build_tracker(sampled_fps)
    box_annotator = sv.BoxAnnotator(thickness=2)
    label_annotator = sv.LabelAnnotator(
        text_scale=0.45,
        text_padding=3,
        text_position=sv.Position.TOP_LEFT,
    )

    writer = cv2.VideoWriter(
        str(annotated_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        sampled_fps,
        (width, height),
    )

    # Per-track state dictionaries for stability & speed
    track_class_votes: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    track_history: dict[int, deque] = defaultdict(lambda: deque(maxlen=6))
    track_smoothed_speed: dict[int, float] = {}

    records: list[dict] = []
    frame_idx = start_frame
    processed = 0
    t0 = time.time()

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            timestamp_s = frame_idx / source_fps
            if timestamp_s >= end_sec:
                break

            if frame_idx % stride == 0:
                detections = slicer(frame)
                detections = tracker.update_with_detections(detections)

                labels = []
                frame_speeds = []

                for i in range(len(detections)):
                    x1, y1, x2, y2 = detections.xyxy[i]
                    tid = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1
                    cls_id = int(detections.class_id[i]) if detections.class_id is not None else -1
                    conf = float(detections.confidence[i]) if detections.confidence is not None else float("nan")
                    raw_cname = class_names.get(cls_id, str(cls_id))

                    cx = float((x1 + x2) / 2.0)
                    cy = float(y2)  # bottom-center foot position

                    # 1. Update Online Class Consensus (vote weighted by confidence)
                    if tid >= 0:
                        track_class_votes[tid][raw_cname] += (conf if not np.isnan(conf) else 0.5)
                        consensus_class = max(track_class_votes[tid].items(), key=lambda x: x[1])[0]
                    else:
                        consensus_class = raw_cname

                    consensus_group = CLASS_GROUP.get(consensus_class, consensus_class)
                    display_label = CLASS_LABELS.get(consensus_group, consensus_class.title())

                    # 2. Compute Real-Time Smoothed Speed (km/h)
                    speed_kmh = 0.0
                    if tid >= 0:
                        hist = track_history[tid]
                        hist.append((timestamp_s, cx, cy))

                        if len(hist) >= 2:
                            dt = hist[-1][0] - hist[0][0]
                            if dt > 0.05:
                                dx = hist[-1][1] - hist[0][1]
                                dy = hist[-1][2] - hist[0][2]
                                dist_px = np.sqrt(dx**2 + dy**2)
                                speed_pxs = dist_px / dt
                                raw_speed_kmh = speed_pxs * meters_per_pixel * 3.6

                                # Apply Exponential Moving Average (EMA) smoothing
                                prev_spd = track_smoothed_speed.get(tid, raw_speed_kmh)
                                speed_kmh = 0.6 * raw_speed_kmh + 0.4 * prev_spd
                                if speed_kmh < 2.5:
                                    speed_kmh = 0.0
                                track_smoothed_speed[tid] = speed_kmh

                    frame_speeds.append(speed_kmh)

                    # 3. Label with Track ID, Stabilized Class, and Speed
                    if speed_kmh > 0:
                        speed_str = f"{int(round(speed_kmh))} km/h"
                    else:
                        speed_str = "Stopped"

                    labels.append(f"#{tid} {display_label} • {speed_str}")

                    records.append(
                        {
                            "frame_idx": frame_idx,
                            "timestamp_s": round(timestamp_s, 3),
                            "track_id": tid,
                            "class_id": cls_id,
                            "raw_class_name": raw_cname,
                            "class_name": consensus_class,
                            "class_group": consensus_group,
                            "conf": round(conf, 3),
                            "speed_kmh": round(speed_kmh, 1),
                            "x1": round(float(x1), 1),
                            "y1": round(float(y1), 1),
                            "x2": round(float(x2), 1),
                            "y2": round(float(y2), 1),
                            "cx": round(cx, 1),
                            "cy_foot": round(cy, 1),
                        }
                    )

                # Write annotated frame
                if (timestamp_s - start_sec) <= annotate_seconds:
                    annotated = box_annotator.annotate(
                        scene=frame.copy(), detections=detections
                    )
                    annotated = label_annotator.annotate(
                        scene=annotated, detections=detections, labels=labels
                    )
                    writer.write(annotated)

                processed += 1

                # Send progress updates
                if on_progress and (processed % 5 == 0 or processed == expected_processed):
                    elapsed = time.time() - t0
                    fps = processed / elapsed if elapsed > 0 else 0.0
                    remaining = max(expected_processed - processed, 0)
                    eta = remaining / fps if fps > 0 else 0.0
                    on_progress(
                        {
                            "processed": processed,
                            "total": expected_processed,
                            "fps": round(fps, 2),
                            "eta_s": round(eta, 1),
                            "timestamp_s": round(timestamp_s, 1),
                        }
                    )

            frame_idx += 1
    finally:
        cap.release()
        writer.release()

    # Build DataFrame
    df = pd.DataFrame.from_records(records)
    if df.empty:
        df = pd.DataFrame(
            columns=[
                "frame_idx", "timestamp_s", "track_id", "class_id", "raw_class_name",
                "class_name", "class_group", "conf", "speed_kmh", "x1", "y1", "x2", "y2", "cx", "cy_foot"
            ]
        )

    # 4. Post-Tracking Quality Control: Enforce global track consensus & prune transient false positives
    if not df.empty and "track_id" in df.columns:
        # Filter out negative track_ids
        valid = df[df["track_id"] >= 0].copy()

        # Prune tracks that appeared for fewer than min_track_len frames
        track_counts = valid.groupby("track_id").size()
        long_tracks = track_counts[track_counts >= min_track_len].index
        df = df[df["track_id"].isin(long_tracks)].copy()

        if not df.empty:
            # Map each track permanently to its overall winner class (highest cumulative conf)
            track_winner = (
                df.groupby(["track_id", "class_name"])["conf"]
                .sum()
                .reset_index()
                .sort_values("conf", ascending=False)
                .drop_duplicates("track_id")
                .set_index("track_id")["class_name"]
            )
            df["class_name"] = df["track_id"].map(track_winner)
            df["class_group"] = df["class_name"].map(lambda c: CLASS_GROUP.get(c, c))

    df.to_parquet(parquet_path, index=False)

    # Summary Statistics
    valid_df = df[df["track_id"] >= 0] if not df.empty else pd.DataFrame()
    n_tracks = int(valid_df["track_id"].nunique()) if not valid_df.empty else 0
    track_lens = valid_df.groupby("track_id").size() if n_tracks else pd.Series(dtype=float)
    mean_len_frames = float(track_lens.mean()) if n_tracks else 0.0
    mean_len_seconds = mean_len_frames * stride / source_fps if n_tracks else 0.0

    class_breakdown = (
        valid_df.groupby("class_group")["track_id"]
        .nunique()
        .sort_values(ascending=False)
        .to_dict()
        if n_tracks
        else {}
    )

    return {
        "parquet_path": str(parquet_path),
        "video_path": str(annotated_path),
        "total_detections": len(df),
        "unique_tracks": n_tracks,
        "class_breakdown": class_breakdown,
        "duration_s": round(window_s, 2),
        "mean_track_length_s": round(mean_len_seconds, 2),
        "source_resolution": f"{width}x{height}",
        "source_fps": round(source_fps, 2),
        "sampled_fps": round(sampled_fps, 2),
        "device": device,
        "fp16": use_half,
    }
