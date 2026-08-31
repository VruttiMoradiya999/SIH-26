"""
analytics.py — High-precision traffic analytics & kinematic statistics.

Computes modal splits, vehicle speed distributions (km/h), track summaries,
and overview telemetry from tracking DataFrames.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import CLASS_GROUP, CLASS_LABELS, CLASS_COLORS

# Default nadir drone scale factor (~0.035 m/px for 4K video at 70m altitude)
DEFAULT_METERS_PER_PIXEL = 0.035


def class_summary(df: pd.DataFrame) -> list[dict]:
    """Per-class unique vehicle tracks and total detection counts."""
    if df.empty:
        return []

    valid = df[df["track_id"] >= 0].copy()
    if "class_group" not in valid.columns:
        valid["class_group"] = valid["class_name"].map(
            lambda c: CLASS_GROUP.get(c, c)
        )

    rows = []
    for group, gdf in valid.groupby("class_group"):
        n_tracks = int(gdf["track_id"].nunique())
        n_detections = int(len(gdf))
        rows.append(
            {
                "class_group": group,
                "label": CLASS_LABELS.get(group, str(group).title()),
                "color": CLASS_COLORS.get(group, "#94a3b8"),
                "tracks": n_tracks,
                "detections": n_detections,
            }
        )
    # Sort by number of unique vehicle tracks
    rows.sort(key=lambda r: r["tracks"], reverse=True)
    return rows


def track_summaries(df: pd.DataFrame, source_fps: float, stride: int) -> list[dict]:
    """Per-track summary with class consensus, duration, speeds (km/h), and status."""
    if df.empty:
        return []

    valid = df[df["track_id"] >= 0].copy()
    if "class_group" not in valid.columns:
        valid["class_group"] = valid["class_name"].map(
            lambda c: CLASS_GROUP.get(c, c)
        )

    rows = []
    for tid, gdf in valid.groupby("track_id"):
        n_frames = len(gdf)
        duration_s = n_frames * stride / source_fps
        cls_name = gdf["class_name"].iloc[0] if len(gdf) else "unknown"
        cls_group = CLASS_GROUP.get(cls_name, cls_name)

        # Displacement in pixels
        cx_vals = gdf["cx"].values
        cy_vals = gdf["cy_foot"].values
        displacement_px = float(
            np.sqrt((cx_vals[-1] - cx_vals[0]) ** 2 + (cy_vals[-1] - cy_vals[0]) ** 2)
        ) if len(cx_vals) > 1 else 0.0

        # Speeds in km/h
        if "speed_kmh" in gdf.columns:
            speeds = gdf["speed_kmh"].dropna().values
            mean_spd = float(np.mean(speeds)) if len(speeds) else 0.0
            max_spd = float(np.max(speeds)) if len(speeds) else 0.0
        else:
            mean_spd = 0.0
            max_spd = 0.0

        # Traffic state status
        if max_spd > 35.0:
            status = "Speeding"
            status_color = "#ef4444"
        elif displacement_px < 15.0 or mean_spd < 2.0:
            status = "Stopped"
            status_color = "#dc2626"
        elif mean_spd < 15.0:
            status = "Slow"
            status_color = "#eab308"
        else:
            status = "Cruising"
            status_color = "#10b981"

        rows.append(
            {
                "track_id": int(tid),
                "class_name": cls_name,
                "class_group": cls_group,
                "label": CLASS_LABELS.get(cls_group, cls_group.title()),
                "color": CLASS_COLORS.get(cls_group, "#94a3b8"),
                "detections": n_frames,
                "duration_s": round(duration_s, 2),
                "mean_conf": round(float(gdf["conf"].mean()), 3),
                "displacement_px": round(displacement_px, 1),
                "mean_speed_kmh": round(mean_spd, 1),
                "max_speed_kmh": round(max_spd, 1),
                "status": status,
                "status_color": status_color,
                "first_seen_s": round(float(gdf["timestamp_s"].min()), 2),
                "last_seen_s": round(float(gdf["timestamp_s"].max()), 2),
            }
        )

    # Sort by number of detections
    rows.sort(key=lambda r: r["detections"], reverse=True)
    return rows


def speed_estimate_px(df: pd.DataFrame, source_fps: float, stride: int) -> list[dict]:
    """Estimate detailed speed metrics (km/h) for moving tracks."""
    if df.empty:
        return []

    valid = df[df["track_id"] >= 0].copy()
    rows = []
    dt = stride / source_fps  # seconds between frames

    for tid, gdf in valid.groupby("track_id"):
        if len(gdf) < 2:
            continue

        if "speed_kmh" in gdf.columns:
            step_speeds = gdf["speed_kmh"].dropna().values
        else:
            gdf = gdf.sort_values("frame_idx")
            cx = gdf["cx"].values
            cy = gdf["cy_foot"].values
            dx = np.diff(cx)
            dy = np.diff(cy)
            step_speeds = (np.sqrt(dx**2 + dy**2) / dt) * DEFAULT_METERS_PER_PIXEL * 3.6

        if len(step_speeds) > 0:
            rows.append(
                {
                    "track_id": int(tid),
                    "mean_speed_kmh": round(float(np.mean(step_speeds)), 1),
                    "max_speed_kmh": round(float(np.max(step_speeds)), 1),
                    "median_speed_kmh": round(float(np.median(step_speeds)), 1),
                }
            )

    rows.sort(key=lambda r: r["mean_speed_kmh"], reverse=True)
    return rows


def overview_stats(
    df: pd.DataFrame, source_fps: float, stride: int, duration_s: float
) -> dict:
    """High-level overview traffic metrics."""
    if df.empty:
        return {
            "total_detections": 0,
            "unique_tracks": 0,
            "classes_detected": 0,
            "duration_s": duration_s,
            "avg_objects_per_frame": 0.0,
            "mean_track_duration_s": 0.0,
            "mean_speed_kmh": 0.0,
        }

    valid = df[df["track_id"] >= 0]
    n_tracks = valid["track_id"].nunique()
    track_lens = valid.groupby("track_id").size()
    mean_len_frames = float(track_lens.mean()) if n_tracks else 0.0
    mean_duration = mean_len_frames * stride / source_fps

    per_frame = valid.groupby("frame_idx").size()
    avg_per_frame = float(per_frame.mean()) if len(per_frame) else 0.0

    mean_speed = (
        float(valid["speed_kmh"].mean())
        if "speed_kmh" in valid.columns and not valid["speed_kmh"].empty
        else 0.0
    )

    return {
        "total_detections": len(df),
        "unique_tracks": n_tracks,
        "classes_detected": valid["class_group"].nunique() if "class_group" in valid.columns else valid["class_name"].nunique(),
        "duration_s": round(duration_s, 2),
        "avg_objects_per_frame": round(avg_per_frame, 1),
        "mean_track_duration_s": round(mean_duration, 2),
        "mean_speed_kmh": round(mean_speed, 1),
    }
