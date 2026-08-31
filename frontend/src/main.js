/**
 * main.js — Main application orchestrator for FlytBase Drone Traffic Analytics.
 */

import './style.css';
import { uploadVideo, subscribeProgress, getResults } from './api.js';
import { renderUpload } from './components/upload.js';
import { renderDashboard } from './components/dashboard.js';
import { formatNumber, formatDuration } from './utils/format.js';

const app = document.getElementById('app');

// State management
let state = {
  view: 'upload', // 'upload' | 'processing' | 'dashboard' | 'error'
  jobId: null,
  filename: null,
  progress: {
    processed: 0,
    total: 0,
    fps: 0,
    eta_s: 0,
    timestamp_s: 0,
  },
  results: null,
  error: null,
  eventSource: null,
};

function setState(updates) {
  state = { ...state, ...updates };
  render();
}

function renderHeader() {
  return `
    <header class="header">
      <div class="container header-inner">
        <div class="logo">
          <div class="logo-icon">🛸</div>
          <div class="logo-text">Flyt<span>Base</span></div>
        </div>
        <div class="header-badge">
          <span class="dot"></span>
          <span>VisDrone YOLO11s + ByteTrack</span>
        </div>
      </div>
    </header>
  `;
}

function renderProcessing() {
  const p = state.progress;
  const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 0;

  return `
    <section class="processing-section">
      <div class="container">
        <div class="processing-card animate-in">
          <div class="processing-spinner"></div>
          <h2 class="processing-title">Analyzing Drone Footage</h2>
          <div class="processing-filename">${state.filename || 'Processing video...'}</div>

          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${pct}%;"></div>
          </div>

          <div class="progress-stats">
            <div class="progress-stat">
              <div class="progress-stat-value">${pct}%</div>
              <div class="progress-stat-label">Progress (${p.processed}/${p.total || '?'})</div>
            </div>
            <div class="progress-stat">
              <div class="progress-stat-value">${p.fps ? p.fps.toFixed(1) : '—'} <span style="font-size: 13px;">fps</span></div>
              <div class="progress-stat-label">Speed</div>
            </div>
            <div class="progress-stat">
              <div class="progress-stat-value">${p.eta_s > 0 ? formatDuration(p.eta_s) : '—'}</div>
              <div class="progress-stat-label">ETA</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderError() {
  return `
    <section class="processing-section">
      <div class="container">
        <div class="error-card animate-in">
          <div class="error-icon">⚠️</div>
          <h2 class="error-title">Processing Error</h2>
          <p class="error-message">${state.error || 'An unexpected error occurred while processing the video.'}</p>
          <button class="btn btn-primary" id="btn-retry">Try Again</button>
        </div>
      </div>
    </section>
  `;
}

function render() {
  // Always render header
  const headerHtml = renderHeader();
  const contentDiv = document.createElement('div');

  if (state.view === 'upload') {
    app.innerHTML = headerHtml;
    app.appendChild(contentDiv);
    renderUpload(contentDiv, {
      onFileSelected: handleFileUpload,
    });
  } else if (state.view === 'processing') {
    app.innerHTML = headerHtml + renderProcessing();
  } else if (state.view === 'dashboard') {
    app.innerHTML = headerHtml;
    app.appendChild(contentDiv);
    renderDashboard(contentDiv, state.results, {
      onNewUpload: () => {
        if (state.eventSource) state.eventSource.close();
        setState({
          view: 'upload',
          jobId: null,
          filename: null,
          progress: { processed: 0, total: 0, fps: 0, eta_s: 0, timestamp_s: 0 },
          results: null,
          error: null,
        });
      },
    });
  } else if (state.view === 'error') {
    app.innerHTML = headerHtml + renderError();
    const retryBtn = document.getElementById('btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        setState({ view: 'upload', error: null });
      });
    }
  }
}

async function handleFileUpload(file) {
  if (!file) return;

  setState({
    view: 'processing',
    filename: file.name,
    progress: { processed: 0, total: 0, fps: 0, eta_s: 0, timestamp_s: 0 },
    error: null,
  });

  try {
    const uploadRes = await uploadVideo(file);
    const jobId = uploadRes.job_id;
    state.jobId = jobId;

    // Subscribe to SSE real-time stream
    const es = subscribeProgress(jobId, {
      onProgress: (p) => {
        state.progress = p;
        if (state.view === 'processing') {
          // Re-render processing stats directly for fluid UI update
          const processingCard = document.querySelector('.processing-card');
          if (processingCard) {
            const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 0;
            const bar = processingCard.querySelector('.progress-bar');
            if (bar) bar.style.width = `${pct}%`;

            const statVals = processingCard.querySelectorAll('.progress-stat-value');
            if (statVals.length >= 3) {
              statVals[0].innerHTML = `${pct}%`;
              statVals[1].innerHTML = `${p.fps ? p.fps.toFixed(1) : '—'} <span style="font-size: 13px;">fps</span>`;
              statVals[2].innerHTML = `${p.eta_s > 0 ? formatDuration(p.eta_s) : '—'}`;
            }
            const statLbls = processingCard.querySelectorAll('.progress-stat-label');
            if (statLbls.length >= 1) {
              statLbls[0].innerHTML = `Progress (${p.processed}/${p.total || '?'})`;
            }
          }
        }
      },
      onDone: async (finalResult) => {
        try {
          const fullResults = await getResults(jobId);
          setState({
            view: 'dashboard',
            results: fullResults,
          });
        } catch (fetchErr) {
          setState({
            view: 'dashboard',
            results: { ...finalResult, job_id: jobId, filename: file.name },
          });
        }
      },
      onError: (errData) => {
        setState({
          view: 'error',
          error: errData.error || 'Failed to process tracking job',
        });
      },
    });

    state.eventSource = es;
  } catch (err) {
    setState({
      view: 'error',
      error: err.message || 'Failed to upload video',
    });
  }
}

// Initial render
render();
