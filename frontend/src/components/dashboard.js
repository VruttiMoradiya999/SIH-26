/**
 * dashboard.js — Main analytics dashboard view with vehicle lock-on and telemetry deck.
 */

import { formatNumber, formatDuration, formatFps } from '../utils/format.js';
import { getDownloadUrl } from '../api.js';
import { renderVideoPlayer } from './video-player.js';
import { renderClassChart, THEME_PALETTE } from './charts.js';

export function renderDashboard(container, results, { onNewUpload }) {
  const analytics = results.analytics || {};
  const overview = analytics.overview || {};
  const classSummary = analytics.class_summary || [];
  const trackSummaries = analytics.track_summaries || [];
  const trajectories = analytics.trajectories || {};

  let currentlyLockedId = null;

  // Overview data prep — colours resolve exactly like the chart segments.
  const totalUnits = results.unique_tracks || overview.unique_tracks || 0;
  const sortedClasses = [...classSummary].sort((a, b) => (b.tracks || 0) - (a.tracks || 0));
  const segColor = (entry) =>
    entry ? (entry.color || THEME_PALETTE[classSummary.indexOf(entry) % THEME_PALETTE.length]) : '#0b0e0b';
  const share = (entry) => (totalUnits && entry ? (entry.tracks / totalUnits) * 100 : 0);
  const dominant = sortedClasses[0] || null;
  const top3 = sortedClasses.slice(0, 3);
  const meanSpeed = parseFloat(overview.mean_speed_kmh) || 0;
  const peakTrack = trackSummaries.reduce(
    (best, t) => (!best || (t.max_speed_kmh || 0) > (best.max_speed_kmh || 0) ? t : best), null);
  const peakSpeed = peakTrack ? peakTrack.max_speed_kmh || 0 : 0;
  const avgDur = results.mean_track_length_s || overview.mean_track_duration_s || 0;
  const totalDet = results.total_detections || overview.total_detections || 0;
  const scalePct = peakSpeed > 0 ? Math.min((meanSpeed / peakSpeed) * 100, 100) : 0;

  container.innerHTML = `
    <section class="dashboard-section">
      <div class="container">
        <!-- Header -->
        <div class="dashboard-header animate-in">
          <div>
            <h1 class="dashboard-title">Traffic Analytics Dashboard</h1>
            <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">
              Video: <code style="color: var(--accent-blue);">${results.filename || 'Source Video'}</code> • 
              Duration: <strong style="color: var(--text-primary);">${formatDuration(results.duration_s)}</strong> • 
              Device: <strong style="color: var(--accent-emerald);">${(results.device || 'auto').toUpperCase()}</strong>
            </p>
          </div>
          <div class="dashboard-actions">
            <a href="${getDownloadUrl(results.job_id)}" download class="btn btn-outline" id="btn-download-parquet">
              📥 Download Parquet
            </a>
            <button class="btn btn-primary" id="btn-new-video">
              ➕ Analyze Another Video
            </button>
          </div>
        </div>

        <!-- App shell -->
        <div class="dash-shell">
          <div class="dash-main">

        <!-- PAGE 1: Overview -->
        <div id="page-overview">
          <!-- Gradient hero cards -->
          <div class="hero-row">
            <div class="hero-card hero-mix">
              <div class="hero-card-top">
                <span class="hero-kicker">🚗&nbsp;&nbsp;Traffic mix</span>
                <span class="hero-card-sub">of ${formatNumber(totalUnits)} road users</span>
              </div>
              <div class="hero-big">${dominant ? formatNumber(dominant.tracks) : '—'}<span>${dominant ? dominant.label : 'no data'}</span></div>
              <div class="hero-chips">
                ${top3.map((c) => `
                  <span class="mix-chip">
                    <span class="dot" style="background: ${segColor(c)};"></span>
                    ${c.label} · <strong>${formatNumber(c.tracks)}</strong>
                  </span>`).join('')}
              </div>
            </div>

            <div class="hero-card hero-speed">
              <div class="hero-card-top">
                <span class="hero-kicker">⚡&nbsp;&nbsp;Speed profile</span>
                <span class="hero-card-sub">mean across tracks</span>
              </div>
              <div class="hero-big">${meanSpeed}<span>km/h</span></div>
              <div class="speed-scale"><div class="speed-marker" style="left: ${scalePct}%;"></div></div>
              <div class="speed-ends"><span>0</span><span>Peak ${peakSpeed} km/h</span></div>
            </div>
          </div>

          <!-- Pattern donut + session panel -->
          <div class="content-grid">
            <div class="chart-card donut-card">
              <div class="modal-head">
                <h3 class="chart-title" style="margin: 0;">Modal Split</h3>
                <span class="modal-pill">${formatNumber(totalUnits)} units</span>
              </div>
              <div class="donut-ring">
                <canvas id="class-chart"></canvas>
              </div>
            </div>

            <aside class="session-panel">
              <h3 class="session-title">Session</h3>
              <div class="sess-rows">
                <div class="sess-row"><span>File</span><strong class="mono">${results.filename || 'Source Video'}</strong></div>
                <div class="sess-row"><span>Duration</span><strong>${formatDuration(results.duration_s)}</strong></div>
                <div class="sess-row"><span>Device</span><strong>${(results.device || 'auto').toUpperCase()}</strong></div>
                <div class="sess-row"><span>Road users</span><strong>${formatNumber(totalUnits)}</strong></div>
                <div class="sess-row"><span>Detections</span><strong>${formatNumber(totalDet)}</strong></div>
                <div class="sess-row"><span>Avg. track</span><strong>${avgDur}s</strong></div>
              </div>
              <h4 class="rank-title">Class ranking</h4>
              <div class="rank-list">
                ${sortedClasses.slice(0, 6).map((c, i) => `
                  <div class="rank-row">
                    <span class="rank-num">${i + 1}</span>
                    <span class="dot" style="background: ${segColor(c)};"></span>
                    <span class="rank-label">${c.label}</span>
                    <span class="rank-val mono">${formatNumber(c.tracks)} · ${share(c).toFixed(0)}%</span>
                  </div>`).join('') || '<div class="rank-row">No classes recorded</div>'}
              </div>
              <div class="peak-card">
                <div class="peak-top"><span>☀️ Peak speed</span>${peakTrack ? `<span class="peak-tag">${peakTrack.label} #${peakTrack.track_id}</span>` : ''}</div>
                <div class="peak-big">${peakSpeed}<span> km/h</span></div>
              </div>
            </aside>
          </div>
        </div><!-- /page-overview -->

        <!-- PAGE 2: Tracking & Details — video + telemetry + table -->
        <div id="page-details" style="display: none;">
        <!-- Video Player Section with Real-Time Reticle HUD -->
        <div id="video-container"></div>

        <!-- Target Lock-On Telemetry Deck -->
        <div class="chart-card telemetry-deck" id="telemetry-deck" style="margin-bottom: 32px;">
            <div id="telemetry-idle" class="telemetry-state-idle">
              <div class="telemetry-idle-icon">🎯</div>
              <h4 style="font-size: 16px; margin-bottom: 6px;">Target Lock-On Telemetry</h4>
              <p style="color: var(--text-muted); font-size: 13px; max-width: 360px; line-height: 1.6;">
                Click on any vehicle in the <strong>Track Directory</strong> below to lock the camera HUD, jump to its timestamp, and inspect real-time kinematics.
              </p>
            </div>

            <div id="telemetry-active" class="telemetry-state-active" style="display: none;">
              <div class="telemetry-active-header">
                <div>
                  <span class="telemetry-target-tag" id="tel-target-tag">TARGET #--</span>
                  <h3 id="tel-class-title" style="font-size: 20px; font-weight: 800; margin-top: 4px;">Car</h3>
                </div>
                <button id="btn-tel-release" class="btn btn-outline btn-sm" style="font-size: 12px; padding: 6px 12px;">
                  ✕ Release Lock
                </button>
              </div>

              <div class="telemetry-metrics-grid">
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Mean Speed</span>
                  <span class="tel-metric-value" id="tel-mean-spd" style="color: var(--accent-emerald);">-- km/h</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Peak Speed</span>
                  <span class="tel-metric-value" id="tel-max-spd">-- km/h</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Status</span>
                  <span class="tel-metric-value" id="tel-status">--</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Duration</span>
                  <span class="tel-metric-value" id="tel-duration">-- s</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Displacement</span>
                  <span class="tel-metric-value" id="tel-disp">-- px</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Time Window</span>
                  <span class="tel-metric-value" id="tel-window" style="font-size: 13px;">--</span>
                </div>
              </div>

              <div class="telemetry-actions" style="margin-top: 16px; display: flex; gap: 10px;">
                <button id="btn-tel-jump" class="btn btn-primary btn-sm" style="flex: 1; font-size: 12px;">
                  ⏮ Jump to Start (t=<span id="tel-start-sec">0.0</span>s)
                </button>
              </div>
            </div>
          </div>

        <!-- Active Track Telemetry Table -->
        <div class="table-card">
          <div class="table-header">
            <div>
              <div class="table-title">
                📋 Track Directory & Vehicle Kinematics
              </div>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Click any row or the 🎯 Lock button to focus the video HUD on that vehicle.
              </p>
            </div>
            <div class="table-tools">
              <input class="track-search" id="track-search" type="search" placeholder="Search tracks…" aria-label="Search tracks" />
              <div class="table-count" id="track-count">Showing ${trackSummaries.length} tracked road users</div>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table" id="tracks-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Track ID</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th>Mean Speed</th>
                  <th>Peak Speed</th>
                  <th>Detections</th>
                  <th>Duration</th>
                  <th>Confidence</th>
                  <th>Time Window</th>
                </tr>
              </thead>
              <tbody>
                ${
                  trackSummaries.length === 0
                    ? `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 32px;">No tracks recorded</td></tr>`
                    : trackSummaries
                        .map(t => {
                          const meanSpdStr = t.mean_speed_kmh > 0 ? `${t.mean_speed_kmh} km/h` : '0 km/h';
                          const maxSpdStr = t.max_speed_kmh > 0 ? `${t.max_speed_kmh} km/h` : '0 km/h';
                          const statusBg = t.status_color || '#10b981';
                          return `
                    <tr class="track-row" data-track-id="${t.track_id}" style="cursor: pointer;">
                      <td>
                        <button class="btn btn-outline btn-sm btn-lock-row" data-track-id="${t.track_id}" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                          <span>🎯</span> <span>Lock</span>
                        </button>
                      </td>
                      <td class="mono" style="font-weight: 700; color: var(--accent-blue);">#${t.track_id}</td>
                      <td>
                        <span class="class-badge" style="background: ${t.color}20; color: ${t.color};">
                          <span class="dot" style="background: ${t.color};"></span>
                          ${t.label}
                        </span>
                      </td>
                      <td>
                        <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: ${statusBg}20; color: ${statusBg};">
                          ${t.status || 'Active'}
                        </span>
                      </td>
                      <td class="mono" style="color: var(--accent-emerald); font-weight: 700;">${meanSpdStr}</td>
                      <td class="mono" style="color: var(--text-primary); font-weight: 600;">${maxSpdStr}</td>
                      <td class="mono">${t.detections}</td>
                      <td class="mono">${t.duration_s}s</td>
                      <td class="mono">${(t.mean_conf * 100).toFixed(1)}%</td>
                      <td class="mono" style="color: var(--text-muted);">${t.first_seen_s}s → ${t.last_seen_s}s</td>
                    </tr>
                  `;
                        })
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
        </div><!-- /page-details -->
          </div><!-- /dash-main -->
        </div><!-- /dash-shell -->
      </div>
    </section>
  `;

  // Page switching — pure view switch, no data change.
  // (The top navbar drives this via window.__flytbaseShowPage.)
  const pageOverview = container.querySelector('#page-overview');
  const pageDetails = container.querySelector('#page-details');

  function showPage(which) {
    const showOverview = which === 'overview';
    pageOverview.style.display = showOverview ? '' : 'none';
    pageDetails.style.display = showOverview ? 'none' : '';
    window.dispatchEvent(new CustomEvent('flytbase:page', { detail: which }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Let the navbar switch tabs without reaching into dashboard internals.
  window.__flytbaseShowPage = showPage;

  // Track directory search — filters rows by id / class / status.
  const searchInput = container.querySelector('#track-search');
  const trackCount = container.querySelector('#track-count');
  const allRows = [...container.querySelectorAll('.track-row')];
  function applySearch() {
    const q = (searchInput.value || '').trim().toLowerCase();
    let visible = 0;
    allRows.forEach((row) => {
      const hit = !q || row.textContent.toLowerCase().includes(q);
      row.style.display = hit ? '' : 'none';
      if (hit) visible += 1;
    });
    trackCount.textContent = q
      ? `Showing ${visible} of ${allRows.length} tracked road users`
      : `Showing ${allRows.length} tracked road users`;
  }
  searchInput.addEventListener('input', applySearch);

  // Telemetry Deck Elements
  const telIdle = container.querySelector('#telemetry-idle');
  const telActive = container.querySelector('#telemetry-active');
  const telTargetTag = container.querySelector('#tel-target-tag');
  const telClassTitle = container.querySelector('#tel-class-title');
  const telMeanSpd = container.querySelector('#tel-mean-spd');
  const telMaxSpd = container.querySelector('#tel-max-spd');
  const telStatus = container.querySelector('#tel-status');
  const telDuration = container.querySelector('#tel-duration');
  const telDisp = container.querySelector('#tel-disp');
  const telWindow = container.querySelector('#tel-window');
  const telStartSec = container.querySelector('#tel-start-sec');
  const btnTelJump = container.querySelector('#btn-tel-jump');
  const btnTelRelease = container.querySelector('#btn-tel-release');

  // Render Video Player
  const videoContainer = container.querySelector('#video-container');
  const player = renderVideoPlayer(
    videoContainer,
    results.job_id,
    results,
    trajectories,
    (unlockedId) => {
      if (unlockedId === null) {
        clearSelection();
      }
    }
  );

  // Render Modal Split Donut Chart
  renderClassChart('class-chart', classSummary);

  function selectTrack(trackId) {
    const meta = trackSummaries.find(t => t.track_id === trackId);
    if (!meta) return;

    currentlyLockedId = trackId;

    // Highlight row in table
    container.querySelectorAll('.track-row').forEach(row => {
      if (parseInt(row.getAttribute('data-track-id'), 10) === trackId) {
        row.classList.add('selected-track-row');
      } else {
        row.classList.remove('selected-track-row');
      }
    });

    // Update Telemetry Deck
    telIdle.style.display = 'none';
    telActive.style.display = 'block';

    telTargetTag.textContent = `🎯 TARGET #${trackId}`;
    telClassTitle.innerHTML = `<span style="color: ${meta.color || '#38bdf8'};">${meta.label}</span>`;
    telMeanSpd.textContent = meta.mean_speed_kmh > 0 ? `${meta.mean_speed_kmh} km/h` : '0 km/h';
    telMaxSpd.textContent = meta.max_speed_kmh > 0 ? `${meta.max_speed_kmh} km/h` : '0 km/h';
    telStatus.textContent = meta.status || 'Active';
    telStatus.style.color = meta.status_color || '#10b981';
    telDuration.textContent = `${meta.duration_s}s (${meta.detections} pts)`;
    telDisp.textContent = `${meta.displacement_px} px`;
    telWindow.textContent = `${meta.first_seen_s}s → ${meta.last_seen_s}s`;
    telStartSec.textContent = meta.first_seen_s;

    // Trigger video player lock
    player.lockTarget(trackId, meta);
  }

  function clearSelection() {
    currentlyLockedId = null;
    container.querySelectorAll('.track-row').forEach(row => row.classList.remove('selected-track-row'));
    telIdle.style.display = 'flex';
    telActive.style.display = 'none';
    player.unlockTarget();
  }

  // Row click & Lock button click handlers
  container.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const tid = parseInt(row.getAttribute('data-track-id'), 10);
      selectTrack(tid);
    });
  });

  btnTelRelease.addEventListener('click', () => {
    clearSelection();
  });

  btnTelJump.addEventListener('click', () => {
    if (currentlyLockedId != null) {
      const meta = trackSummaries.find(t => t.track_id === currentlyLockedId);
      if (meta && meta.first_seen_s != null && player.video) {
        player.video.currentTime = Math.max(meta.first_seen_s - 0.1, 0);
        player.video.play().catch(() => {});
      }
    }
  });

  // New Video Action
  container.querySelector('#btn-new-video').addEventListener('click', () => {
    onNewUpload();
  });
}
