/**
 * main.js — Main application orchestrator for FlytBase Drone Traffic Analytics.
 */

import './style.css';
import { uploadVideo, subscribeProgress, getResults } from './api.js';
import { renderLanding } from './components/landing.js';
import { renderUpload } from './components/upload.js';
import { renderDashboard } from './components/dashboard.js';
import { formatNumber, formatDuration } from './utils/format.js';

const app = document.getElementById('app');

// State management
let state = {
  view: 'landing', // 'landing' | 'upload' | 'processing' | 'dashboard' | 'error'
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

// Tracks which dashboard tab is visible so the navbar can highlight it.
let dashboardPage = 'overview';
window.addEventListener('flytbase:page', (e) => {
  dashboardPage = e.detail === 'details' ? 'details' : 'overview';
  syncNavActive();
});

// Dashboard icon rail requests (home / upload views).
window.addEventListener('flytbase:nav', (e) => {
  if (e.detail === 'home' && state.view !== 'landing') goLanding();
  else if (e.detail === 'upload' && state.view !== 'upload') goUpload();
});

function setState(updates) {
  state = { ...state, ...updates };
  render();
}

function renderHeader() {
  const view = state.view;
  const onDashboard = view === 'dashboard';
  const p = state.progress;
  const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 0;

  const overviewActive = onDashboard && dashboardPage === 'overview';
  const detailsActive = onDashboard && dashboardPage === 'details';
  const uploadActive = view === 'upload';
  const homeActive = view === 'landing';

  const cta = view === 'processing'
    ? `<button class="btn btn-new nav-cta" disabled style="opacity: 0.7; cursor: default;">${pct}% analyzing…</button>`
    : view === 'dashboard'
      ? `<button class="btn btn-new nav-cta" data-nav-action="new-video">➕ New video</button>`
      : view === 'landing'
        ? `<button class="btn btn-new nav-cta" data-nav-action="get-started">Get Started</button>`
        : `<button class="btn btn-new nav-cta" data-nav-action="choose-video">🎬 Choose video</button>`;

  return `
    <header class="header" id="site-header">
      <div class="container header-inner">
        <button class="logo nav-logo" data-nav="home" aria-label="FlytBase home">
          <span class="logo-icon">🛸</span>
          <span class="logo-text">Flyt<span>Base</span></span>
        </button>
        <nav class="nav-links" aria-label="Primary">
          <button class="nav-link${homeActive ? ' active' : ''}" data-nav="home">Home</button>
          <button class="nav-link${uploadActive ? ' active' : ''}" data-nav="upload">Upload</button>
          <button class="nav-link${overviewActive ? ' active' : ''}" data-nav="overview" ${onDashboard ? '' : 'disabled title="Available after analysis"'}>Overview</button>
          <button class="nav-link${detailsActive ? ' active' : ''}" data-nav="details" ${onDashboard ? '' : 'disabled title="Available after analysis"'}>Tracking &amp; Details</button>
        </nav>
        <div class="nav-actions">
          <span class="header-badge nav-badge">
            <span class="dot"></span>
            <span>YOLO11s + ByteTrack</span>
          </span>
          ${cta}
          <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>
  `;
}

function goLanding() {
  if (state.eventSource) state.eventSource.close();
  dashboardPage = 'overview';
  setState({
    view: 'landing',
    jobId: null,
    filename: null,
    progress: { processed: 0, total: 0, fps: 0, eta_s: 0, timestamp_s: 0 },
    results: null,
    error: null,
  });
}

function goUpload() {
  if (state.eventSource) state.eventSource.close();
  dashboardPage = 'overview';
  setState({
    view: 'upload',
    jobId: null,
    filename: null,
    progress: { processed: 0, total: 0, fps: 0, eta_s: 0, timestamp_s: 0 },
    results: null,
    error: null,
  });
}

function resetToUpload() {
  goUpload();
}

function syncNavActive() {
  const header = document.getElementById('site-header');
  if (!header) return;
  header.querySelectorAll('.nav-link').forEach(btn => {
    const id = btn.getAttribute('data-nav');
    const active =
      (id === 'home' && state.view === 'landing') ||
      (id === 'upload' && state.view === 'upload') ||
      (id === 'overview' && state.view === 'dashboard' && dashboardPage === 'overview') ||
      (id === 'details' && state.view === 'dashboard' && dashboardPage === 'details');
    btn.classList.toggle('active', active);
  });
}

function wireHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  header.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-nav');
      header.classList.remove('nav-open');
      const toggle = document.getElementById('nav-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      if (id === 'home') {
        if (state.view !== 'landing') goLanding();
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (id === 'upload') {
        if (state.view !== 'upload') goUpload();
        else document.getElementById('upload-zone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (id === 'overview' || id === 'details') {
        if (state.view === 'dashboard' && window.__flytbaseShowPage) {
          window.__flytbaseShowPage(id);
        }
      }
    });
  });

  header.querySelectorAll('[data-nav-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-nav-action');
      if (action === 'choose-video') {
        document.getElementById('upload-input')?.click();
      } else if (action === 'new-video') {
        resetToUpload();
      } else if (action === 'get-started') {
        goUpload();
        setTimeout(() => document.getElementById('upload-zone')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      }
    });
  });

  const toggle = document.getElementById('nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.classList.toggle('open', open);
    });
  }
}

function renderProcessing() {
  const p = state.progress;
  const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 0;
  const carLeft = 4 + (pct / 100) * 88;

  return `
    <section class="processing-section">
      <div class="container">
        <div class="processing-card processing-sheet animate-in">
          <h2 class="processing-title">Analyzing Drone Footage</h2>
          <div class="processing-filename">${state.filename || 'Processing video...'}</div>

          <div class="road-scene" id="road-scene" aria-hidden="true">
            <span class="road-bush" style="left: 5%; width: 58px; height: 34px;"></span>
            <span class="road-bush" style="left: 12%; width: 36px; height: 22px; opacity: 0.6;"></span>
            <span class="road-bush" style="right: 6%; width: 66px; height: 38px;"></span>
            <div class="road-drone" id="road-drone" style="left: ${carLeft}%;">🛸</div>
            <div class="road-scan" id="road-scan" style="left: ${carLeft}%;"></div>
            <div class="road-wrap">
              <div class="road"></div>
              <div class="road-car" id="road-car" style="left: ${carLeft}%;">
                <svg viewBox="0 0 132 60" width="104" height="48">
                  <rect x="6" y="30" width="120" height="12" rx="6" fill="#0b0e0b"/>
                  <path d="M22 30 L34 14 L78 14 L94 30 Z" fill="#0b0e0b"/>
                  <path d="M38 28 L47 17 L73 17 L82 28 Z" fill="#e5ff4f"/>
                  <rect x="118" y="32" width="8" height="5" rx="2" fill="#e5ff4f"/>
                  <rect x="4" y="32" width="6" height="5" rx="2" fill="#a64141"/>
                  <g class="wheel" style="transform-box: fill-box; transform-origin: center;">
                    <circle cx="34" cy="44" r="11" fill="#1c221c" stroke="#0b0e0b" stroke-width="2"/>
                    <circle cx="34" cy="44" r="4" fill="#e5ff4f"/>
                  </g>
                  <g class="wheel" style="transform-box: fill-box; transform-origin: center;">
                    <circle cx="98" cy="44" r="11" fill="#1c221c" stroke="#0b0e0b" stroke-width="2"/>
                    <circle cx="98" cy="44" r="4" fill="#e5ff4f"/>
                  </g>
                </svg>
              </div>
            </div>
          </div>

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

  if (state.view === 'landing') {
    app.innerHTML = headerHtml;
    wireHeader();
    app.appendChild(contentDiv);
    renderLanding(contentDiv, {
      onGetStarted: goUpload,
    });
  } else if (state.view === 'upload') {
    app.innerHTML = headerHtml;
    wireHeader();
    app.appendChild(contentDiv);
    renderUpload(contentDiv, {
      onFileSelected: handleFileUpload,
    });
  } else if (state.view === 'processing') {
    app.innerHTML = headerHtml + renderProcessing();
    wireHeader();
  } else if (state.view === 'dashboard') {
    app.innerHTML = headerHtml;
    wireHeader();
    app.appendChild(contentDiv);
    renderDashboard(contentDiv, state.results, {
      onNewUpload: resetToUpload,
    });
  } else if (state.view === 'error') {
    app.innerHTML = headerHtml + renderError();
    wireHeader();
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
            // Drive the car + drone across the road with progress.
            const carLeft = 4 + (pct / 100) * 88;
            const car = processingCard.querySelector('#road-car');
            if (car) car.style.left = `${carLeft}%`;
            const drone = processingCard.querySelector('#road-drone');
            if (drone) drone.style.left = `${carLeft}%`;
            const scan = processingCard.querySelector('#road-scan');
            if (scan) scan.style.left = `${carLeft}%`;
          }
        }
      },
      onDone: async (finalResult) => {
        // Beat: car drives off the road, drone lifts away, then dashboard.
        document.querySelector('.road-scene')?.classList.add('drive-off');
        const car = document.querySelector('#road-car');
        if (car) car.style.left = '112%';
        await new Promise((r) => setTimeout(r, 800));
        try {
          const fullResults = await getResults(jobId);
          dashboardPage = 'overview';
          setState({
            view: 'dashboard',
            results: fullResults,
          });
        } catch (fetchErr) {
          dashboardPage = 'overview';
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

// Visual-only: bold header shadow once scrolled (no state/logic change).
window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  if (!header) return;
  header.classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });
