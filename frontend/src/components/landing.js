/**
 * landing.js — Marketing hero landing page (reference-style).
 * Get Started → upload view. Secondary scrolls to How it works.
 */

export function renderLanding(container, { onGetStarted }) {
  container.innerHTML = `
    <section class="hero-section">
      <div class="container">
      <div class="hero-sheet">
      <div class="hero-grid">
        <div class="hero-copy animate-in">
          <span class="hero-eyebrow">Drone Vision That Measures Traffic</span>
          <h1 class="hero-title">
            Aerial Traffic<br>Intelligence<span class="hero-dot">.</span>
          </h1>
          <p class="hero-sub">
            Upload drone footage and get vehicle detection, multi-object
            tracking, and turning-movement analytics — from runway to report
            in minutes.
          </p>
          <div class="hero-actions">
            <button class="btn btn-dark btn-lg" id="btn-get-started">Get Started</button>
            <button class="hero-demo" id="btn-see-how">
              <span class="hero-play">▶</span>
              <span>See how it works</span>
            </button>
          </div>
          <div class="hero-meta">
            <span><strong>YOLO11s</strong> VisDrone-tuned</span>
            <span class="hero-sep"></span>
            <span><strong>ByteTrack</strong> ID persistence</span>
            <span class="hero-sep"></span>
            <span><strong>10&nbsp;Hz</strong> trajectories</span>
          </div>
        </div>

        <div class="hero-visual animate-in">
          <div class="hero-blob" aria-hidden="true"></div>
          <div class="hero-img-wrap">
            <img class="hero-img" src="/hero-traffic.jpg" alt="Drone view of traffic with live vehicle tracking overlays" />
            <div class="hero-chip chip-a">
              <span class="chip-dot"></span>
              <span>Live tracking overlays</span>
            </div>
            <div class="hero-chip chip-b">
              <span class="chip-dot"></span>
              <span>Speed per vehicle</span>
            </div>
          </div>
        </div>
      </div>

      <div id="how-it-works">
        <div class="hero-steps">
          <div class="hero-step">
            <div class="hero-step-num">01</div>
            <div class="hero-step-title">Upload footage</div>
            <div class="hero-step-desc">Drop in MP4, AVI or MOV drone video.</div>
          </div>
          <div class="hero-step">
            <div class="hero-step-num">02</div>
            <div class="hero-step-title">AI tracks traffic</div>
            <div class="hero-step-desc">YOLO11s detection with ByteTrack IDs.</div>
          </div>
          <div class="hero-step">
            <div class="hero-step-num">03</div>
            <div class="hero-step-title">Explore insight</div>
            <div class="hero-step-desc">Modal split, kinematics and lock-on HUD.</div>
          </div>
        </div>
      </div>
      </div>
      </div>
    </section>
  `;

  container.querySelector('#btn-get-started').addEventListener('click', () => {
    onGetStarted?.();
  });

  container.querySelector('#btn-see-how').addEventListener('click', () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
