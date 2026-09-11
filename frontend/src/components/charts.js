/**
 * charts.js — Modal split donut, pattern-filled segments with outside labels.
 * Segments grow sequentially; labels draw once the ring completes.
 */

/** Theme palette — ink → olive → lime progression + earthy anchors. */
export const THEME_PALETTE = [
  '#0b0e0b',
  '#2e3d2c',
  '#5a6f52',
  '#93a832',
  '#d7e838',
  '#77691a',
  '#7d8b7a',
  '#43564a',
];

const FALLBACK_COLOR = '#5a6f52';

export function themeColorFor(index, fallback) {
  if (fallback) return fallback;
  return THEME_PALETTE[index % THEME_PALETTE.length] || FALLBACK_COLOR;
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Darken a hex color by amount (0..1) for the 3D extrusion sides. */
function shade(hex, amount) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const f = (i) => Math.max(0, Math.round(parseInt(m[1].slice(i, i + 2), 16) * (1 - amount)));
  const to = (n) => n.toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(2))}${to(f(4))}`;
}

const PATTERN_STYLES = ['stripes', 'dots', 'cross', 'zig', 'lines', 'grid', 'rings', 'diag'];

/** Build a repeating CanvasPattern: base color + contrasting motif. */
function makePattern(base, style) {
  const s = 16;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, s, s);
  const ink = luminance(base) > 0.45 ? 'rgba(10, 14, 10, 0.42)' : 'rgba(255, 255, 255, 0.55)';
  x.strokeStyle = ink;
  x.fillStyle = ink;
  x.lineWidth = 2;
  x.lineCap = 'round';
  switch (style) {
    case 'stripes':
      x.beginPath(); x.moveTo(-4, 20); x.lineTo(20, -4); x.stroke();
      break;
    case 'diag':
      x.beginPath(); x.moveTo(-4, -4); x.lineTo(20, 20); x.stroke();
      break;
    case 'cross':
      x.beginPath(); x.moveTo(-4, 20); x.lineTo(20, -4); x.stroke();
      x.beginPath(); x.moveTo(-4, -4); x.lineTo(20, 20); x.stroke();
      break;
    case 'dots':
      [[4, 4], [12, 12]].forEach(([dx, dy]) => { x.beginPath(); x.arc(dx, dy, 2.2, 0, 7); x.fill(); });
      break;
    case 'zig':
      x.beginPath(); x.moveTo(0, 12); x.lineTo(4, 4); x.lineTo(8, 12); x.lineTo(12, 4); x.lineTo(16, 12); x.stroke();
      break;
    case 'lines':
      x.beginPath(); x.moveTo(0, 5); x.lineTo(16, 5); x.stroke();
      x.beginPath(); x.moveTo(0, 13); x.lineTo(16, 13); x.stroke();
      break;
    case 'grid':
      x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(0, 4); x.lineTo(16, 4); x.stroke();
      x.beginPath(); x.moveTo(0, 12); x.lineTo(16, 12); x.stroke();
      x.beginPath(); x.moveTo(4, 0); x.lineTo(4, 16); x.stroke();
      x.beginPath(); x.moveTo(12, 0); x.lineTo(12, 16); x.stroke();
      break;
    case 'rings':
      x.lineWidth = 1.6;
      x.beginPath(); x.arc(8, 8, 5.5, 0, 7); x.stroke();
      x.beginPath(); x.arc(0, 0, 4, 0, 7); x.stroke();
      x.beginPath(); x.arc(16, 16, 4, 0, 7); x.stroke();
      break;
    default:
      break;
  }
  const host = document.createElement('canvas').getContext('2d');
  return host.createPattern(c, 'repeat');
}

/** Plugin: 3D extrusion — darkened duplicate of each slice offset downward,
 *  so segments look like thick blocks being placed as they animate in. */
const extrusion = {
  id: 'extrusion',
  beforeDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) return;
    const colors = chart.$segColors || [];
    const DEPTH = 10;
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(8, 10, 8, 0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 8;
    meta.data.forEach((arc, i) => {
      const span = arc.endAngle - arc.startAngle;
      if (span <= 0.001) return;
      ctx.beginPath();
      ctx.arc(arc.x, arc.y + DEPTH, arc.outerRadius, arc.startAngle, arc.endAngle);
      ctx.arc(arc.x, arc.y + DEPTH, arc.innerRadius, arc.endAngle, arc.startAngle, true);
      ctx.closePath();
      ctx.fillStyle = shade(colors[i] || '#5a6f52', 0.45);
      ctx.fill();
    });
    ctx.restore();
  },
};

/** Plugin: value + name labels outside each slice with leader lines. */
const outsideLabels = {
  id: 'outsideLabels',
  afterDraw(chart) {
    if (!chart.$labelsDone) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) return;
    const data = chart.data.datasets[0].data;
    const labels = chart.data.labels || [];
    const total = data.reduce((a, b) => a + (b || 0), 0);
    if (!total) return;

    const items = [];
    meta.data.forEach((arc, i) => {
      const v = data[i] || 0;
      const pct = (v / total) * 100;
      if (pct < 3.5) return; // too small to label; still in tooltip
      const mid = (arc.startAngle + arc.endAngle) / 2;
      const ex = arc.x + Math.cos(mid) * arc.outerRadius;
      const ey = arc.y + Math.sin(mid) * arc.outerRadius;
      items.push({ i, v, pct, mid, ex, ey, side: Math.cos(mid) >= 0 ? 1 : -1, y: arc.y + Math.sin(mid) * (arc.outerRadius + 44) });
    });
    if (!items.length) return;

    // De-collide labels vertically per side.
    const MIN_GAP = 30;
    [1, -1].forEach((side) => {
      const col = items.filter((d) => d.side === side).sort((a, b) => a.y - b.y);
      for (let k = 1; k < col.length; k++) {
        if (col[k].y - col[k - 1].y < MIN_GAP) col[k].y = col[k - 1].y + MIN_GAP;
      }
    });

    const ctx = chart.ctx;
    const area = chart.chartArea;
    ctx.save();
    items.forEach((d) => {
      const lx = d.side === 1 ? area.right - 6 : area.left + 6;
      const ex = Math.max(area.left + 4, Math.min(area.right - 4, d.ex));
      const ey = Math.max(area.top + 4, Math.min(area.bottom - 4, d.ey));
      // Leader line.
      ctx.strokeStyle = 'rgba(8, 10, 8, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(lx + (d.side === 1 ? -64 : 64), d.y);
      ctx.lineTo(lx, d.y);
      ctx.stroke();
      // Value + name.
      ctx.textAlign = d.side === 1 ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#2c3a2a';
      ctx.font = "700 15px 'JetBrains Mono', monospace";
      ctx.fillText(String(d.v), lx, d.y - 3);
      ctx.fillStyle = '#47513f';
      ctx.font = "600 13px 'Inter', sans-serif";
      const name = String(labels[d.i] || '');
      ctx.fillText(name.length > 16 ? name.slice(0, 15) + '…' : name, lx, d.y + 13);
    });
    ctx.restore();
  },
};

/**
 * Render the class breakdown doughnut chart.
 * Returns { chart, colors } so the session panel can match segment colours.
 */
export function renderClassChart(canvasId, classSummary) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !classSummary?.length) return null;

  const labels = classSummary.map((c) => c.label);
  const data = classSummary.map((c) => c.tracks);
  const colors = classSummary.map((c, i) => c.color || THEME_PALETTE[i % THEME_PALETTE.length]);
  const fills = colors.map((col, i) => makePattern(col, PATTERN_STYLES[i % PATTERN_STYLES.length]));

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: fills,
        borderColor: '#eef2ec',
        borderWidth: 3,
        borderRadius: 10,
        spacing: 5,
        hoverBorderColor: '#080808',
        hoverBorderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      layout: { padding: { top: 12, bottom: 12, left: 84, right: 84 } },
      animation: {
        duration: 750,
        easing: 'easeOutBack',
        delay: (ctx) => (ctx.type === 'data' ? ctx.dataIndex * 140 : 0),
        onComplete: ({ chart }) => {
          if (!chart.$labelsDone) {
            chart.$labelsDone = true;
            chart.draw();
          }
        },
      },
      transitions: {
        active: { animation: { duration: 0 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(8, 8, 8, 0.94)',
          titleColor: '#e5ff4f',
          bodyColor: '#f1f4f0',
          borderColor: 'rgba(229, 255, 79, 0.4)',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 12,
          titleFont: { family: "'Inter', sans-serif", weight: '600' },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} vehicles (${pct}%)`;
            },
          },
        },
      },
    },
    plugins: [extrusion, outsideLabels],
  });

  chart.$segColors = colors;
  return { chart, colors };
}
