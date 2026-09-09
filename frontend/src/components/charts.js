/**
 * charts.js — Chart.js modal split chart (reference-style thick rounded donut).
 * Colours stay in the site theme: sage / olive / lime / ink.
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

/**
 * Render the class breakdown doughnut chart.
 * Returns { chart, colors } so the card bubbles can match segment colours.
 */
export function renderClassChart(canvasId, classSummary) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !classSummary?.length) return null;

  const labels = classSummary.map(c => c.label);
  const data = classSummary.map(c => c.tracks);
  const colors = classSummary.map((c, i) => c.color || THEME_PALETTE[i % THEME_PALETTE.length]);

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#eef2ec',
        borderWidth: 3,
        borderRadius: 14,
        spacing: 3,
        hoverBorderColor: '#080808',
        hoverBorderWidth: 2,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      layout: { padding: 18 },
      animation: {
        duration: 750,
        easing: 'easeOutQuart',
        animateRotate: true,
        animateScale: false,
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#4e5a4d',
            font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle',
            pointStyleWidth: 8,
          },
        },
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
  });

  return { chart, colors };
}
