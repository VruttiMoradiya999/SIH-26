/**
 * charts.js — Chart.js modal split chart.
 */

const CLASS_COLORS = {
  'car': '#38bdf8',
  'motorcycle': '#f43f5e',
  'pedestrian': '#94a3b8',
  'cyclist': '#10b981',
  'bus': '#a855f7',
  'LGV': '#06b6d4',
  'HGV': '#f97316',
  'three-wheeler': '#eab308',
};

const FALLBACK_COLOR = '#64748b';

/**
 * Render the class breakdown doughnut chart.
 */
export function renderClassChart(canvasId, classSummary) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !classSummary?.length) return null;

  const labels = classSummary.map(c => c.label);
  const data = classSummary.map(c => c.tracks);
  const colors = classSummary.map(c => c.color || CLASS_COLORS[c.class_group] || FALLBACK_COLOR);

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: 'rgba(10, 14, 23, 0.8)',
        borderWidth: 2,
        hoverBorderColor: '#fff',
        hoverBorderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: "'Inter', sans-serif", size: 12, weight: '500' },
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
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
  });
}
