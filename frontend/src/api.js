/**
 * api.js — API client for the FastAPI backend.
 */

const API_BASE = '/api';

/**
 * Upload a video file. Returns { job_id, filename }.
 */
export async function uploadVideo(file) {
  const form = new FormData();
  form.append('video', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}

/**
 * Subscribe to job progress via SSE. Returns an EventSource.
 *
 * @param {string} jobId
 * @param {object} handlers  { onProgress(data), onDone(data), onError(data) }
 * @returns {EventSource}
 */
export function subscribeProgress(jobId, { onProgress, onDone, onError }) {
  const es = new EventSource(`${API_BASE}/status/${jobId}`);

  es.addEventListener('progress', (e) => {
    onProgress?.(JSON.parse(e.data));
  });

  es.addEventListener('done', (e) => {
    onDone?.(JSON.parse(e.data));
    es.close();
  });

  es.addEventListener('error', (e) => {
    if (e.data) {
      onError?.(JSON.parse(e.data));
    } else {
      onError?.({ error: 'Connection lost' });
    }
    es.close();
  });

  return es;
}

/**
 * Fetch full results with analytics.
 */
export async function getResults(jobId) {
  const res = await fetch(`${API_BASE}/results/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch results (${res.status})`);
  return res.json();
}

/**
 * Get the annotated video URL.
 */
export function getVideoUrl(jobId) {
  return `${API_BASE}/video/${jobId}`;
}

/**
 * Get the parquet download URL.
 */
export function getDownloadUrl(jobId) {
  return `${API_BASE}/download/${jobId}`;
}
