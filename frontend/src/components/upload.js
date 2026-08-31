/**
 * upload.js — Drag-and-drop video upload component.
 */

export function renderUpload(container, { onFileSelected }) {
  container.innerHTML = `
    <section class="upload-section">
      <div class="container">
        <h1 class="upload-title animate-in">
          Drone Traffic<br><span class="gradient">Analytics</span>
        </h1>
        <p class="upload-subtitle animate-in animate-in-delay-1">
          Upload aerial drone footage and get instant AI-powered vehicle detection,
          multi-object tracking, and traffic analytics.
        </p>

        <div class="upload-zone animate-in animate-in-delay-2" id="upload-zone">
          <span class="upload-icon">🎬</span>
          <p class="upload-label">Drop your video here</p>
          <p class="upload-hint">or click to browse • MP4, AVI, MOV supported</p>
          <input type="file" class="upload-input" id="upload-input" accept="video/*" />
        </div>

        <div class="upload-features animate-in animate-in-delay-3">
          <div class="feature-card">
            <div class="feature-icon">🔍</div>
            <div class="feature-title">YOLOv11 Detection</div>
            <div class="feature-desc">VisDrone-tuned model with tiled inference for small objects</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🛤️</div>
            <div class="feature-title">ByteTrack</div>
            <div class="feature-desc">Multi-object tracking with ID persistence across frames</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <div class="feature-title">Analytics</div>
            <div class="feature-desc">Class breakdown, speed estimates, and track summaries</div>
          </div>
        </div>
      </div>
    </section>
  `;

  const zone = container.querySelector('#upload-zone');
  const input = container.querySelector('#upload-input');

  // Click to browse
  zone.addEventListener('click', () => input.click());

  // File selected
  input.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  });

  // Drag & drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  });
}
