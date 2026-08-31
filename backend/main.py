"""
main.py — FastAPI backend for the FlytBase Drone Traffic Analytics app.

Endpoints:
    POST /api/upload          Upload a video file → returns job_id
    GET  /api/status/{id}     SSE stream of tracking progress
    GET  /api/results/{id}    Tracking results (JSON)
    GET  /api/video/{id}      Serve annotated video
    GET  /api/download/{id}   Download tracks.parquet
"""

from __future__ import annotations

import asyncio
import json
import shutil
import uuid
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from config import UPLOAD_DIR, OUTPUT_DIR
from tracker import run_tracking
from analytics import class_summary, track_summaries, speed_estimate_px, overview_stats

app = FastAPI(title="FlytBase Drone Traffic Analytics")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs: dict[str, dict] = {}


@app.post("/api/upload")
async def upload_video(video: UploadFile = File(...)):
    """Accept a video upload and start a tracking job."""
    job_id = str(uuid.uuid4())[:8]

    # Save uploaded file
    upload_dir = UPLOAD_DIR / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    video_path = upload_dir / video.filename

    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    out_dir = OUTPUT_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    jobs[job_id] = {
        "status": "queued",
        "video_path": str(video_path),
        "out_dir": str(out_dir),
        "filename": video.filename,
        "progress": [],
        "result": None,
        "error": None,
    }

    # Run tracking in a background thread
    asyncio.get_event_loop().run_in_executor(None, _run_job, job_id)

    return {"job_id": job_id, "filename": video.filename}


def _run_job(job_id: str):
    """Execute the tracking pipeline (runs in a thread)."""
    job = jobs[job_id]
    job["status"] = "running"

    def on_progress(p: dict):
        job["progress"].append(p)

    try:
        result = run_tracking(
            video_path=Path(job["video_path"]),
            out_dir=Path(job["out_dir"]),
            stride=5,
            max_seconds=0,  # process full video
            annotate_seconds=9999,  # annotate all
            on_progress=on_progress,
        )
        job["result"] = result
        job["status"] = "done"
    except Exception as e:
        job["error"] = str(e)
        job["status"] = "error"


@app.get("/api/status/{job_id}")
async def job_status_sse(job_id: str):
    """Server-Sent Events stream for real-time progress."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_stream():
        seen = 0
        while True:
            job = jobs[job_id]
            # Send any new progress events
            while seen < len(job["progress"]):
                data = json.dumps(job["progress"][seen])
                yield f"event: progress\ndata: {data}\n\n"
                seen += 1

            if job["status"] == "done":
                yield f"event: done\ndata: {json.dumps(job['result'])}\n\n"
                break
            elif job["status"] == "error":
                yield f"event: error\ndata: {json.dumps({'error': job['error']})}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/results/{job_id}")
async def get_results(job_id: str):
    """Return full tracking results with analytics."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "done":
        return {"status": job["status"], "error": job.get("error")}

    result = job["result"]
    parquet_path = Path(result["parquet_path"])

    # Load the parquet for analytics
    df = pd.read_parquet(parquet_path)

    source_fps = result["source_fps"]
    stride = 5

    # Build per-track trajectory index for real-time video locking & HUD overlays
    trajectories = {}
    if not df.empty and "track_id" in df.columns:
        valid_df = df[df["track_id"] >= 0].sort_values(["track_id", "timestamp_s"])
        try:
            res_parts = str(result.get("source_resolution", "3840x2160")).split("x")
            w, h = float(res_parts[0]), float(res_parts[1])
        except Exception:
            w, h = 3840.0, 2160.0

        for tid, gdf in valid_df.groupby("track_id"):
            trajectories[int(tid)] = {
                "t": [round(float(t), 2) for t in gdf["timestamp_s"]],
                "box": [
                    [
                        round(float(r.x1) / w, 4),
                        round(float(r.y1) / h, 4),
                        round(float(r.x2) / w, 4),
                        round(float(r.y2) / h, 4),
                    ]
                    for r in gdf.itertuples()
                ],
                "speed": [
                    round(float(s), 1) if pd.notna(s) else 0.0
                    for s in (gdf["speed_kmh"] if "speed_kmh" in gdf.columns else [0] * len(gdf))
                ],
            }

    analytics = {
        "overview": overview_stats(df, source_fps, stride, result["duration_s"]),
        "class_summary": class_summary(df),
        "track_summaries": track_summaries(df, source_fps, stride)[:150],
        "speed_estimates": speed_estimate_px(df, source_fps, stride)[:50],
        "trajectories": trajectories,
    }

    return {
        "status": "done",
        "job_id": job_id,
        "filename": job["filename"],
        **result,
        "analytics": analytics,
    }


@app.get("/api/video/{job_id}")
async def serve_video(job_id: str):
    """Serve the annotated video."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Job not done yet")

    video_path = Path(job["result"]["video_path"])
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Annotated video not found")

    return FileResponse(
        str(video_path), media_type="video/mp4", filename="tracks_annotated.mp4"
    )


@app.get("/api/download/{job_id}")
async def download_parquet(job_id: str):
    """Download the tracks parquet file."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Job not done yet")

    parquet_path = Path(job["result"]["parquet_path"])
    if not parquet_path.exists():
        raise HTTPException(status_code=404, detail="Parquet file not found")

    return FileResponse(
        str(parquet_path),
        media_type="application/octet-stream",
        filename="tracks.parquet",
    )


@app.get("/api/jobs")
async def list_jobs():
    """List all jobs and their status."""
    return {
        jid: {
            "status": j["status"],
            "filename": j["filename"],
        }
        for jid, j in jobs.items()
    }
