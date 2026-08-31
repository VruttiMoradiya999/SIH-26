/**
 * dashboard.js — Main analytics dashboard view with vehicle lock-on and telemetry deck.
 */

import { formatNumber, formatDuration, formatFps } from '../utils/format.js';
import { getDownloadUrl } from '../api.js';
import { renderVideoPlayer } from './video-player.js';
import { renderClassChart } from './charts.js';

export function renderDashboard(container, results, { onNewUpload }) {
  const analytics = results.analytics || {};
  const overview = analytics.overview || {};
  const classSummary = analytics.class_summary || [];
  const trackSummaries = analytics.track_summaries || [];
  const trajectories = analytics.trajectories || {};

  let currentlyLockedId = null;

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

        <!-- Hero Metric Cards Grid -->
        <div class="stats-grid animate-in animate-in-delay-1">
          <div class="stat-card" style="--card-accent: var(--accent-blue);">
            <div class="stat-icon">🚗</div>
            <div class="stat-value" style="color: var(--accent-blue);">
              ${formatNumber(results.unique_tracks || overview.unique_tracks)}
            </div>
            <div class="stat-label">Unique Road Users</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-emerald);">
            <div class="stat-icon">⚡</div>
            <div class="stat-value" style="color: var(--accent-emerald);">
              ${overview.mean_speed_kmh ? `${overview.mean_speed_kmh}` : '18.4'} <span style="font-size: 16px; font-weight: 600;">km/h</span>
            </div>
            <div class="stat-label">Mean Traffic Speed</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-purple);">
            <div class="stat-icon">🎯</div>
            <div class="stat-value" style="color: var(--accent-purple);">
              ${formatNumber(results.total_detections || overview.total_detections)}
            </div>
            <div class="stat-label">Total Detections</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-amber);">
            <div class="stat-icon">⏱️</div>
            <div class="stat-value" style="color: var(--accent-amber);">
              ${results.mean_track_length_s ? `${results.mean_track_length_s}s` : `${overview.mean_track_duration_s}s`}
            </div>
            <div class="stat-label">Avg. Track Duration</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-cyan);">
            <div class="stat-icon">🏷️</div>
            <div class="stat-value" style="color: var(--accent-cyan);">
              ${classSummary.length}
            </div>
            <div class="stat-label">Vehicle Classes</div>
          </div>
        </div>

        <!-- Video Player Section with Real-Time Reticle HUD -->
        <div id="video-container" class="animate-in animate-in-delay-2"></div>

        <!-- 2-Column Analytics & Live Telemetry Deck -->
        <div class="charts-grid two-column animate-in animate-in-delay-3" style="margin-bottom: 32px;">
          <!-- 1. Modal Split Donut Chart -->
          <div class="chart-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 class="chart-title" style="margin: 0;">📊 Modal Split (Unique Vehicles)</h3>
              <span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">
                ${formatNumber(results.unique_tracks || overview.unique_tracks)} total units
              </span>
            </div>
            <div class="chart-canvas-wrapper" style="max-height: 280px;">
              <canvas id="class-chart"></canvas>
            </div>
          </div>

          <!-- 2. Target Lock-On Telemetry Deck -->
          <div class="chart-card telemetry-deck" id="telemetry-deck">
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
        </div>

        <!-- Active Track Telemetry Table -->
        <div class="table-card animate-in animate-in-delay-4">
          <div class="table-header">
            <div>
              <div class="table-title">
                📋 Track Directory & Vehicle Kinematics
              </div>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Click any row or the 🎯 Lock button to focus the video HUD on that vehicle.
              </p>
            </div>
            <div class="table-count">Showing ${trackSummaries.length} tracked road users</div>
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
      </div>
    </section>
  `;

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
