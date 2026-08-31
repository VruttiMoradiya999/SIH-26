# 🛸 FlytBase Drone Traffic Analytics — Full-Stack Vision Intelligence

A modern, production-grade aerial traffic intelligence web application combining **VisDrone-fine-tuned YOLOv11s** object detection, **Supervision InferenceSlicer** for tiled high-resolution inference, **ByteTrack** multi-object tracking, and a **Vite + Vanilla JS** dark-mode analytics dashboard.

---

## 📁 Clean Repository Structure

```
flybase_hackathon_cv-main/
├── backend/                        # FastAPI Backend & ML Pipeline
│   ├── main.py                     # FastAPI application & REST/SSE endpoints
│   ├── tracker.py                  # VisDrone YOLO11s tiled tracking engine
│   ├── analytics.py                # Trajectory analytics & kinematic metrics
│   ├── config.py                   # Model configuration & class taxonomy
│   ├── l3_core.py                  # Advanced Level 3 aggregate traffic analytics
│   ├── calibration.json            # Camera & ground plane calibration
│   ├── requirements.txt            # Python dependencies
│   └── notebooks/                  # Consolidated Notebooks & Telemetry
│       ├── hackathon_pipeline_master.ipynb  # Complete merged Jupyter pipeline (L1-L3)
│       ├── Intersection_1080p.srt           # Drone telemetry subtitle track
│       └── labels_*.json                    # Ground-truth annotations
│
├── frontend/                       # Modern Vite Analytics Frontend
│   ├── index.html                  # HTML entry point (Inter & JetBrains Mono)
│   ├── package.json                # Frontend dependencies
│   ├── vite.config.js              # Vite server & API proxy config
│   └── src/
│       ├── main.js                 # App orchestrator & SSE streaming client
│       ├── style.css               # Glassmorphic dark design system
│       ├── api.js                  # Backend API client
│       ├── components/
│       │   ├── upload.js           # Drag-and-drop video upload zone
│       │   ├── dashboard.js        # Analytics & metrics dashboard
│       │   ├── video-player.js     # Annotated video playback component
│       │   └── charts.js           # Chart.js visualizations (Modal split, speed)
│       └── utils/
│           └── format.js           # Number, duration & metric formatters
│
├── Test.mp4                        # Sample test video
├── Test2.mp4                       # High-resolution 4K test video
├── CONTEXT.md                      # Technical specifications & geometry
└── requirements.txt                # Root Python dependencies
```

---

## 🚀 Quick Start (Easiest Method)

From the root directory:

### 1. Launch Backend
```bash
./run_backend.sh
```
*(Runs FastAPI server on `http://localhost:8000` using your Miniconda Python environment)*

### 2. Launch Frontend
In a separate terminal tab:
```bash
./run_frontend.sh
```
*(Runs Vite Dev server on `http://localhost:5173`)*

---

### Manual Method (Alternative)

```bash
# Backend
cd backend
/opt/miniconda3/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## ⚡ Features

1. **Exact VisDrone YOLO11s Model**: Fine-tuned on the VisDrone dataset (`dronefreak/visdrone-yolov11s`) for high-accuracy small-object detection in aerial footage.
2. **Tiled Inference**: `supervision.InferenceSlicer` (1024×1024 tiles with 20% overlap) to accurately detect tiny vehicles and pedestrians in 4K drone video.
3. **ByteTrack ID Persistence**: Multi-object tracking with trajectory stitching and ID persistence across occlusions.
4. **Real-Time SSE Progress**: Live progress bar with processed frames, processing FPS, and accurate ETA streamed via Server-Sent Events.
5. **Interactive Dashboard**:
   - High-level metric cards (Unique road users, total detections, classes, average duration)
   - Dynamic charts (Modal split donut, detections by class, track duration distribution, model confidence)
   - Inline annotated video playback (`tracks_annotated.mp4`)
   - Interactive track directory table with displacement, speeds, and timestamp ranges
   - 1-click Parquet dataset export (`tracks.parquet`)
6. **Unified Master Notebook**: All previous hackathon levels (Level 1 Detection, Level 2 Kinematics, Level 3 Aggregate Insights) are consolidated in [`backend/notebooks/hackathon_pipeline_master.ipynb`](backend/notebooks/hackathon_pipeline_master.ipynb).
