// Gestión del canvas de previsualización y manipulación de la imagen

import { clamp } from './tools.js';

export class CanvasEditor {
  constructor(canvas, wrap, emptyState, onImageChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrap = wrap;
    this.emptyState = emptyState;
    this.onImageChange = onImageChange || (() => {});

    this.image = null;
    this.imgNaturalW = 0;
    this.imgNaturalH = 0;

    this.cols = 1;
    this.rows = 1;
    this.cellWcm = 0;
    this.cellHcm = 0;
    this.totalWcm = 0;
    this.totalHcm = 0;

    this.scale = 1;

    // Caja LOCAL (sin rotar). w/h = ancho/alto del contenido ANTES de rotar.
    this.img = { x: 0, y: 0, w: 0, h: 0, rotation: 0, flipH: false, flipV: false };

    this.dragMode = null;
    this.dragStart = null;
    this.selected = false;
    this.keepAspect = true;

    this.handles = [];
    this.labelEl = null;

    this._pendingFit = false;

    this._bindEvents();
    this._createOverlay();
    this._resizeCanvas();
  }

  setLayout({ cols, rows, cellWcm, cellHcm }) {
    this.cols = Math.max(1, cols | 0);
    this.rows = Math.max(1, rows | 0);
    this.cellWcm = Math.max(0.1, cellWcm);
    this.cellHcm = Math.max(0.1, cellHcm);
    this.totalWcm = this.cols * this.cellWcm;
    this.totalHcm = this.rows * this.cellHcm;

    this._resizeCanvas();

    if (this.image) this.fitImage();
    else this.render();
  }

  setKeepAspect(v) {
    this.keepAspect = !!v;
  }

  /** Resetea TODO el estado de la imagen */
  _resetImgState() {
    this.img = { x: 0, y: 0, w: 0, h: 0, rotation: 0, flipH: false, flipV: false };
    this.selected = false;
    this.dragMode = null;
    this.dragStart = null;
  }

  async loadImageFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      // Reset duro de estado de imagen para evitar residuos de la anterior
      this._resetImgState();

      this.image = img;
      this.imgNaturalW = img.naturalWidth || 1;
      this.imgNaturalH = img.naturalHeight || 1;

      if (this.canvas.width < 2 || this.canvas.height < 2) this._resizeCanvas();

      this.fitImage();
      this.emptyState.classList.add('hidden');
      this.onImageChange();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  removeImage() {
    this._resetImgState();
    this.image = null;
    this.imgNaturalW = 0;
    this.imgNaturalH = 0;
    this.emptyState.classList.remove('hidden');
    this._updateOverlay();
    this.render();
    this.onImageChange();
  }

  _isSwap() {
    const r = ((this.img.rotation % 360) + 360) % 360;
    return r === 90 || r === 270;
  }

  _visualBounds() {
    const { x, y, w, h } = this.img;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (this._isSwap()) {
      return { x: cx - h / 2, y: cy - w / 2, w: h, h: w, cx, cy };
    }
    return { x, y, w, h, cx, cy };
  }

  fitImage() {
    if (!this.image) return;

    const availW = this.canvas.width;
    const availH = this.canvas.height;
    if (availW < 2 || availH < 2) {
      this._pendingFit = true;
      return;
    }
    this._pendingFit = false;

    const swap = this._isSwap();
    const natW = this.imgNaturalW;
    const natH = this.imgNaturalH;

    if (this.keepAspect) {
      const s = swap
        ? Math.min(availW / natH, availH / natW)
        : Math.min(availW / natW, availH / natH);
      this.img.w = natW * s;
      this.img.h = natH * s;
    } else {
      this.img.w = swap ? availH : availW;
      this.img.h = swap ? availW : availH;
    }

    this.img.x = (availW - this.img.w) / 2;
    this.img.y = (availH - this.img.h) / 2;

    this._clampPosition();
    this.render();
    this._updateOverlay();
  }

  /**
   * Fija el tamaño VISUAL de la imagen en cm, manteniendo el centro.
   * Si keepAspect está activo, el eje que el usuario no cambió se ajusta solo.
   * @param {number|null} wCm  ancho visual en cm (null = no cambiar)
   * @param {number|null} hCm  alto visual en cm (null = no cambiar)
   */
  setImageSizeCm(wCm, hCm) {
    if (!this.image) return;
    const vb = this._visualBounds();
    const s = this.scale;

    let newVisW = vb.w;
    let newVisH = vb.h;

    if (wCm != null && wCm > 0) newVisW = wCm * s;
    if (hCm != null && hCm > 0) newVisH = hCm * s;

    if (this.keepAspect) {
      const ar = vb.w / vb.h; // relación visual original
      if (wCm != null && hCm == null) {
        newVisH = newVisW / ar;
      } else if (hCm != null && wCm == null) {
        newVisW = newVisH * ar;
      } else if (wCm != null && hCm != null) {
        // ambos: ajustar el que cambió más respecto al actual
        const changeW = Math.abs(newVisW - vb.w);
        const changeH = Math.abs(newVisH - vb.h);
        if (changeW >= changeH) newVisH = newVisW / ar;
        else newVisW = newVisH * ar;
      }
    }

    const minSize = 20;
    newVisW = Math.max(minSize, newVisW);
    newVisH = Math.max(minSize, newVisH);

    const swap = this._isSwap();
    const localW = swap ? newVisH : newVisW;
    const localH = swap ? newVisW : newVisH;

    this.img.w = localW;
    this.img.h = localH;
    this.img.x = vb.cx - localW / 2;
    this.img.y = vb.cy - localH / 2;

    this._clampPosition();
    this.render();
    this._updateOverlay();
    this.onImageChange();
  }

  /** Devuelve el tamaño VISUAL de la imagen en cm */
  getImageSizeCm() {
    if (!this.image) return null;
    const vb = this._visualBounds();
    return { w: vb.w / this.scale, h: vb.h / this.scale };
  }

  rotate90() {
    if (!this.image) return;
    const cx = this.img.x + this.img.w / 2;
    const cy = this.img.y + this.img.h / 2;

    this.img.rotation = (this.img.rotation + 90) % 360;

    this.img.x = cx - this.img.w / 2;
    this.img.y = cy - this.img.h / 2;
    this._clampPosition();

    this.render();
    this._updateOverlay();
    this.onImageChange();
  }

  flipHorizontal() {
    if (!this.image) return;
    this.img.flipH = !this.img.flipH;
    this.render();
    this._updateOverlay();
    this.onImageChange();
  }

  flipVertical() {
    if (!this.image) return;
    this.img.flipV = !this.img.flipV;
    this.render();
    this._updateOverlay();
    this.onImageChange();
  }

  centerImage() {
    if (!this.image) return;
    this.img.x = (this.canvas.width - this.img.w) / 2;
    this.img.y = (this.canvas.height - this.img.h) / 2;
    this._clampPosition();
    this.render();
    this._updateOverlay();
  }

  _clampPosition() {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const vb = this._visualBounds();
    if (vb.w <= cw) {
      const vx = clamp(vb.x, 0, cw - vb.w);
      this.img.x += vx - vb.x;
    } else {
      const vx = clamp(vb.x, cw - vb.w, 0);
      this.img.x += vx - vb.x;
    }
    const vb2 = this._visualBounds();
    if (vb2.h <= ch) {
      const vy = clamp(vb2.y, 0, ch - vb2.h);
      this.img.y += vy - vb2.y;
    } else {
      const vy = clamp(vb2.y, ch - vb2.h, 0);
      this.img.y += vy - vb2.y;
    }
  }

  _resizeCanvas() {
    const totalW = this.totalWcm > 0 ? this.totalWcm : 21.59;
    const totalH = this.totalHcm > 0 ? this.totalHcm : 27.94;

    const wrapRect = this.wrap.getBoundingClientRect();
    const availW = Math.max(100, (wrapRect.width || 600) - 48);
    const availH = Math.max(100, (wrapRect.height || 600) - 48);

    const scale = Math.min(availW / totalW, availH / totalH);
    const pxW = Math.max(2, Math.round(totalW * scale));
    const pxH = Math.max(2, Math.round(totalH * scale));

    this.scale = scale;
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    this.canvas.style.width = pxW + 'px';
    this.canvas.style.height = pxH + 'px';
  }

  render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw <= 0 || ch <= 0) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    if (this.image && this.img.w > 0 && this.img.h > 0) {
      ctx.save();
      const cx = this.img.x + this.img.w / 2;
      const cy = this.img.y + this.img.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((this.img.rotation * Math.PI) / 180);
      ctx.scale(this.img.flipH ? -1 : 1, this.img.flipV ? -1 : 1);
      ctx.drawImage(this.image, -this.img.w / 2, -this.img.h / 2, this.img.w, this.img.h);
      ctx.restore();
    }

    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    const cwp = cw / this.cols;
    const chp = ch / this.rows;
    for (let i = 1; i < this.cols; i++) {
      const x = Math.round(i * cwp) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }
    for (let j = 1; j < this.rows; j++) {
      const y = Math.round(j * chp) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(14,165,233,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    if (this.selected && this.image) {
      const vb = this._visualBounds();
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(vb.x, vb.y, vb.w, vb.h);
      ctx.setLineDash([]);
    }

    this._updateOverlay();
  }

  _createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'absolute';
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.zIndex = '4';
    this.wrap.appendChild(this.overlay);

    const mk = (name) => {
      const h = document.createElement('div');
      h.className = 'handle';
      h.dataset.handle = name;
      h.style.pointerEvents = 'none';
      h.style.cursor = name === 'tl' || name === 'br' ? 'nwse-resize' : 'nesw-resize';
      this.overlay.appendChild(h);
      this.handles.push(h);
      return h;
    };
    mk('tl'); mk('tr'); mk('bl'); mk('br');

    this.labelEl = document.createElement('div');
    this.labelEl.style.position = 'absolute';
    this.labelEl.style.background = 'rgba(15,23,42,.85)';
    this.labelEl.style.color = '#fff';
    this.labelEl.style.padding = '3px 8px';
    this.labelEl.style.borderRadius = '6px';
    this.labelEl.style.fontSize = '11px';
    this.labelEl.style.fontWeight = '600';
    this.labelEl.style.whiteSpace = 'nowrap';
    this.labelEl.style.pointerEvents = 'none';
    this.labelEl.style.display = 'none';
    this.overlay.appendChild(this.labelEl);
  }

  _updateOverlay() {
    if (!this.image) {
      this.overlay.style.display = 'none';
      return;
    }
    this.overlay.style.display = 'block';

    const cRect = this.canvas.getBoundingClientRect();
    const wRect = this.wrap.getBoundingClientRect();
    const offX = cRect.left - wRect.left + this.wrap.scrollLeft;
    const offY = cRect.top - wRect.top + this.wrap.scrollTop;

    this.overlay.style.left = offX + 'px';
    this.overlay.style.top = offY + 'px';
    this.overlay.style.width = cRect.width + 'px';
    this.overlay.style.height = cRect.height + 'px';

    const sx = cRect.width / this.canvas.width;
    const sy = cRect.height / this.canvas.height;

    const vb = this._visualBounds();
    const corners = {
      tl: [vb.x, vb.y],
      tr: [vb.x + vb.w, vb.y],
      bl: [vb.x, vb.y + vb.h],
      br: [vb.x + vb.w, vb.y + vb.h]
    };

    const show = this.selected;
    for (const hEl of this.handles) {
      const [cx, cy] = corners[hEl.dataset.handle];
      hEl.style.left = (cx * sx - 7) + 'px';
      hEl.style.top = (cy * sy - 7) + 'px';
      hEl.style.display = show ? 'block' : 'none';
    }

    if (show) {
      const wcm = vb.w / this.scale;
      const hcm = vb.h / this.scale;
      this.labelEl.textContent = `${wcm.toFixed(1)} × ${hcm.toFixed(1)} cm`;
      this.labelEl.style.display = 'block';
      this.labelEl.style.left = (vb.x * sx) + 'px';
      this.labelEl.style.top = ((vb.y + vb.h) * sy + 6) + 'px';
    } else {
      this.labelEl.style.display = 'none';
    }
  }

  _bindEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      return {
        x: (t.clientX - rect.left) * sx,
        y: (t.clientY - rect.top) * sy
      };
    };

    const onDown = (e) => {
      if (!this.image) return;
      const p = getPos(e);

      const handle = this._hitHandle(p.x, p.y);
      if (handle) {
        e.preventDefault();
        this.selected = true;
        this.dragMode = 'resize-' + handle;
        const vb = this._visualBounds();
        this.dragStart = {
          x: p.x, y: p.y,
          cx: vb.cx, cy: vb.cy,
          visW: vb.w, visH: vb.h,
          handle
        };
        this._updateOverlay();
        this.render();
        return;
      }

      if (this._hitImage(p.x, p.y)) {
        e.preventDefault();
        this.selected = true;
        this.dragMode = 'move';
        this.dragStart = {
          x: p.x, y: p.y,
          origX: this.img.x, origY: this.img.y
        };
        this._updateOverlay();
        this.render();
      } else {
        if (this.selected) {
          this.selected = false;
          this._updateOverlay();
          this.render();
        }
      }
    };

    const onMove = (e) => {
      if (!this.dragMode || !this.dragStart) return;
      e.preventDefault();
      const p = getPos(e);
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;

      if (this.dragMode === 'move') {
        this.img.x = this.dragStart.origX + dx;
        this.img.y = this.dragStart.origY + dy;
        this._clampPosition();
      } else if (this.dragMode.startsWith('resize-')) {
        this._resizeFromHandle(this.dragStart.handle, dx, dy);
      }
      this.render();
    };

    const onUp = () => {
      if (this.dragMode) {
        this.dragMode = null;
        this.dragStart = null;
        this._updateOverlay();
        this.onImageChange();
      }
    };

    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    document.addEventListener('pointerdown', (e) => {
      if (!this.canvas.contains(e.target) && !this.overlay.contains(e.target)) {
        if (this.selected) {
          this.selected = false;
          this._updateOverlay();
          this.render();
        }
      }
    });

    window.addEventListener('resize', () => {
      this._resizeCanvas();
      if (this.image) this.fitImage();
      else this.render();
    });
  }

  _hitHandle(cx, cy) {
    const vb = this._visualBounds();
    const r = 14;
    const corners = {
      tl: [vb.x, vb.y],
      tr: [vb.x + vb.w, vb.y],
      bl: [vb.x, vb.y + vb.h],
      br: [vb.x + vb.w, vb.y + vb.h]
    };
    for (const [k, [hx, hy]] of Object.entries(corners)) {
      if (Math.abs(cx - hx) <= r && Math.abs(cy - hy) <= r) return k;
    }
    return null;
  }

  _hitImage(cx, cy) {
    const vb = this._visualBounds();
    return cx >= vb.x && cx <= vb.x + vb.w && cy >= vb.y && cy <= vb.y + vb.h;
  }

  _resizeFromHandle(handle, dx, dy) {
    const s = this.dragStart;

    let signX = 0, signY = 0;
    if (handle === 'tl') { signX = -1; signY = -1; }
    if (handle === 'tr') { signX = 1;  signY = -1; }
    if (handle === 'bl') { signX = -1; signY = 1;  }
    if (handle === 'br') { signX = 1;  signY = 1;  }

    let newVisW = s.visW + 2 * signX * dx;
    let newVisH = s.visH + 2 * signY * dy;

    const minSize = 20;
    newVisW = Math.max(minSize, newVisW);
    newVisH = Math.max(minSize, newVisH);

    if (this.keepAspect) {
      const ar = s.visW / s.visH;
      const changeW = Math.abs(newVisW - s.visW);
      const changeH = Math.abs(newVisH - s.visH);
      if (changeW >= changeH) {
        newVisH = newVisW / ar;
      } else {
        newVisW = newVisH * ar;
      }
    }

    const swap = this._isSwap();
    const localW = swap ? newVisH : newVisW;
    const localH = swap ? newVisW : newVisH;

    this.img.w = localW;
    this.img.h = localH;
    this.img.x = s.cx - localW / 2;
    this.img.y = s.cy - localH / 2;

    this._clampPosition();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}