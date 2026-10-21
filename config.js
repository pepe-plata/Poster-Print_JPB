export const CM_PER_INCH = 2.54;

export const PAPER_SIZES = {
  letter: { name: 'Carta', w: 21.59, h: 27.94 },
  a4:     { name: 'A4',    w: 21.00, h: 29.70 },
  legal:  { name: 'Oficio',w: 21.59, h: 35.56 }
};

export const POSTER_PRESETS = [
  { id: '2x2V', cols: 2, rows: 2, label: '2×2', orient: 'V' },
  { id: '2x3V', cols: 2, rows: 3, label: '2×3', orient: 'V' },
  { id: '3x3V', cols: 3, rows: 3, label: '3×3', orient: 'V' },
  { id: '3x2H', cols: 3, rows: 2, label: '3×2', orient: 'H' },
  { id: '2x4H', cols: 2, rows: 4, label: '2×4', orient: 'H' },
  { id: '2x5H', cols: 2, rows: 5, label: '2×5', orient: 'H' }
];

export const DEFAULT_MARGINS = {
  top: 0.3,
  bottom: 0.51,
  left: 0.64,
  right: 0.63
};

export const DPI = 300;
export const PX_PER_CM = DPI / CM_PER_INCH;