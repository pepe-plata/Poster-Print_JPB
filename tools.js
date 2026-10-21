import { CM_PER_INCH, DPI, PX_PER_CM } from './config.js';

export function toCm(value, unit) {
  return unit === 'in' ? value * CM_PER_INCH : value;
}

export function fromCm(cm, unit) {
  return unit === 'in' ? cm / CM_PER_INCH : cm;
}

export function fmt(n, decimals = 2) {
  return Number(n.toFixed(decimals)).toString();
}

export function cmToPx(cm, scale) {
  return cm * scale;
}

export function cmToPrintPx(cm) {
  return Math.round(cm * PX_PER_CM);
}

export function computeSheetGrid(posterWcm, posterHcm, cellWcm, cellHcm) {
  const cols = Math.max(1, Math.ceil(posterWcm / cellWcm - 1e-9));
  const rows = Math.max(1, Math.ceil(posterHcm / cellHcm - 1e-9));
  return { cols, rows };
}

export function createOffscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function debounce(fn, ms = 100) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export { DPI, PX_PER_CM };