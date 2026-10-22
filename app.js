// Orquestación de la app: estado, UI, layout, preview y PDF

import {
  PAPER_SIZES, DEFAULT_MARGINS
} from './config.js';
import {
  toCm, fmt, computeSheetGrid, debounce, downloadBlob
} from './tools.js';
import { CanvasEditor } from './canvas.js';
import { generatePdf } from './pdf.js';

// ---------- Catálogo de presets agrupado ----------
const POSTER_GROUPS = [
  {
    name: 'Cuadrado',
    items: ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7', '8x8']
  },
  {
    name: 'Horizontal',
    items: ['2x1', '3x1', '3x2', '4x1', '4x2', '4x3', '5x1', '5x2', '5x3', '5x4', '6x1', '6x2', '6x3', '6x4', '6x5']
  },
  {
    name: 'Vertical',
    items: ['1x2', '1x3', '1x4', '1x5', '1x6', '1x7', '1x8', '2x3', '2x4', '2x5', '2x6', '3x4', '3x5', '3x6', '3x7', '3x8', '4x5', '4x6', '4x7', '4x8']
  }
];

function parseId(id) {
  const m = /^(\d+)x(\d+)$/.exec(id);
  if (!m) return null;
  return { cols: parseInt(m[1], 10), rows: parseInt(m[2], 10) };
}

// ---------- Estado ----------
const state = {
  posterMode: 'preset',
  posterPresetId: '3x3',
  posterCustom: { w: 50, h: 70, unit: 'cm' },
  paperKey: 'letter',
  paperCustom: { w: 21, h: 29.7, unit: 'cm' },
  margins: { ...DEFAULT_MARGINS },
  keepAspect: true,
  imageLoaded: false,
  _applyingImgSize: false,
  _refreshingImgInputs: false,
  _imgEditingActive: false
};

// ---------- Refs DOM ----------
const $ = (id) => document.getElementById(id);
const els = {
  layout: $('layout'),
  menuBtn: $('menuBtn'),
  posterSelect: $('posterSelect'),
  posterGroups: $('posterGroups'),
  keepAspect: $('keepAspect'),
  customPosterBox: $('customPosterBox'),
  posterW: $('posterW'), posterH: $('posterH'), posterUnit: $('posterUnit'),
  paperSize: $('paperSize'),
  customPaperBox: $('customPaperBox'),
  paperW: $('paperW'), paperH: $('paperH'), paperUnit: $('paperUnit'),
  mTop: $('mTop'), mBottom: $('mBottom'), mLeft: $('mLeft'), mRight: $('mRight'),
  imageInput: $('imageInput'),
  imageActions: $('imageActions'),
  imgWcm: $('imgWcm'), imgHcm: $('imgHcm'), applyImgSizeBtn: $('applyImgSizeBtn'),
  rotateBtn: $('rotateBtn'), centerBtn: $('centerBtn'), fitBtn: $('fitBtn'),
  flipHBtn: $('flipHBtn'), flipVBtn: $('flipVBtn'),
  removeImgBtn: $('removeImgBtn'),
  summary: $('summary'),
  generatePdfBtn: $('generatePdfBtn'),
  previewPdfBtn: $('previewPdfBtn'),
  downloadPdfBtn: $('downloadPdfBtn'),
  pdfModal: $('pdfModal'),
  pdfPreview: $('pdfPreview'),
  openPdfTabBtn: $('openPdfTabBtn'),
  savePdfBtn: $('savePdfBtn'),
  pdfMobileHint: $('pdfMobileHint'),
  closeModalBtn: $('closeModalBtn'),
  statusbar: $('statusbar'),
  installBtn: $('installBtn'),
  splash: $('splash'),
  toast: $('toast')
};

// ---------- Editor de canvas ----------
const editor = new CanvasEditor(
  $('canvas'),
  $('canvasWrap'),
  $('emptyState'),
  () => {
    updateSummary();
  }
);

let lastPdfBlob = null;
let lastPdfUrl = null;

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg, ms = 3500) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  // Forzar reflow para reiniciar la animación
  void els.toast.offsetWidth;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => els.toast.classList.add('hidden'), 300);
  }, ms);
}

// ---------- Refresco de inputs de tamaño ----------
function refreshImgSizeInputs(force = false) {
  if (!editor.image) {
    els.imgWcm.value = '';
    els.imgHcm.value = '';
    els.imgWcm.disabled = true;
    els.imgHcm.disabled = true;
    els.applyImgSizeBtn.disabled = true;
    return;
  }
  els.imgWcm.disabled = false;
  els.imgHcm.disabled = false;
  els.applyImgSizeBtn.disabled = false;

  if (state._applyingImgSize) return;
  if (state._refreshingImgInputs) return;
  if (state._imgEditingActive && !force) return;

  const sz = editor.getImageSizeCm();
  if (!sz) return;

  const active = document.activeElement;

  state._refreshingImgInputs = true;
  if (active !== els.imgWcm) {
    els.imgWcm.value = Number(sz.w.toFixed(2));
  }
  if (active !== els.imgHcm) {
    els.imgHcm.value = Number(sz.h.toFixed(2));
  }
  state._refreshingImgInputs = false;
}

// ---------- Aplicar tamaño manual ----------
function applyImgSizeFromInputs() {
  if (!editor.image || state._applyingImgSize) return;

  const w = Number(els.imgWcm.value);
  const h = Number(els.imgHcm.value);
  if (!w || !h || w <= 0 || h <= 0) return;

  state._applyingImgSize = true;
  try {
    editor.setImageSizeCm(w, h);
  } finally {
    state._applyingImgSize = false;
  }

  refreshImgSizeInputs(true);
}

// ---------- Thumbnails agrupados ----------
function buildPosterGroups() {
  els.posterGroups.innerHTML = '';
  for (const group of POSTER_GROUPS) {
    const wrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'poster-group-title';
    title.textContent = group.name;
    wrap.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'poster-grid';

    for (const id of group.items) {
      const dims = parseId(id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'poster-item';
      item.dataset.id = id;
      item.innerHTML = posterThumbSvg(dims.cols, dims.rows) +
        `<span class="label">${id.replace('x', '×')}</span>`;
      item.addEventListener('click', () => {
        els.posterSelect.value = id;
        onPosterSelectChange();
      });
      grid.appendChild(item);
    }
    wrap.appendChild(grid);
    els.posterGroups.appendChild(wrap);
  }
  updatePosterActive();
}

function updatePosterActive() {
  const activeId = state.posterMode === 'custom' ? 'custom' : state.posterPresetId;
  document.querySelectorAll('.poster-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === activeId);
  });
}

function posterThumbSvg(cols, rows) {
  const W = 80, H = 80, pad = 6;
  const innerW = W - pad * 2, innerH = H - pad * 2;
  const cw = innerW / cols, ch = innerH / rows;
  let grid = '';
  grid += `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="#e0f2fe"/>`;
  grid += `<circle cx="${pad + innerW * 0.75}" cy="${pad + innerH * 0.22}" r="${innerH * 0.08}" fill="#fde68a"/>`;
  grid += `<path d="M${pad} ${pad + innerH * 0.75} L${pad + innerW * 0.3} ${pad + innerH * 0.45} L${pad + innerW * 0.55} ${pad + innerH * 0.7} L${pad + innerW * 0.75} ${pad + innerH * 0.5} L${pad + innerW} ${pad + innerH * 0.75} L${pad + innerW} ${pad + innerH} L${pad} ${pad + innerH} Z" fill="#86efac"/>`;
  grid += `<rect x="${pad}" y="${pad + innerH * 0.75}" width="${innerW}" height="${innerH * 0.25}" fill="#4ade80"/>`;
  for (let i = 1; i < cols; i++) {
    const x = pad + i * cw;
    grid += `<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad + innerH}" stroke="#22d3ee" stroke-width="1" stroke-dasharray="2 2"/>`;
  }
  for (let j = 1; j < rows; j++) {
    const y = pad + j * ch;
    grid += `<line x1="${pad}" y1="${y}" x2="${pad + innerW}" y2="${y}" stroke="#22d3ee" stroke-width="1" stroke-dasharray="2 2"/>`;
  }
  grid += `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#94a3b8" stroke-width="1.2"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${grid}</svg>`;
}

// ---------- Config helpers ----------
function getPaperCm() {
  if (state.paperKey === 'custom') {
    return {
      w: toCm(state.paperCustom.w, state.paperCustom.unit),
      h: toCm(state.paperCustom.h, state.paperCustom.unit)
    };
  }
  const p = PAPER_SIZES[state.paperKey];
  return { w: p.w, h: p.h };
}

function getMarginsCm() {
  return {
    top: Number(state.margins.top) || 0,
    bottom: Number(state.margins.bottom) || 0,
    left: Number(state.margins.left) || 0,
    right: Number(state.margins.right) || 0
  };
}

function getCellCm() {
  const paper = getPaperCm();
  const m = getMarginsCm();
  return {
    w: Math.max(0.1, paper.w - m.left - m.right),
    h: Math.max(0.1, paper.h - m.top - m.bottom)
  };
}

function getGridConfig() {
  const cell = getCellCm();
  if (state.posterMode === 'custom') {
    const pw = toCm(state.posterCustom.w, state.posterCustom.unit);
    const ph = toCm(state.posterCustom.h, state.posterCustom.unit);
    const g = computeSheetGrid(pw, ph, cell.w, cell.h);
    return { ...g, mode: 'custom', posterWcm: pw, posterHcm: ph };
  }
  const dims = parseId(state.posterPresetId) || { cols: 3, rows: 3 };
  return {
    cols: dims.cols,
    rows: dims.rows,
    mode: 'preset',
    posterWcm: dims.cols * cell.w,
    posterHcm: dims.rows * cell.h
  };
}

// ---------- Refresh layout ----------
function refreshLayout() {
  const cell = getCellCm();
  const grid = getGridConfig();

  editor.setKeepAspect(state.keepAspect);
  editor.setLayout({
    cols: grid.cols,
    rows: grid.rows,
    cellWcm: cell.w,
    cellHcm: cell.h
  });

  updateSummary();
  updateStatusbar(grid, cell);
  updateButtons();
  refreshImgSizeInputs();
}

function updateSummary() {
  const cell = getCellCm();
  const grid = getGridConfig();
  const paper = getPaperCm();
  const total = grid.cols * grid.rows;
  els.summary.innerHTML = `
    <div class="row-item"><span>Hojas:</span><strong>${grid.cols} × ${grid.rows} = ${total}</strong></div>
    <div class="row-item"><span>Área imprimible / hoja:</span><strong>${fmt(cell.w)} × ${fmt(cell.h)} cm</strong></div>
    <div class="row-item"><span>Área total imprimible:</span><strong>${fmt(cell.w * grid.cols)} × ${fmt(cell.h * grid.rows)} cm</strong></div>
    <div class="row-item"><span>Hoja:</span><strong>${fmt(paper.w)} × ${fmt(paper.h)} cm</strong></div>
    ${state.posterMode === 'custom'
      ? `<div class="row-item"><span>Póster solicitado:</span><strong>${fmt(grid.posterWcm)} × ${fmt(grid.posterHcm)} cm</strong></div>`
      : ''}
  `;
}

function updateStatusbar(grid, cell) {
  const paper = getPaperCm();
  els.statusbar.innerHTML = `
    <span class="chip">${grid.cols}×${grid.rows} hojas</span>
    <span>Hoja: ${fmt(paper.w)} × ${fmt(paper.h)} cm</span>
    <span>Área imprimible: ${fmt(cell.w)} × ${fmt(cell.h)} cm</span>
    ${editor.image ? `<span>Imagen: ${editor.imgNaturalW} × ${editor.imgNaturalH} px</span>` : ''}
  `;
}

function updateButtons() {
  const hasImg = !!editor.image;
  els.generatePdfBtn.disabled = !hasImg;
  if (!hasImg) {
    els.previewPdfBtn.classList.add('hidden');
    els.downloadPdfBtn.classList.add('hidden');
    els.imageActions.classList.add('hidden');
  } else {
    els.imageActions.classList.remove('hidden');
  }
  els.imgWcm.disabled = !hasImg;
  els.imgHcm.disabled = !hasImg;
  els.applyImgSizeBtn.disabled = !hasImg;
}

// ---------- Transformación de imagen para PDF ----------
function getImageTransformCm() {
  const scale = editor.scale > 0 ? editor.scale : 1;
  return {
    x: editor.img.x / scale,
    y: editor.img.y / scale,
    w: editor.img.w / scale,
    h: editor.img.h / scale,
    rotation: editor.img.rotation,
    flipH: editor.img.flipH,
    flipV: editor.img.flipV
  };
}

// ---------- Generación de PDF ----------
async function buildPdfBlob() {
  if (!editor.image) throw new Error('No hay imagen');
  const cell = getCellCm();
  const grid = getGridConfig();
  const paper = getPaperCm();
  const margins = getMarginsCm();

  editor._clampPosition();
  const imgTransform = getImageTransformCm();

  return generatePdf({
    image: editor.image,
    layout: {
      cols: grid.cols,
      rows: grid.rows,
      cellWcm: cell.w,
      cellHcm: cell.h
    },
    paper,
    margins,
    imgTransform
  });
}

async function onGeneratePdf() {
  try {
    setBusy(true);
    lastPdfBlob = await buildPdfBlob();
    if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
    lastPdfUrl = URL.createObjectURL(lastPdfBlob);
    els.previewPdfBtn.classList.remove('hidden');
    els.downloadPdfBtn.classList.remove('hidden');
    openPdfModal();
  } catch (err) {
    console.error(err);
    alert('Error generando PDF: ' + err.message);
  } finally {
    setBusy(false);
  }
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function openPdfModal() {
  if (!lastPdfUrl) return;

  if (isMobile()) {
    els.pdfPreview.classList.add('hidden');
    els.pdfMobileHint.classList.remove('hidden');
  } else {
    els.pdfPreview.classList.remove('hidden');
    els.pdfMobileHint.classList.add('hidden');
    els.pdfPreview.src = lastPdfUrl;
  }

  els.pdfModal.classList.remove('hidden');
}

function closePdfModal() {
  els.pdfModal.classList.add('hidden');
  els.pdfPreview.src = 'about:blank';
}

function openPdfInNewTab() {
  if (!lastPdfUrl) return;
  const w = window.open(lastPdfUrl, '_blank');
  if (!w) {
    onDownloadPdf();
    showToast('No se pudo abrir la pestaña. Se descargó el PDF.');
    closePdfModal();
    return;
  }
  // Cerrar modal tras abrir
  closePdfModal();
  if (isMobile()) {
    showToast('PDF abierto. Si no ves la barra de direcciones, usa Guardar PDF y ábrelo desde Archivos.');
  } else {
    showToast('PDF abierto en nueva pestaña.');
  }
}

/**
 * Guardar PDF:
 * - En Android y desktop Chromium: muestra el diálogo nativo "Guardar como"
 *   (Storage Access Framework en Android, File System Access API en desktop).
 * - Fallback: descarga directa.
 * Al terminar con éxito, cierra el modal y muestra un toast informativo.
 */
async function savePdf() {
  if (!lastPdfBlob) return;

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `poster-${ts}.pdf`;

  // Intentar el diálogo nativo
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'PDF',
          accept: { 'application/pdf': ['.pdf'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(lastPdfBlob);
      await writable.close();

      closePdfModal();
      if (isMobile()) {
        showToast('PDF guardado. Ábrelo desde la app Archivos para imprimirlo o compartirlo.', 5000);
      } else {
        showToast('PDF guardado correctamente.', 4000);
      }
      return;
    } catch (err) {
      // Cancelado por el usuario
      if (err && err.name === 'AbortError') return;
      console.warn('showSaveFilePicker falló, usando descarga:', err);
    }
  }

  // Fallback: descarga directa
  downloadBlob(lastPdfBlob, filename);
  closePdfModal();
  if (isMobile()) {
    showToast('Descargando PDF. Revisa la barra de notificaciones o la carpeta Descargas.', 5000);
  } else {
    showToast('Descargando PDF…', 3500);
  }
}

function onDownloadPdf() {
  if (lastPdfBlob) {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadBlob(lastPdfBlob, `poster-${ts}.pdf`);
    showToast('Descargando PDF…', 3500);
  }
}

function setBusy(b) {
  els.generatePdfBtn.disabled = b || !editor.image;
  els.generatePdfBtn.textContent = b ? 'Generando…' : 'Generar PDF';
}

// ---------- Combo póster ----------
function onPosterSelectChange() {
  const val = els.posterSelect.value;
  if (val === 'custom') {
    state.posterMode = 'custom';
    state.posterPresetId = null;
    els.customPosterBox.classList.remove('hidden');
    requestAnimationFrame(() => {
      try {
        els.customPosterBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {
        els.customPosterBox.scrollIntoView();
      }
      try {
        els.posterW.focus({ preventScroll: true });
        els.posterW.select();
      } catch (_) { /* noop */ }
    });
  } else {
    state.posterMode = 'preset';
    state.posterPresetId = val;
    els.customPosterBox.classList.add('hidden');
  }
  updatePosterActive();
  refreshLayout();
}

// ---------- Helpers de edición de tamaño de imagen ----------
function isInsideImgSizeZone(el) {
  return !!el && (
    el === els.imgWcm ||
    el === els.imgHcm ||
    el === els.applyImgSizeBtn ||
    (els.imgWcm.contains && els.imgWcm.contains(el)) ||
    (els.imgHcm.contains && els.imgHcm.contains(el)) ||
    (els.applyImgSizeBtn.contains && els.applyImgSizeBtn.contains(el))
  );
}

function markImgEditingStart() {
  state._imgEditingActive = true;
}

function markImgEditingEndIfOutside(target) {
  if (!state._imgEditingActive) return;
  if (isInsideImgSizeZone(target)) return;
  state._imgEditingActive = false;
}

// ---------- Seleccionar todo al enfocar inputs numéricos ----------
function attachSelectAllOnFocus(input) {
  if (!input) return;
  input.addEventListener('focus', () => {
    setTimeout(() => {
      try { input.select(); } catch (_) { /* noop */ }
    }, 0);
  });
  input.addEventListener('click', () => {
    try { input.select(); } catch (_) { /* noop */ }
  });
}

// ---------- Eventos de UI ----------
function bindEvents() {
  els.menuBtn.addEventListener('click', () => {
    els.layout.classList.toggle('sidebar-collapsed');
    setTimeout(() => {
      editor._resizeCanvas();
      if (editor.image) {
        editor._clampPosition();
        editor.render();
        editor._updateOverlay();
      } else {
        editor.render();
      }
    }, 220);
  });

  els.posterSelect.addEventListener('change', onPosterSelectChange);

  els.posterW.addEventListener('input', () => {
    state.posterCustom.w = Number(els.posterW.value) || 1;
    if (state.posterMode === 'custom') refreshLayout();
  });
  els.posterH.addEventListener('input', () => {
    state.posterCustom.h = Number(els.posterH.value) || 1;
    if (state.posterMode === 'custom') refreshLayout();
  });
  els.posterUnit.addEventListener('change', () => {
    state.posterCustom.unit = els.posterUnit.value;
    if (state.posterMode === 'custom') refreshLayout();
  });

  els.keepAspect.addEventListener('change', () => {
    state.keepAspect = els.keepAspect.checked;
    editor.setKeepAspect(state.keepAspect);
  });

  els.paperSize.addEventListener('change', () => {
    state.paperKey = els.paperSize.value;
    els.customPaperBox.classList.toggle('hidden', state.paperKey !== 'custom');
    refreshLayout();
  });
  els.paperW.addEventListener('input', () => {
    state.paperCustom.w = Number(els.paperW.value) || 1;
    if (state.paperKey === 'custom') refreshLayout();
  });
  els.paperH.addEventListener('input', () => {
    state.paperCustom.h = Number(els.paperH.value) || 1;
    if (state.paperKey === 'custom') refreshLayout();
  });
  els.paperUnit.addEventListener('change', () => {
    state.paperCustom.unit = els.paperUnit.value;
    if (state.paperKey === 'custom') refreshLayout();
  });

  const marginInputs = [
    ['mTop', 'top'], ['mBottom', 'bottom'], ['mLeft', 'left'], ['mRight', 'right']
  ];
  for (const [id, key] of marginInputs) {
    els[id].addEventListener('input', () => {
      state.margins[key] = Number(els[id].value) || 0;
      refreshLayout();
    });
  }

  [
    els.posterW, els.posterH,
    els.paperW, els.paperH,
    els.mTop, els.mBottom, els.mLeft, els.mRight,
    els.imgWcm, els.imgHcm
  ].forEach(attachSelectAllOnFocus);

  // --- Carga de imagen ---
  els.imageInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await editor.loadImageFile(file);
      state.imageLoaded = true;
      const cell = getCellCm();
      const grid = getGridConfig();
      editor.setLayout({
        cols: grid.cols,
        rows: grid.rows,
        cellWcm: cell.w,
        cellHcm: cell.h
      });
      editor.render();
      editor._updateOverlay();
      updateButtons();
      updateSummary();
      updateStatusbar(grid, cell);
      refreshImgSizeInputs(true);
      els.imageInput.value = '';
    } catch (err) {
      console.error(err);
      alert('No se pudo cargar la imagen.');
    }
  });

  // --- Inputs manuales de tamaño de la imagen ---
  els.imgWcm.addEventListener('input', () => { /* dejar teclear */ });
  els.imgHcm.addEventListener('input', () => { /* dejar teclear */ });

  ['pointerdown', 'focusin', 'touchstart'].forEach((ev) => {
    els.imgWcm.addEventListener(ev, markImgEditingStart, { passive: true });
    els.imgHcm.addEventListener(ev, markImgEditingStart, { passive: true });
    els.applyImgSizeBtn.addEventListener(ev, markImgEditingStart, { passive: true });
  });

  document.addEventListener('pointerdown', (e) => {
    markImgEditingEndIfOutside(e.target);
  }, { passive: true });

  const onEnterApply = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.applyImgSizeBtn.click();
    }
  };
  els.imgWcm.addEventListener('keydown', onEnterApply);
  els.imgHcm.addEventListener('keydown', onEnterApply);

  els.applyImgSizeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    applyImgSizeFromInputs();
  });

  els.rotateBtn.addEventListener('click', () => {
    editor.rotate90();
    refreshImgSizeInputs(true);
  });
  els.centerBtn.addEventListener('click', () => {
    editor.centerImage();
    refreshImgSizeInputs(true);
  });
  els.fitBtn.addEventListener('click', () => {
    editor.fitImage();
    refreshImgSizeInputs(true);
  });
  els.flipHBtn.addEventListener('click', () => {
    editor.flipHorizontal();
    refreshImgSizeInputs(true);
  });
  els.flipVBtn.addEventListener('click', () => {
    editor.flipVertical();
    refreshImgSizeInputs(true);
  });
  els.removeImgBtn.addEventListener('click', () => {
    editor.removeImage();
    state.imageLoaded = false;
    state._imgEditingActive = false;
    updateButtons();
    refreshImgSizeInputs(true);
    els.imageInput.value = '';
  });

  els.generatePdfBtn.addEventListener('click', onGeneratePdf);
  els.previewPdfBtn.addEventListener('click', openPdfModal);
  els.downloadPdfBtn.addEventListener('click', onDownloadPdf);
  els.openPdfTabBtn.addEventListener('click', openPdfInNewTab);
  els.savePdfBtn.addEventListener('click', savePdf);
  els.closeModalBtn.addEventListener('click', closePdfModal);
  els.pdfModal.addEventListener('click', (e) => {
    if (e.target === els.pdfModal) closePdfModal();
  });

  window.addEventListener('resize', debounce(() => {
    editor._resizeCanvas();
    if (editor.image) {
      editor._clampPosition();
      editor.render();
      editor._updateOverlay();
    } else {
      editor.render();
    }
  }, 150));
}

// ---------- PWA install ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  els.installBtn.classList.remove('hidden');
});
els.installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.classList.add('hidden');
});

// ---------- Splash ----------
function hideSplash() {
  if (!els.splash) return;
  els.splash.classList.add('hide');
  setTimeout(() => {
    if (els.splash && els.splash.parentNode) {
      els.splash.parentNode.removeChild(els.splash);
    }
  }, 450);
}

// ---------- Init ----------
function init() {
  buildPosterGroups();
  bindEvents();

  els.keepAspect.checked = state.keepAspect;
  els.paperSize.value = state.paperKey;
  els.posterSelect.value = state.posterPresetId;
  els.mTop.value = state.margins.top;
  els.mBottom.value = state.margins.bottom;
  els.mLeft.value = state.margins.left;
  els.mRight.value = state.margins.right;
  els.imgWcm.disabled = true;
  els.imgHcm.disabled = true;
  els.applyImgSizeBtn.disabled = true;

  if (state.posterMode === 'custom') {
    els.customPosterBox.classList.remove('hidden');
  } else {
    els.customPosterBox.classList.add('hidden');
  }

  refreshLayout();
  updateButtons();
  updatePosterActive();
  refreshImgSizeInputs(true);

  requestAnimationFrame(() => {
    if (editor.canvas.width < 2 || editor.canvas.height < 2) {
      refreshLayout();
    }
  });

  setTimeout(hideSplash, 2000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

init();