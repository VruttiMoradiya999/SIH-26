/**
 * upload.js — Full-screen interactive upload sheet with ingest preview.
 * Selecting a file shows a live "getting your video in" moment with a real
 * thumbnail preview; the user then confirms via Analyze traffic.
 */

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

const INGEST_STAGES = ['Reading file…', 'Checking video stream…', 'Starting AI pipeline…'];

export function renderUpload(container, { onFileSelected }) {
  container.innerHTML = `
    <section class="upload-section upload-full">
      <div class="container upload-sheet-wrap">
        <div class="upload-sheet animate-in">
          <div class="upload-head">
            <div>
              <h1 class="upload-title">Upload drone footage</h1>
              <p class="upload-subtitle">
                For best tracking, use 1080p or higher video in MP4 format.
              </p>
            </div>
            <span class="upload-step-pill">Step 1 of 3</span>
          </div>

          <div class="upload-zone" id="upload-zone">
            <span class="upload-icon">🎬</span>
            <p class="upload-label" id="upload-label">Drag and drop video files to upload</p>
            <p class="upload-hint">Your video stays private to this session • MP4, AVI, MOV</p>
            <button class="btn btn-dark upload-select" id="btn-select-files" type="button">Select files</button>
            <input type="file" class="upload-input" id="upload-input" accept="video/*" />
          </div>

          <div class="ingest" id="ingest-panel" hidden>
            <div class="ingest-thumb">
              <video id="ingest-video" muted playsinline preload="metadata"></video>
              <span class="ingest-thumb-badge">Preview</span>
            </div>
            <div class="ingest-info">
              <div class="ingest-name" id="ingest-name">—</div>
              <div class="ingest-meta"><span id="ingest-size">—</span><span class="hero-sep"></span><span id="ingest-dims">—</span></div>
              <div class="ingest-stage" id="ingest-stage">Reading file…</div>
              <div class="ingest-bar"><div class="ingest-fill" id="ingest-fill"></div></div>
            </div>
          </div>
          <p class="ingest-error" id="ingest-error" hidden>That file isn't a video. Please choose an MP4, AVI or MOV file.</p>

          <button class="guide-toggle" id="guide-toggle" aria-expanded="false">
            <span>Step-by-step guide</span>
            <span class="guide-chevron">⌄</span>
          </button>
          <div class="guide-body" id="guide-body" hidden>
            <div class="guide-step"><strong>1. Upload footage</strong> — drop your drone video above.</div>
            <div class="guide-step"><strong>2. AI tracks traffic</strong> — YOLO11s detection with ByteTrack IDs.</div>
            <div class="guide-step"><strong>3. Explore insight</strong> — modal split, kinematics and lock-on HUD.</div>
          </div>

          <div class="upload-foot">
            <button class="btn btn-outline" id="btn-cancel-file" type="button" disabled>Cancel</button>
            <button class="btn btn-dark btn-lg upload-go" id="btn-analyze" type="button" disabled>
              <span id="analyze-label">Analyze traffic</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  `;

  const zone = container.querySelector('#upload-zone');
  const input = container.querySelector('#upload-input');
  const selectBtn = container.querySelector('#btn-select-files');
  const label = container.querySelector('#upload-label');
  const panel = container.querySelector('#ingest-panel');
  const video = container.querySelector('#ingest-video');
  const nameEl = container.querySelector('#ingest-name');
  const sizeEl = container.querySelector('#ingest-size');
  const dimsEl = container.querySelector('#ingest-dims');
  const stageEl = container.querySelector('#ingest-stage');
  const fillEl = container.querySelector('#ingest-fill');
  const errorEl = container.querySelector('#ingest-error');
  const cancelBtn = container.querySelector('#btn-cancel-file');
  const analyzeBtn = container.querySelector('#btn-analyze');
  const analyzeLabel = container.querySelector('#analyze-label');
  const guideToggle = container.querySelector('#guide-toggle');
  const guideBody = container.querySelector('#guide-body');

  let currentFile = null;
  let objectUrl = null;
  let stageTimer = null;

  function clearFile() {
    currentFile = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    video.removeAttribute('src');
    video.load();
    panel.hidden = true;
    errorEl.hidden = true;
    cancelBtn.disabled = true;
    analyzeBtn.disabled = true;
    analyzeLabel.textContent = 'Analyze traffic';
    label.textContent = 'Drag and drop video files to upload';
    zone.classList.remove('has-file');
    input.value = '';
    if (stageTimer) { clearInterval(stageTimer); stageTimer = null; }
  }

  function ingestFile(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    if (stageTimer) { clearInterval(stageTimer); stageTimer = null; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);

    currentFile = file;
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    nameEl.textContent = file.name;
    sizeEl.textContent = formatBytes(file.size);
    dimsEl.textContent = 'reading…';
    video.onloadedmetadata = () => {
      dimsEl.textContent = `${video.videoWidth}×${video.videoHeight}`;
    };

    panel.hidden = false;
    zone.classList.add('has-file');
    label.textContent = file.name;
    cancelBtn.disabled = false;
    analyzeBtn.disabled = true;
    analyzeLabel.textContent = 'Getting video in…';

    // Staged "video is getting into it" feedback before enabling Analyze.
    let stage = 0;
    stageEl.textContent = INGEST_STAGES[0];
    fillEl.style.width = '12%';
    stageTimer = setInterval(() => {
      stage += 1;
      if (stage < INGEST_STAGES.length) {
        stageEl.textContent = INGEST_STAGES[stage];
        fillEl.style.width = `${12 + (stage / INGEST_STAGES.length) * 76}%`;
      } else {
        clearInterval(stageTimer);
        stageTimer = null;
        stageEl.textContent = 'Ready — hit Analyze traffic.';
        fillEl.style.width = '100%';
        analyzeBtn.disabled = false;
        analyzeLabel.textContent = 'Analyze traffic →';
      }
    }, 450);

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    input.click();
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    if (e.target.files.length > 0) ingestFile(e.target.files[0]);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) ingestFile(e.dataTransfer.files[0]);
  });

  cancelBtn.addEventListener('click', clearFile);

  analyzeBtn.addEventListener('click', () => {
    if (currentFile && !analyzeBtn.disabled) {
      const file = currentFile;
      if (stageTimer) { clearInterval(stageTimer); stageTimer = null; }
      onFileSelected(file);
    }
  });

  guideToggle.addEventListener('click', () => {
    const open = guideBody.hidden;
    guideBody.hidden = !open;
    guideToggle.setAttribute('aria-expanded', String(open));
    guideToggle.classList.toggle('open', open);
  });
}
