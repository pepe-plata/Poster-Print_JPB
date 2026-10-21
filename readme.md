# Poster Print JPB

Aplicación web progresiva (PWA) para imprimir una imagen en varias hojas (tipo póster), con generación de PDF multipágina. Funciona en Android y Windows (instalable desde el navegador), y opera offline tras la primera carga.

![PWA](https://img.shields.io/badge/PWA-installable-0ea5e9)
![Sin dependencias](https://img.shields.io/badge/deps-vanilla%20JS-informational)
![Licencia](https://img.shields.io/badge/license-MIT-green)

---

## Características

- **Tamaños de póster predefinidos agrupados**:
  - Cuadrado: 2×2, 3×3, 4×4, 5×5, 6×6, 7×7, 8×8
  - Horizontal: 2×1, 3×1, 3×2, 4×1, 4×2, 4×3, 5×1, 5×2, 5×3, 5×4, 6×1, 6×2, 6×3, 6×4, 6×5
  - Vertical: 1×2 … 1×8, 2×3 … 2×6, 3×4 … 3×8, 4×5 … 4×8
  - Personalizado (ancho × alto en cm o pulgadas; calcula hojas necesarias)
- **Tamaños de hoja**: Carta, A4, Oficio y Personalizado.
- **Márgenes configurables** por hoja (por defecto: 0.3 / 0.51 / 0.64 / 0.63 cm).
- **Canvas de previsualización** que muestra solo el **área imprimible** de cada hoja (sin márgenes) con líneas cyan de división.
- **Manipulación de la imagen**: mover, rotar 90°, flip horizontal/vertical, redimensionar con handles, centrar, ajustar al área.
- **Checkbox "Conservar relación de aspecto"** (aplica al escalado inicial y al redimensionado manual).
- **Tamaño manual de la imagen** (ancho/alto en cm) desde la sección 4.
- **PDF de salida**:
  - Una página por hoja, al tamaño real configurado.
  - Imagen recortada por hoja, contigua (canvas maestro → recortes exactos).
  - Marcas de corte en esquinas y numeración `n/total` fuera del área imprimible.
  - Renderizado a ~300 DPI.
- **Logging de diagnóstico** en la consola de Chrome al generar el PDF (tamaños, recortes, DPI efectivo por hoja, detección de escalado).
- **PWA**: manifest, service worker y splash de 2 s con `icons/icon-512.png`.
- **UI moderna en tema claro**, responsive, con menú hamburguesa para colapsar la barra lateral.

---

## Estructura del proyecto
