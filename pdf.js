// Generación del PDF multipágina con jsPDF
// Enfoque MAESTRO: se construye UN canvas del tamaño total del área imprimible
// dibujando la imagen con la misma transformación (caja local, rotación, flips)
// que se ve en pantalla. Luego cada hoja es un recorte EXACTO de ese canvas maestro,
// garantizando contigüidad perfecta entre hojas (sin huecos ni solapamientos).

import { PX_PER_CM } from './config.js';
import { createOffscreen } from './tools.js';

const { jsPDF } = window.jspdf;

const LOG_PREFIX = '[PDF]';

export async function generatePdf({ image, layout, paper, margins, imgTransform }) {
  const { cols, rows, cellWcm, cellHcm } = layout;
  const { w: paperW, h: paperH } = paper;
  const { top, bottom, left, right } = margins;
  const { x: tx, y: ty, w: tw, h: th, rotation, flipH, flipV } = imgTransform;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'cm',
    format: [paperW, paperH],
    compress: true
  });

  // --- Log: encabezado y datos de entrada ---
  console.groupCollapsed(
    `${LOG_PREFIX} Generación de PDF — ${cols}×${rows} hojas (${cols * rows} páginas)`
  );
  console.log(`${LOG_PREFIX} Hoja física (cm):`, { w: paperW, h: paperH });
  console.log(`${LOG_PREFIX} Márgenes (cm):`, { top, bottom, left, right });
  console.log(`${LOG_PREFIX} Área imprimible por hoja (cm):`, { w: cellWcm, h: cellHcm });
  console.log(
    `${LOG_PREFIX} Área total imprimible (cm):`,
    { w: cols * cellWcm, h: rows * cellHcm }
  );
  console.log(`${LOG_PREFIX} Caja local imagen (cm):`, { x: tx, y: ty, w: tw, h: th });
  console.log(`${LOG_PREFIX} Rotación:`, rotation, '| flipH:', flipH, '| flipV:', flipV);
  console.log(`${LOG_PREFIX} Centro imagen en área total (cm):`, {
    cx: tx + tw / 2,
    cy: ty + th / 2
  });
  console.log(`${LOG_PREFIX} PX_PER_CM (impresión):`, PX_PER_CM);

  // --- Canvas MAESTRO: área total imprimible en píxeles de impresión ---
  const totalWcm = cols * cellWcm;
  const totalHcm = rows * cellHcm;
  const masterW = Math.max(1, Math.round(totalWcm * PX_PER_CM));
  const masterH = Math.max(1, Math.round(totalHcm * PX_PER_CM));

  console.log(
    `${LOG_PREFIX} Canvas maestro (px):`,
    { w: masterW, h: masterH },
    '≈ (cm):',
    { w: masterW / PX_PER_CM, h: masterH / PX_PER_CM }
  );

  const master = createOffscreen(masterW, masterH);
  const mctx = master.getContext('2d');
  mctx.clearRect(0, 0, masterW, masterH);

  // Dibujar la imagen con la MISMA transformación que en el canvas visual:
  mctx.save();
  const cxPx = (tx + tw / 2) * PX_PER_CM;
  const cyPx = (ty + th / 2) * PX_PER_CM;
  mctx.translate(cxPx, cyPx);
  mctx.rotate((rotation * Math.PI) / 180);
  mctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  const wPx = tw * PX_PER_CM;
  const hPx = th * PX_PER_CM;
  mctx.drawImage(image, -wPx / 2, -hPx / 2, wPx, hPx);
  mctx.restore();

  console.log(
    `${LOG_PREFIX} Imagen dibujada en maestro (px):`,
    { w: wPx, h: hPx },
    '≈ (cm):',
    { w: wPx / PX_PER_CM, h: hPx / PX_PER_CM }
  );

  // --- Recorte por hoja ---
  const cellPxW = Math.max(1, Math.round(cellWcm * PX_PER_CM));
  const cellPxH = Math.max(1, Math.round(cellHcm * PX_PER_CM));

  console.log(
    `${LOG_PREFIX} Tamaño de celda (px):`,
    { w: cellPxW, h: cellPxH },
    '≈ (cm):',
    { w: cellPxW / PX_PER_CM, h: cellPxH / PX_PER_CM }
  );

  console.groupCollapsed(`${LOG_PREFIX} Detalle por hoja`);
  let first = true;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!first) doc.addPage([paperW, paperH], 'portrait');
      first = false;

      const pageNum = r * cols + c + 1;

      const cellX = c * cellPxW;
      const cellY = r * cellPxH;
      const wTile = Math.max(1, Math.min(cellPxW, masterW - cellX));
      const hTile = Math.max(1, Math.min(cellPxH, masterH - cellY));

      const tile = createOffscreen(wTile, hTile);
      const tctx = tile.getContext('2d');
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, wTile, hTile);
      tctx.drawImage(master, cellX, cellY, wTile, hTile, 0, 0, wTile, hTile);

      const dataUrl = tile.toDataURL('image/jpeg', 0.92);

      // Insertar en el área imprimible de la hoja.
      // Aquí NO debe haber escalado: el tile ya tiene el tamaño exacto de la celda
      // en píxeles de impresión, y se dibuja a cellWcm × cellHcm.
      doc.addImage(dataUrl, 'JPEG', left, top, cellWcm, cellHcm, undefined, 'FAST');

      // --- Log por hoja ---
      const cellXcm = c * cellWcm;
      const cellYcm = r * cellHcm;
      const dpiX = (wTile) / (cellWcm / 2.54);
      const dpiY = (hTile) / (cellHcm / 2.54);
      console.groupCollapsed(
        `${LOG_PREFIX} Hoja ${pageNum}/${rows * cols} — (fila ${r + 1}, col ${c + 1})`
      );
      console.log('Celda en área total (cm):', {
        x: cellXcm, y: cellYcm, w: cellWcm, h: cellHcm
      });
      console.log('Recorte en maestro (px):', {
        sx: cellX, sy: cellY, sw: wTile, sh: hTile
      });
      console.log('Recorte en maestro (cm):', {
        sx: cellX / PX_PER_CM,
        sy: cellY / PX_PER_CM,
        sw: wTile / PX_PER_CM,
        sh: hTile / PX_PER_CM
      });
      console.log('Tile (px):', { w: wTile, h: hTile });
      console.log('Dibujado en PDF a (cm):', { w: cellWcm, h: cellHcm });
      console.log('DPI efectivo del tile:', {
        x: Number(dpiX.toFixed(2)),
        y: Number(dpiY.toFixed(2))
      });
      // Comparación para detectar escalado
      const expectedPxW = cellWcm * PX_PER_CM;
      const expectedPxH = cellHcm * PX_PER_CM;
      const diffW = wTile - expectedPxW;
      const diffH = hTile - expectedPxH;
      console.log('Escalado detectado:', {
        esperadoPx: { w: Number(expectedPxW.toFixed(3)), h: Number(expectedPxH.toFixed(3)) },
        realPx: { w: wTile, h: hTile },
        deltaPx: { w: Number(diffW.toFixed(3)), h: Number(diffH.toFixed(3)) },
        nota: (Math.abs(diffW) < 1.5 && Math.abs(diffH) < 1.5)
          ? 'OK (≤ 1.5 px de redondeo)'
          : 'REVISAR: diferencia notable, puede haber escalado'
      });
      console.groupEnd();

      drawCropMarks(doc, paperW, paperH, margins);
      drawPageLabel(doc, pageNum, rows * cols, paperW, paperH, margins);
    }
  }
  console.groupEnd(); // detalle por hoja

  const blob = doc.output('blob');
  console.log(`${LOG_PREFIX} PDF generado:`, {
    bytes: blob.size,
    kb: Number((blob.size / 1024).toFixed(2)),
    paginas: rows * cols
  });
  console.groupEnd(); // grupo raíz

  return blob;
}

function drawCropMarks(doc, pw, ph, m) {
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.01);
  const len = 0.4;
  doc.line(m.left, m.top - 0.15, m.left, m.top - 0.15 - len);
  doc.line(m.left - 0.15, m.top, m.left - 0.15 - len, m.top);
  doc.line(pw - m.right, m.top - 0.15, pw - m.right, m.top - 0.15 - len);
  doc.line(pw - m.right + 0.15, m.top, pw - m.right + 0.15 + len, m.top);
  doc.line(m.left, ph - m.bottom + 0.15, m.left, ph - m.bottom + 0.15 + len);
  doc.line(m.left - 0.15, ph - m.bottom, m.left - 0.15 - len, ph - m.bottom);
  doc.line(pw - m.right, ph - m.bottom + 0.15, pw - m.right, ph - m.bottom + 0.15 + len);
  doc.line(pw - m.right + 0.15, ph - m.bottom, pw - m.right + 0.15 + len, ph - m.bottom);
}

function drawPageLabel(doc, page, total, pw, ph, m) {
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const text = `${page} / ${total}`;
  const tw = doc.getTextWidth(text);
  const x = pw - m.right - tw;
  const y = ph - m.bottom + 0.35;
  doc.text(text, x, y);
}